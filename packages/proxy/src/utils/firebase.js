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

module.exports = { initializeFirebase, isInitialized };
