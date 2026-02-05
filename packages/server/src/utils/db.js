const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./logger');

let db = null;
let SQL = null;

/**
 * Get database file path - uses platform-aware cache directory
 */
function getDbPath() {
  let cacheDir;

  if (process.env.CACHE_DIR) {
    cacheDir = process.env.CACHE_DIR;
  } else {
    const platform = os.platform();
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
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  return path.join(cacheDir, 'recrate.db');
}

/**
 * Save database to disk (call after writes)
 */
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(getDbPath(), buffer);
  logger.debug('[DB] Database saved to disk');
}

// Auto-save interval (every 30 seconds if dirty)
let isDirty = false;
let autoSaveInterval = null;

function startAutoSave() {
  if (autoSaveInterval) return;
  autoSaveInterval = setInterval(() => {
    if (isDirty && db) {
      saveDatabase();
      isDirty = false;
    }
  }, 30000);
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

/**
 * Initialize the database
 */
async function initialize() {
  logger.info('[DB] Initializing database...');

  // Initialize sql.js
  SQL = await initSqlJs();

  // Load existing database or create new one
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    logger.info('[DB] Loaded existing database');
  } else {
    db = new SQL.Database();
    logger.info('[DB] Created new database');
  }

  // Users table - keyed by Firebase UID for cross-device identity
  // Supports both firebase_uid (primary) and legacy device_id (migration)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firebase_uid TEXT UNIQUE,
      device_id TEXT,
      email TEXT,
      tier TEXT NOT NULL DEFAULT 'trial',
      trial_started_at TEXT,
      trial_ends_at TEXT,
      revenuecat_app_user_id TEXT,
      subscription_id TEXT,
      subscription_product_id TEXT,
      subscription_started_at TEXT,
      subscription_expires_at TEXT,
      subscription_will_renew INTEGER DEFAULT 0,
      subscription_cancelled_at TEXT,
      byok_key_hash TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Run migrations FIRST for existing databases (adds columns like firebase_uid)
  // This must happen before creating indexes on those columns
  runMigrations();

  // Now create indexes on users table (all columns exist after migrations)
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_revenuecat ON users(revenuecat_app_user_id)`);

  // AI Usage tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      device_id TEXT,
      feature TEXT NOT NULL,
      tier TEXT NOT NULL,
      is_byok INTEGER DEFAULT 0,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage(feature)`);

  // Monthly quota tracking (materialized for performance)
  db.run(`
    CREATE TABLE IF NOT EXISTS monthly_quotas (
      user_id TEXT NOT NULL,
      year_month TEXT NOT NULL,
      feature TEXT NOT NULL,
      included_usage INTEGER DEFAULT 0,
      byok_usage INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, year_month, feature)
    )
  `);

  // Cue points table for storing track cue points (Q points)
  db.run(`
    CREATE TABLE IF NOT EXISTS cue_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      bank_number INTEGER NOT NULL CHECK (bank_number BETWEEN 1 AND 8),
      position REAL NOT NULL CHECK (position >= 0),
      color TEXT,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(track_id, bank_number)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_cue_points_track ON cue_points(track_id)`);

  // Save initial schema
  saveDatabase();

  // Start auto-save interval
  startAutoSave();

  logger.success('[DB] Database initialized');
}

/**
 * Run database migrations for schema changes
 */
function runMigrations() {
  logger.info('[DB] Checking for migrations...');

  // Get existing columns in users table
  const tableInfo = db.exec("PRAGMA table_info(users)");
  const existingColumns = tableInfo[0]?.values?.map(row => row[1]) || [];

  // Migration: Add firebase_uid column if missing
  if (!existingColumns.includes('firebase_uid')) {
    logger.info('[DB] Migration: Adding firebase_uid column');
    db.run('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)');
  }

  // Migration: Add device_id column if missing (for backwards compatibility tracking)
  if (!existingColumns.includes('device_id')) {
    logger.info('[DB] Migration: Adding device_id column');
    db.run('ALTER TABLE users ADD COLUMN device_id TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id)');

    // Copy existing id (which was device_id) to device_id column
    db.run('UPDATE users SET device_id = id WHERE device_id IS NULL');
  }

  // Migration: Add RevenueCat columns if missing
  if (!existingColumns.includes('revenuecat_app_user_id')) {
    logger.info('[DB] Migration: Adding RevenueCat columns');
    db.run('ALTER TABLE users ADD COLUMN revenuecat_app_user_id TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_users_revenuecat ON users(revenuecat_app_user_id)');
  }

  if (!existingColumns.includes('subscription_id')) {
    db.run('ALTER TABLE users ADD COLUMN subscription_id TEXT');
  }

  if (!existingColumns.includes('subscription_product_id')) {
    db.run('ALTER TABLE users ADD COLUMN subscription_product_id TEXT');
  }

  if (!existingColumns.includes('subscription_expires_at')) {
    db.run('ALTER TABLE users ADD COLUMN subscription_expires_at TEXT');
  }

  if (!existingColumns.includes('subscription_will_renew')) {
    db.run('ALTER TABLE users ADD COLUMN subscription_will_renew INTEGER DEFAULT 0');
  }

  if (!existingColumns.includes('subscription_cancelled_at')) {
    db.run('ALTER TABLE users ADD COLUMN subscription_cancelled_at TEXT');
  }

  logger.info('[DB] Migrations complete');
}

/**
 * Run a query and mark dirty for auto-save
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 */
function run(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  db.run(sql, params);
  isDirty = true;
}

/**
 * Get single row from query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Object|null} Row object or null
 */
function get(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

/**
 * Get all rows from query
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Array} Array of row objects
 */
function all(sql, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Check if database is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return db !== null;
}

/**
 * Graceful shutdown - save database and close
 */
function close() {
  stopAutoSave();
  if (db) {
    if (isDirty) {
      saveDatabase();
    }
    db.close();
    db = null;
    logger.info('[DB] Database closed');
  }
}

module.exports = {
  initialize,
  run,
  get,
  all,
  close,
  saveDatabase,
  isInitialized,
  getDbPath,
};
