/**
 * Firebase configuration and initialization
 * Firebase is auto-initialized by the Expo plugin from GoogleService-Info.plist / google-services.json
 * This file exports the auth instance for use throughout the app
 */

import auth from '@react-native-firebase/auth';

// Export Firebase Auth instance
export const firebaseAuth = auth();

// Analytics and Crashlytics are not natively linked in the current build.
// The JS packages exist but calling methods throws since the native modules aren't installed.
// Set to null so all callsites safely no-op.
export const firebaseCrashlytics = null;
export const firebaseAnalytics = null;

/**
 * Set user ID across Firebase services (Crashlytics, Analytics)
 * @param {string|null} userId - Firebase UID or null to clear
 * @param {string|null} email - User email for additional context
 */
export const setFirebaseUser = async (userId, email = null) => {
  try {
    if (userId) {
      // Set user ID in Crashlytics (if available)
      if (firebaseCrashlytics) {
        await firebaseCrashlytics.setUserId(userId);
        if (email) {
          await firebaseCrashlytics.setAttributes({ email });
        }
      }

      // Set user ID in Analytics (if available)
      if (firebaseAnalytics) {
        await firebaseAnalytics.setUserId(userId);
      }

      console.log('[Firebase] User context set:', userId);
    } else {
      // Clear user context
      if (firebaseCrashlytics) {
        await firebaseCrashlytics.setUserId('');
      }
      if (firebaseAnalytics) {
        await firebaseAnalytics.setUserId(null);
      }
      console.log('[Firebase] User context cleared');
    }
  } catch (error) {
    console.error('[Firebase] Failed to set user context:', error);
  }
};

/**
 * Log a custom event to Firebase Analytics
 * @param {string} eventName - Name of the event
 * @param {Object} params - Event parameters
 */
export const logEvent = async (eventName, params = {}) => {
  if (!firebaseAnalytics) return;

  try {
    await firebaseAnalytics.logEvent(eventName, params);
  } catch (error) {
    console.error('[Firebase] Failed to log event:', error);
  }
};

/**
 * Log a non-fatal error to Crashlytics
 * @param {Error} error - The error to log
 * @param {Object} context - Additional context
 */
export const logError = async (error, context = {}) => {
  if (!firebaseCrashlytics) return;

  try {
    // Set context as attributes
    if (Object.keys(context).length > 0) {
      await firebaseCrashlytics.setAttributes(context);
    }

    // Record the error
    await firebaseCrashlytics.recordError(error);
  } catch (err) {
    console.error('[Firebase] Failed to log error:', err);
  }
};

export default {
  auth: firebaseAuth,
  crashlytics: firebaseCrashlytics,
  analytics: firebaseAnalytics,
  setFirebaseUser,
  logEvent,
  logError,
};
