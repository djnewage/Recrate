const admin = require('firebase-admin');
const logger = require('./logger');

let firebaseApp = null;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();

  if (!projectId) {
    logger.warn('[Firebase] FIREBASE_PROJECT_ID not set - webhooks disabled');
    return null;
  }

  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccount) {
      const credentials = JSON.parse(serviceAccount.trim());
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(credentials),
        projectId,
      });
      logger.info('[Firebase] Admin SDK initialized with service account (env)');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credentials = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(credentials),
        projectId,
      });
      logger.info('[Firebase] Admin SDK initialized with service account (file)');
    } else {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      logger.info('[Firebase] Admin SDK initialized with default credentials');
    }

    return firebaseApp;
  } catch (error) {
    logger.error('[Firebase] Failed to initialize:', error.message);
    return null;
  }
}

function isInitialized() {
  return firebaseApp !== null;
}

/**
 * Verify a Firebase ID token and return the decoded claims.
 * Throws if the token is missing/invalid/expired, so callers can map it to a 401.
 * @param {string} idToken
 * @returns {Promise<admin.auth.DecodedIdToken>}
 */
async function verifyIdToken(idToken) {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized');
  }
  return admin.auth().verifyIdToken(idToken);
}

/**
 * Whether a UID corresponds to a real Firebase Auth user. Used to block
 * fabricated identities from minting trials / spending the shared AI key on
 * the desktop path (which forwards a UID string, not a verifiable token).
 * Returns false on any lookup failure (unknown user, Firebase down, etc.).
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
async function firebaseUserExists(uid) {
  if (!firebaseApp || !uid) return false;
  try {
    await admin.auth().getUser(uid);
    return true;
  } catch {
    return false;
  }
}

module.exports = { initializeFirebase, isInitialized, verifyIdToken, firebaseUserExists };
