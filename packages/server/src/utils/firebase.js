const admin = require('firebase-admin');
const logger = require('./logger');

let firebaseApp = null;

/**
 * Initialize Firebase Admin SDK
 * Supports both service account JSON and Application Default Credentials
 */
function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim();

  if (!projectId) {
    logger.warn('[Firebase] FIREBASE_PROJECT_ID not set - token verification disabled');
    return null;
  }

  try {
    // Use Application Default Credentials or service account
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccount) {
      // Parse JSON from environment variable
      const credentials = JSON.parse(serviceAccount.trim());
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(credentials),
        projectId,
      });
      logger.success('[Firebase] Admin SDK initialized with service account (env)');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account key file pointed to by GOOGLE_APPLICATION_CREDENTIALS
      const credentials = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(credentials),
        projectId,
      });
      logger.success('[Firebase] Admin SDK initialized with service account (file)');
    } else {
      // Use default credentials (works in Google Cloud environments)
      firebaseApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
      logger.success('[Firebase] Admin SDK initialized with default credentials');
    }

    return firebaseApp;
  } catch (error) {
    logger.error('[Firebase] Failed to initialize:', error.message);
    return null;
  }
}

/**
 * Verify a Firebase ID token
 * @param {string} idToken - The Firebase ID token from the client
 * @returns {Promise<object|null>} Decoded token with uid, email, etc. or null if invalid
 */
async function verifyIdToken(idToken) {
  if (!firebaseApp) {
    return null; // Firebase not configured
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken; // Contains uid, email, email_verified, etc.
  } catch (error) {
    // Don't log full error for expired tokens (common case)
    if (error.code === 'auth/id-token-expired') {
      logger.debug('[Firebase] Token expired');
    } else {
      logger.warn('[Firebase] Token verification failed:', error.message);
    }
    return null;
  }
}

/**
 * Check if Firebase Admin SDK is initialized
 * @returns {boolean}
 */
function isInitialized() {
  return firebaseApp !== null;
}

/**
 * Get Firestore instance (lazy init via admin SDK)
 * @returns {FirebaseFirestore.Firestore|null}
 */
function getFirestore() {
  if (!firebaseApp) return null;
  return admin.firestore();
}

module.exports = {
  initializeFirebase,
  verifyIdToken,
  isInitialized,
  getFirestore,
};
