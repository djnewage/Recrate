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
 * Look up whether a UID corresponds to a real Firebase Auth user. Used to block
 * fabricated identities from minting trials / spending the shared AI key on the
 * desktop path (which forwards a UID string, not a verifiable token).
 *
 * Returns a conclusive status so callers can fail *closed* on a genuine
 * "user does not exist" but fail *open* on a transient Auth error (so a Firebase
 * outage never 403s a legitimate user):
 *   'exists'    — the user is real
 *   'not_found' — the user definitively does not exist (or uid invalid)
 *   'error'     — lookup could not be completed (Firebase down, not initialized)
 * @param {string} uid
 * @returns {Promise<'exists'|'not_found'|'error'>}
 */
async function lookupFirebaseUser(uid) {
  if (!firebaseApp) return 'error';
  if (!uid) return 'not_found';
  try {
    await admin.auth().getUser(uid);
    return 'exists';
  } catch (error) {
    if (error && (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-uid')) {
      return 'not_found';
    }
    logger.warn(`[Firebase] User lookup error for ${uid}: ${error.message}`);
    return 'error';
  }
}

module.exports = { initializeFirebase, isInitialized, verifyIdToken, lookupFirebaseUser };
