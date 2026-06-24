/**
 * Firebase Authentication Service
 * Handles Apple, Google, and Email/Password authentication
 */

import { Platform } from 'react-native';
import auth from '@react-native-firebase/auth';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import apiService from './api';

// Configure Google Sign-In
// The webClientId is the OAuth 2.0 Client ID from Firebase Console
// This must match the Firebase project (recrate-app, project number 666443636006)
const GOOGLE_WEB_CLIENT_ID = '666443636006-v6gcsq168r0lpkmlehq0tmg6hfdfv4cd.apps.googleusercontent.com';
// iOS Client ID from GoogleService-Info.plist (same as web client for Firebase projects)
const GOOGLE_IOS_CLIENT_ID = '666443636006-v6gcsq168r0lpkmlehq0tmg6hfdfv4cd.apps.googleusercontent.com';

let googleSignInConfigured = false;

/**
 * Configure Google Sign-In SDK
 */
const configureGoogleSignIn = () => {
  if (googleSignInConfigured) return;

  try {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : undefined,
      offlineAccess: false,
    });
    googleSignInConfigured = true;
    console.log('[AuthService] Google Sign-In configured');
  } catch (error) {
    console.error('[AuthService] Failed to configure Google Sign-In:', error);
  }
};

/**
 * Error messages for user display
 */
const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  default: 'An error occurred. Please try again.',
};

/**
 * Get user-friendly error message
 */
const getErrorMessage = (error) => {
  const code = error?.code || 'default';
  return AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES.default;
};

/**
 * Authentication Service
 */
