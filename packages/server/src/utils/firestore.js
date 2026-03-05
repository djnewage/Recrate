const admin = require('firebase-admin');
const logger = require('./logger');

/**
 * Get Firestore instance (lazy init via admin SDK)
 * @returns {FirebaseFirestore.Firestore|null}
 */
function getDb() {
  try {
    return admin.firestore();
  } catch (e) {
    return null;
  }
}

/**
 * Convert Firestore doc snapshot to a plain user object
 * matching the shape the rest of the codebase expects (snake_case fields).
 */
function docToUser(doc) {
  if (!doc || !doc.exists) return null;
  const data = doc.data();
  return {
    id: doc.id,
    firebase_uid: data.firebase_uid || null,
    device_id: data.device_id || null,
    email: data.email || null,
    tier: data.tier || 'trial',
    trial_started_at: toISOString(data.trial_started_at),
    trial_ends_at: toISOString(data.trial_ends_at),
    revenuecat_app_user_id: data.revenuecat_app_user_id || null,
    subscription_id: data.subscription_id || null,
    subscription_product_id: data.subscription_product_id || null,
    subscription_started_at: toISOString(data.subscription_started_at),
    subscription_expires_at: toISOString(data.subscription_expires_at),
    subscription_will_renew: data.subscription_will_renew || 0,
    subscription_cancelled_at: toISOString(data.subscription_cancelled_at),
    byok_key_hash: data.byok_key_hash || null,
    created_at: toISOString(data.created_at),
    updated_at: toISOString(data.updated_at),
  };
}

/**
 * Convert Firestore Timestamp or ISO string to ISO string
 */
function toISOString(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.toDate) return val.toDate().toISOString(); // Firestore Timestamp
  if (val instanceof Date) return val.toISOString();
  return null;
}

// --------------- Users ---------------

/**
 * Get user by their Firestore doc ID (typically firebase_uid)
 */
async function getUser(docId) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('users').doc(docId).get();
  return docToUser(doc);
}

/**
 * Find user by device_id field
 */
async function getUserByDeviceId(deviceId) {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection('users')
    .where('device_id', '==', deviceId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return docToUser(snap.docs[0]);
}

/**
 * Find user by device_id where firebase_uid is not set (for migration)
 */
async function getDeviceUserWithoutFirebase(deviceId) {
  const db = getDb();
  if (!db) return null;

  // Check by device_id first
  let snap = await db.collection('users')
    .where('device_id', '==', deviceId)
    .where('firebase_uid', '==', null)
    .limit(1)
    .get();

  if (!snap.empty) return docToUser(snap.docs[0]);

  // Fallback: check by doc ID (legacy device:{deviceId} pattern)
  const legacyDoc = await db.collection('users').doc(`device:${deviceId}`).get();
  if (legacyDoc.exists) {
    const data = legacyDoc.data();
    if (!data.firebase_uid) return docToUser(legacyDoc);
  }

  // Also try raw deviceId as doc ID
  const rawDoc = await db.collection('users').doc(deviceId).get();
  if (rawDoc.exists) {
    const data = rawDoc.data();
    if (!data.firebase_uid) return docToUser(rawDoc);
  }

  return null;
}

/**
 * Find user by legacy ID (used in auth.js and webhooks.js for backwards compat).
 * Looks up by doc ID directly.
 */
async function getUserByLegacyId(legacyId) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('users').doc(legacyId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data.firebase_uid) return docToUser(doc);
  return null;
}

/**
 * Create a new user document
 */
async function createUser(docId, data) {
  const db = getDb();
  if (!db) return;
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('users').doc(docId).set({
    ...data,
    created_at: data.created_at || now,
    updated_at: now,
  });
  logger.debug(`[Firestore] Created user: ${docId}`);
}

/**
 * Update user fields
 */
