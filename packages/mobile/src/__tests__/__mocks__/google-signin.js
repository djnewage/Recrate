/**
 * Mock for @react-native-google-signin/google-signin
 * Used in tests to simulate Google Sign-In behavior
 */

// Internal state
let isConfigured = false;
let isSignedIn = false;
let mockIdToken = 'mock-google-id-token';
let shouldCancelSignIn = false;
let shouldThrowError = null;

const GoogleSignin = {
  configure: jest.fn((config) => {
    isConfigured = true;
  }),

  hasPlayServices: jest.fn().mockResolvedValue(true),

  signIn: jest.fn().mockImplementation(() => {
    if (shouldThrowError) {
      const error = shouldThrowError;
      shouldThrowError = null;
      return Promise.reject(error);
    }

    if (shouldCancelSignIn) {
      shouldCancelSignIn = false;
      const error = new Error('Sign in cancelled');
      error.code = 'SIGN_IN_CANCELLED';
      return Promise.reject(error);
    }

    isSignedIn = true;
    return Promise.resolve({
      data: {
        idToken: mockIdToken,
        user: {
          email: 'test@gmail.com',
          name: 'Test User',
          photo: 'https://example.com/photo.jpg',
        },
      },
    });
  }),

  signOut: jest.fn().mockImplementation(() => {
    isSignedIn = false;
    return Promise.resolve();
  }),

  isSignedIn: jest.fn().mockImplementation(() => {
    return Promise.resolve(isSignedIn);
  }),

  getCurrentUser: jest.fn().mockImplementation(() => {
    if (!isSignedIn) return null;
    return {
      user: {
        email: 'test@gmail.com',
        name: 'Test User',
        photo: 'https://example.com/photo.jpg',
      },
    };
  }),

  revokeAccess: jest.fn().mockResolvedValue(null),
};

// Status codes
const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

// Helper functions for tests
export const mockHelpers = {
  /**
   * Set whether Google Sign-In is configured
   */
  setConfigured: (configured) => {
    isConfigured = configured;
  },

  /**
   * Set whether user is signed in
   */
  setSignedIn: (signedIn) => {
    isSignedIn = signedIn;
  },

  /**
   * Set the mock ID token
   */
  setMockIdToken: (token) => {
    mockIdToken = token;
  },

  /**
   * Set to simulate cancelled sign-in
   */
  setCancelSignIn: (cancel) => {
    shouldCancelSignIn = cancel;
  },

  /**
   * Set to simulate an error on sign-in
   */
  setSignInError: (error) => {
    shouldThrowError = error;
  },

  /**
   * Simulate missing ID token
   */
  setMissingIdToken: () => {
    mockIdToken = null;
  },

  /**
   * Check if configured
   */
  isConfigured: () => isConfigured,

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    isConfigured = false;
    isSignedIn = false;
    mockIdToken = 'mock-google-id-token';
    shouldCancelSignIn = false;
    shouldThrowError = null;
    jest.clearAllMocks();
  },
};

export { GoogleSignin, statusCodes };
