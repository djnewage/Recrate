/**
 * Mock for ../config/firebase
 * Used in tests to simulate Firebase configuration and utilities
 */

let firebaseUserId = null;
let firebaseUserEmail = null;
let loggedEvents = [];
let loggedErrors = [];

// Mock Firebase Auth instance
export const firebaseAuth = {
  currentUser: null,
  onAuthStateChanged: jest.fn((callback) => {
    callback(firebaseAuth.currentUser);
    return jest.fn(); // unsubscribe
  }),
};

// Mock Firebase Crashlytics instance
export const firebaseCrashlytics = {
  setUserId: jest.fn((userId) => {
    firebaseUserId = userId;
    return Promise.resolve();
  }),
  setAttributes: jest.fn().mockResolvedValue(undefined),
  recordError: jest.fn().mockResolvedValue(undefined),
  log: jest.fn(),
};

// Mock Firebase Analytics instance
export const firebaseAnalytics = {
  setUserId: jest.fn((userId) => {
    return Promise.resolve();
  }),
  logEvent: jest.fn((eventName, params) => {
    loggedEvents.push({ eventName, params });
    return Promise.resolve();
  }),
};

/**
 * Set user ID across Firebase services
 */
export const setFirebaseUser = jest.fn(async (userId, email = null) => {
  firebaseUserId = userId;
  firebaseUserEmail = email;
});

/**
 * Log a custom event to Firebase Analytics
 */
export const logEvent = jest.fn(async (eventName, params = {}) => {
  loggedEvents.push({ eventName, params });
});

/**
 * Log a non-fatal error to Crashlytics
 */
export const logError = jest.fn(async (error, context = {}) => {
  loggedErrors.push({ error, context });
});

// Default export
export default {
  auth: firebaseAuth,
  crashlytics: firebaseCrashlytics,
  analytics: firebaseAnalytics,
  setFirebaseUser,
  logEvent,
  logError,
};

// Helper functions for tests
export const mockHelpers = {
  /**
   * Get current Firebase user ID
   */
  getFirebaseUserId: () => firebaseUserId,

  /**
   * Get current Firebase user email
   */
  getFirebaseUserEmail: () => firebaseUserEmail,

  /**
   * Get logged events
   */
  getLoggedEvents: () => [...loggedEvents],

  /**
   * Get logged errors
   */
  getLoggedErrors: () => [...loggedErrors],

  /**
   * Set mock current user on auth instance
   */
  setCurrentUser: (user) => {
    firebaseAuth.currentUser = user;
  },

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    firebaseUserId = null;
    firebaseUserEmail = null;
    loggedEvents = [];
    loggedErrors = [];
    firebaseAuth.currentUser = null;
    jest.clearAllMocks();
  },
};