async function updateUser(docId, data) {
  const db = getDb();
  if (!db) return;
  await db.collection('users').doc(docId).update({
    ...data,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.debug(`[Firestore] Updated user: ${docId}`);
}

/**
 * Link a device-only user doc to a Firebase UID.
 * Copies data to new doc keyed by firebaseUid, deletes old doc.
 */
async function linkFirebaseUid(oldDocId, newFirebaseUid, extraData = {}) {
  const db = getDb();
  if (!db) return;

  const oldDoc = await db.collection('users').doc(oldDocId).get();
  if (!oldDoc.exists) return;

  const batch = db.batch();
  const newRef = db.collection('users').doc(newFirebaseUid);
  batch.set(newRef, {
    ...oldDoc.data(),
    firebase_uid: newFirebaseUid,
    ...extraData,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.delete(db.collection('users').doc(oldDocId));
  await batch.commit();

  logger.info(`[Firestore] Linked user ${oldDocId} -> ${newFirebaseUid}`);
}

/**
 * Find user by firebase_uid OR by doc ID (for webhook alias handling)
 */
async function getUserByFirebaseUidOrId(identifier) {
  const db = getDb();
  if (!db) return null;

  // Try doc ID first
  const doc = await db.collection('users').doc(identifier).get();
  if (doc.exists) return docToUser(doc);

  // Try firebase_uid field query (for cases where doc ID differs)
  const snap = await db.collection('users')
    .where('firebase_uid', '==', identifier)
    .limit(1)
    .get();
  if (!snap.empty) return docToUser(snap.docs[0]);

  return null;
}

// --------------- Monthly Quotas (subcollection) ---------------

/**
 * Get monthly quota for a user/feature
 */
async function getMonthlyQuota(userId, yearMonth, feature) {
  const db = getDb();
  if (!db) return null;
  const docId = `${yearMonth}_${feature}`;
  const doc = await db.collection('users').doc(userId)
    .collection('monthly_quotas').doc(docId).get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * Increment quota counter using a transaction (replaces UPSERT pattern)
 */
async function incrementQuota(userId, yearMonth, feature, isByok) {
  const db = getDb();
  if (!db) return;
  const docId = `${yearMonth}_${feature}`;
  const ref = db.collection('users').doc(userId)
    .collection('monthly_quotas').doc(docId);

  const field = isByok ? 'byok_usage' : 'included_usage';

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (doc.exists) {
      tx.update(ref, {
        [field]: admin.firestore.FieldValue.increment(1),
      });
    } else {
      tx.set(ref, {
        year_month: yearMonth,
        feature,
        included_usage: isByok ? 0 : 1,
        byok_usage: isByok ? 1 : 0,
      });
    }
  });
}

/**
 * Get all monthly quotas for a user in a given month
 */
async function getAllMonthlyQuotas(userId, yearMonth) {
  const db = getDb();
  if (!db) return [];
  const snap = await db.collection('users').doc(userId)
    .collection('monthly_quotas')
    .where('year_month', '==', yearMonth)
    .get();
  return snap.docs.map(d => d.data());
}

// --------------- AI Usage (subcollection) ---------------

/**
 * Record an AI usage event
 */
async function recordAiUsage(userId, data) {
  const db = getDb();
  if (!db) return;
  await db.collection('users').doc(userId)
    .collection('ai_usage').add({
      ...data,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// --------------- Cleanup ---------------

/**
 * Clean up old monthly_quotas and ai_usage records
 */
async function cleanupOldRecords(monthsToKeep = 3) {
  const db = getDb();
  if (!db) return;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsToKeep);
  const cutoffMonth = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  // Use collection group queries for subcollections
  const quotaSnap = await db.collectionGroup('monthly_quotas')
    .where('year_month', '<', cutoffMonth)
    .get();

  const usageSnap = await db.collectionGroup('ai_usage')
    .where('created_at', '<', admin.firestore.Timestamp.fromDate(cutoff))
    .get();

  // Batch delete (max 500 per batch)
  const allDocs = [...quotaSnap.docs, ...usageSnap.docs];
  const batches = [];
  let batch = db.batch();
  let count = 0;

  for (const doc of allDocs) {
    batch.delete(doc.ref);
    count++;
    if (count >= 500) {
      batches.push(batch);
      batch = db.batch();
      count = 0;
    }
  }
  if (count > 0) batches.push(batch);

  await Promise.all(batches.map(b => b.commit()));
  logger.info(`[Firestore] Cleaned up ${allDocs.length} old records (cutoff: ${cutoffMonth})`);
}

// --------------- Utility ---------------

/**
 * Check if Firestore is available
 */
function isAvailable() {
  return getDb() !== null;
}

module.exports = {
  getDb,
  getUser,
  getUserByDeviceId,
  getDeviceUserWithoutFirebase,
  getUserByLegacyId,
  getUserByFirebaseUidOrId,
  createUser,
  updateUser,
  linkFirebaseUid,
  getMonthlyQuota,
  incrementQuota,
  getAllMonthlyQuotas,
  recordAiUsage,
  cleanupOldRecords,
  isAvailable,
};
