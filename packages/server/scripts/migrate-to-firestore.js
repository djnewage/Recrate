#!/usr/bin/env node
/**
 * Migration script: SQLite → Firestore
 *
 * Reads existing users, monthly_quotas, and ai_usage from SQLite
 * and batch-writes them to Firestore.
 *
 * Usage:
 *   FIREBASE_PROJECT_ID=recrate-app \
 *   FIREBASE_SERVICE_ACCOUNT_KEY='...' \
 *   node packages/server/scripts/migrate-to-firestore.js
 *
 * Options:
 *   --dry-run   Print what would be written without actually writing
 */

const admin = require('firebase-admin');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DRY_RUN = process.argv.includes('--dry-run');

// ---- helpers ----

function getDbPath() {
  if (process.env.CACHE_DIR) {
    return path.join(process.env.CACHE_DIR, 'recrate.db');
  }
  const platform = os.platform();
  let cacheDir;
  if (platform === 'darwin') {
    cacheDir = path.join(os.homedir(), 'Library', 'Application Support', 'Recrate');
  } else if (platform === 'win32') {
    cacheDir = path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Recrate'
    );
  } else {
    cacheDir = path.join(os.homedir(), '.config', 'recrate');
  }
  return path.join(cacheDir, 'recrate.db');
}

function allRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function tableExists(db, name) {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?");
  stmt.bind([name]);
  const exists = stmt.step();
  stmt.free();
  return exists;
}

// ---- main ----

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== MIGRATING ===');

  // 1. Init Firebase
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID env var required');
    process.exit(1);
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
      projectId,
    });
  } else {
    admin.initializeApp({ projectId });
  }
  const firestore = admin.firestore();

  // 2. Open SQLite
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`SQLite database not found at ${dbPath}`);
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const sqlDb = new SQL.Database(fs.readFileSync(dbPath));
  console.log(`Opened SQLite database: ${dbPath}`);

  // 3. Read users
  if (!tableExists(sqlDb, 'users')) {
    console.log('No users table found — nothing to migrate.');
    process.exit(0);
  }

  const users = allRows(sqlDb, 'SELECT * FROM users');
  console.log(`Found ${users.length} users`);

  // 4. Read monthly_quotas
  const quotas = tableExists(sqlDb, 'monthly_quotas')
    ? allRows(sqlDb, 'SELECT * FROM monthly_quotas')
    : [];
  console.log(`Found ${quotas.length} monthly_quota records`);

  // 5. Read ai_usage
  const usages = tableExists(sqlDb, 'ai_usage')
    ? allRows(sqlDb, 'SELECT * FROM ai_usage')
    : [];
  console.log(`Found ${usages.length} ai_usage records`);

  // 6. Build Firestore writes
  const MAX_BATCH = 500;
  let batchOps = [];
  let totalOps = 0;

  for (const user of users) {
    // Determine doc ID: prefer firebase_uid, else device:{device_id}
    const docId = user.firebase_uid || `device:${user.device_id || user.id}`;

    const userData = {
      firebase_uid: user.firebase_uid || null,
      device_id: user.device_id || null,
      email: user.email || null,
      tier: user.tier || 'trial',
      trial_started_at: user.trial_started_at || null,
      trial_ends_at: user.trial_ends_at || null,
      revenuecat_app_user_id: user.revenuecat_app_user_id || null,
      subscription_id: user.subscription_id || null,
      subscription_product_id: user.subscription_product_id || null,
      subscription_started_at: user.subscription_started_at || null,
      subscription_expires_at: user.subscription_expires_at || null,
      subscription_will_renew: user.subscription_will_renew || 0,
      subscription_cancelled_at: user.subscription_cancelled_at || null,
      byok_key_hash: user.byok_key_hash || null,
      created_at: user.created_at || new Date().toISOString(),
      updated_at: user.updated_at || new Date().toISOString(),
      _migrated_from_sqlite_id: user.id, // keep original ID for reference
    };

    batchOps.push({ type: 'set', ref: firestore.collection('users').doc(docId), data: userData });

    // Subcollection: monthly_quotas for this user
    const userQuotas = quotas.filter(q => q.user_id === user.id || q.user_id === user.firebase_uid);
    for (const q of userQuotas) {
      const qDocId = `${q.year_month}_${q.feature}`;
      batchOps.push({
        type: 'set',
        ref: firestore.collection('users').doc(docId).collection('monthly_quotas').doc(qDocId),
        data: {
          year_month: q.year_month,
          feature: q.feature,
          included_usage: q.included_usage || 0,
          byok_usage: q.byok_usage || 0,
        },
      });
    }

    // Subcollection: ai_usage for this user
    const userUsages = usages.filter(u => u.user_id === user.id || u.user_id === user.firebase_uid);
    for (const u of userUsages) {
      batchOps.push({
        type: 'add',
        ref: firestore.collection('users').doc(docId).collection('ai_usage'),
        data: {
          device_id: u.device_id || null,
          feature: u.feature,
          tier: u.tier,
          is_byok: !!u.is_byok,
          tokens_in: u.tokens_in || 0,
          tokens_out: u.tokens_out || 0,
          created_at: u.created_at || new Date().toISOString(),
        },
      });
    }
  }

  totalOps = batchOps.length;
  console.log(`Total Firestore operations: ${totalOps}`);

  if (DRY_RUN) {
    console.log('\nDry run — no writes performed.');
    for (const op of batchOps.slice(0, 20)) {
      const path = op.ref.path || `${op.ref.path}/<auto-id>`;
      console.log(`  ${op.type.toUpperCase()} ${path}`);
    }
    if (totalOps > 20) console.log(`  ... and ${totalOps - 20} more`);
    process.exit(0);
  }

  // 7. Execute in batches of 500
  let written = 0;
  for (let i = 0; i < batchOps.length; i += MAX_BATCH) {
    const chunk = batchOps.slice(i, i + MAX_BATCH);
    const batch = firestore.batch();

    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data);
      } else if (op.type === 'add') {
        // For 'add', we create a new doc ref
        const newRef = op.ref.doc();
        batch.set(newRef, op.data);
      }
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  Written ${written}/${totalOps}`);
  }

  console.log(`\nMigration complete! ${written} documents written to Firestore.`);
  sqlDb.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