const AuthService = {
  /**
   * Initialize the auth service
   */
  initialize: () => {
    configureGoogleSignIn();
  },

  /**
   * Get the current Firebase user
   * @returns {Object|null} Firebase user object or null
   */
  getCurrentUser: () => {
    return auth().currentUser;
  },

  /**
   * Subscribe to auth state changes
   * @param {Function} callback - Called with user object on auth state change
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChanged: (callback) => {
    return auth().onAuthStateChanged(callback);
  },

  /**
   * Sign in with Apple
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  signInWithApple: async () => {
    try {
      // Check if Apple authentication is available
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        return {
          success: false,
          error: 'Apple Sign-In is not available on this device.',
        };
      }

      // Generate secure nonce for Firebase
      const rawNonce = Array.from(
        { length: 32 },
        () => Math.random().toString(36).substring(2)
      ).join('');

      // Hash the nonce with SHA-256
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      // Request Apple credentials
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      // Create Firebase credential
      const { identityToken } = appleCredential;
      if (!identityToken) {
        return {
          success: false,
          error: 'Failed to get Apple identity token.',
        };
      }

      const firebaseCredential = auth.AppleAuthProvider.credential(
        identityToken,
        rawNonce
      );

      // Sign in to Firebase
      const userCredential = await auth().signInWithCredential(firebaseCredential);

      // Update display name if provided by Apple (only on first sign-in)
      const { fullName } = appleCredential;
      if (fullName?.givenName || fullName?.familyName) {
        const displayName = [fullName.givenName, fullName.familyName]
          .filter(Boolean)
          .join(' ');

        if (displayName && !userCredential.user.displayName) {
          await userCredential.user.updateProfile({ displayName });
        }
      }

      console.log('[AuthService] Apple sign-in successful:', userCredential.user.uid);

      return {
        success: true,
        user: userCredential.user,
        isNewUser: userCredential.additionalUserInfo?.isNewUser,
      };
    } catch (error) {
      console.error('[AuthService] Apple sign-in error:', error);

      // Handle user cancellation
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return { success: false, cancelled: true };
      }

      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  },

  /**
   * Sign in with Google
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  signInWithGoogle: async () => {
    try {
      // Ensure Google Sign-In is configured
      configureGoogleSignIn();

      // Check for Google Play Services (Android only)
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }

      // Get the user's Google credentials
      const signInResult = await GoogleSignin.signIn();

      // Get the ID token
      const idToken = signInResult?.data?.idToken;
      if (!idToken) {
        console.error('[AuthService] No ID token from Google:', signInResult);
        return {
          success: false,
          error: 'Failed to get Google ID token.',
        };
      }

      // Create Firebase credential
      const firebaseCredential = auth.GoogleAuthProvider.credential(idToken);

      // Sign in to Firebase
      const userCredential = await auth().signInWithCredential(firebaseCredential);

      console.log('[AuthService] Google sign-in successful:', userCredential.user.uid);

      return {
        success: true,
        user: userCredential.user,
        isNewUser: userCredential.additionalUserInfo?.isNewUser,
      };
    } catch (error) {
      console.error('[AuthService] Google sign-in error:', error);

      // Handle user cancellation
      if (
        error.code === 'SIGN_IN_CANCELLED' ||
        error.code === '12501' ||
        error.message?.includes('canceled')
      ) {
        return { success: false, cancelled: true };
      }

      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  },

  /**
   * Sign in with email and password
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  signInWithEmail: async (email, password) => {
    try {
      const userCredential = await auth().signInWithEmailAndPassword(
        email.trim(),
        password
      );

      console.log('[AuthService] Email sign-in successful:', userCredential.user.uid);

      return {
        success: true,
        user: userCredential.user,
      };
    } catch (error) {
      console.error('[AuthService] Email sign-in error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  },

  /**
   * Create a new account with email and password
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @param {string} displayName - User's display name (optional)
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  signUp: async (email, password, displayName = null) => {
    try {
      const userCredential = await auth().createUserWithEmailAndPassword(
        email.trim(),
        password
      );

      // Update display name if provided
      if (displayName) {
        await userCredential.user.updateProfile({ displayName: displayName.trim() });
      }

      console.log('[AuthService] Sign-up successful:', userCredential.user.uid);

      return {
        success: true,
        user: userCredential.user,
        isNewUser: true,
      };
    } catch (error) {
      console.error('[AuthService] Sign-up error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  },

  /**
   * Send password reset email
   * @param {string} email - User's email
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  resetPassword: async (email) => {
    try {
      await auth().sendPasswordResetEmail(email.trim());

      console.log('[AuthService] Password reset email sent to:', email);

      return { success: true };
    } catch (error) {
      console.error('[AuthService] Password reset error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  },

  /**
   * Sign out the current user
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  signOut: async () => {
    try {
      // Sign out from Google if signed in
      try {
        const isGoogleSignedIn = await GoogleSignin.isSignedIn();
        if (isGoogleSignedIn) {
          await GoogleSignin.signOut();
        }
      } catch (e) {
        // Ignore Google sign-out errors
      }

      // Sign out from Firebase
      await auth().signOut();

      console.log('[AuthService] Sign-out successful');

      return { success: true };
    } catch (error) {
      console.error('[AuthService] Sign-out error:', error);
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  },

  /**
   * Delete the current user's account
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  deleteAccount: async () => {
    try {
      const user = auth().currentUser;
      if (!user) {
        return { success: false, error: 'No user signed in.' };
      }

      // Delete server-side: the proxy removes the Firestore user doc + subcollections AND
      // the Firebase Auth user (Admin SDK). Done while still signed in so the current ID
      // token authenticates the request — and avoids the client-side recent-login re-auth
      // requirement that user.delete() imposes.
      await apiService.deleteAccount();

      // The Auth user no longer exists server-side; clear the local session so the app
      // returns to the sign-in screen.
      try {
        if (await GoogleSignin.isSignedIn()) {
          await GoogleSignin.signOut();
        }
      } catch {
        // ignore Google sign-out errors
      }
      try {
        await auth().signOut();
      } catch {
        // ignore — server already deleted the user
      }

      console.log('[AuthService] Account deleted');
      return { success: true };
    } catch (error) {
      console.error('[AuthService] Delete account error:', error);
      return {
        success: false,
        error: error.response?.data?.error || getErrorMessage(error),
      };
    }
  },

  /**
   * Get the auth provider used by the current user
   * @returns {string|null} Provider ID (apple.com, google.com, password) or null
   */
  getProvider: () => {
    const user = auth().currentUser;
    if (!user || !user.providerData?.length) return null;

    // Return the first provider (most users have only one)
    return user.providerData[0].providerId;
  },
};

export default AuthService;
