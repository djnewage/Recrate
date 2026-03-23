const admin = require('firebase-admin');
const logger = require('./logger');

function getDb() {
  try {
    return admin.firestore();
  } catch (e) {
    return null;
  }
}

function toISOString(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (val.toDate) return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  return null;
}

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
    display_name: data.display_name || null,
    app_version: data.app_version || null,
    platform: data.platform || null,
    last_active_at: toISOString(data.last_active_at),
    sign_in_method: data.sign_in_method || null,
    login_count: data.login_count || 0,
    created_at: toISOString(data.created_at),
    updated_at: toISOString(data.updated_at),
  };
}

async function getUser(docId) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('users').doc(docId).get();
  return docToUser(doc);
}

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

async function getUserByLegacyId(legacyId) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('users').doc(legacyId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data.firebase_uid) return docToUser(doc);
  return null;
}

async function getUserByFirebaseUidOrId(identifier) {
  const db = getDb();
  if (!db) return null;
  const doc = await db.collection('users').doc(identifier).get();
  if (doc.exists) return docToUser(doc);
  const snap = await db.collection('users')
    .where('firebase_uid', '==', identifier)
    .limit(1)
    .get();
  if (!snap.empty) return docToUser(snap.docs[0]);
  return null;
}

async function createUser(docId, data) {
  const db = getDb();
  if (!db) return;
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('users').doc(docId).set({
    ...data,
    created_at: data.created_at || now,
    updated_at: now,
  });
}

async function updateUser(docId, data) {
  const db = getDb();
  if (!db) return;
  await db.collection('users').doc(docId).update({
    ...data,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

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
}

// --------------- Monthly Quotas (subcollection) ---------------

async function getMonthlyQuota(userId, yearMonth, feature) {
  const db = getDb();
  if (!db) return null;
  const docId = `${yearMonth}_${feature}`;
  const doc = await db.collection('users').doc(userId)
    .collection('monthly_quotas').doc(docId).get();
  if (!doc.exists) return null;
  return doc.data();
}

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

async function cleanupOldRecords(monthsToKeep = 3) {
  const db = getDb();
  if (!db) return;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsToKeep);
  const cutoffMonth = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

  const quotaSnap = await db.collectionGroup('monthly_quotas')
    .where('year_month', '<', cutoffMonth)
    .get();

  const usageSnap = await db.collectionGroup('ai_usage')
    .where('created_at', '<', admin.firestore.Timestamp.fromDate(cutoff))
    .get();

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

function isAvailable() {
  return getDb() !== null;
}

module.exports = {
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
