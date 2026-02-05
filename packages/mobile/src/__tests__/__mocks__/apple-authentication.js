/**
 * Mock for expo-apple-authentication
 * Used in tests to simulate Apple Authentication behavior
 */

// Internal state
let isAvailable = true;
let shouldCancel = false;
let shouldThrowError = null;
let mockIdentityToken = 'mock-apple-identity-token';

// Apple Authentication Scopes
const AppleAuthenticationScope = {
  FULL_NAME: 0,
  EMAIL: 1,
};

// Apple Authentication Credential State
const AppleAuthenticationCredentialState = {
  REVOKED: 0,
  AUTHORIZED: 1,
  NOT_FOUND: 2,
  TRANSFERRED: 3,
};

/**
 * Check if Apple Authentication is available
 */
const isAvailableAsync = jest.fn().mockImplementation(() => {
  return Promise.resolve(isAvailable);
});

/**
 * Sign in with Apple
 */
const signInAsync = jest.fn().mockImplementation((options = {}) => {
  if (shouldThrowError) {
    const error = shouldThrowError;
    shouldThrowError = null;
    return Promise.reject(error);
  }

  if (shouldCancel) {
    shouldCancel = false;
    const error = new Error('User cancelled');
    error.code = 'ERR_REQUEST_CANCELED';
    return Promise.reject(error);
  }

  return Promise.resolve({
    identityToken: mockIdentityToken,
    user: 'apple-user-id-123',
    email: 'test@privaterelay.appleid.com',
    fullName: {
      givenName: 'John',
      familyName: 'Appleseed',
    },
    realUserStatus: 1,
    authorizationCode: 'mock-auth-code',
  });
});

/**
 * Get credential state
 */
const getCredentialStateAsync = jest.fn().mockResolvedValue(
  AppleAuthenticationCredentialState.AUTHORIZED
);

/**
 * Refresh credentials
 */
const refreshAsync = jest.fn().mockResolvedValue({
  identityToken: mockIdentityToken,
  user: 'apple-user-id-123',
});

// Helper functions for tests
export const mockHelpers = {
  /**
   * Set whether Apple Auth is available
   */
  setAvailable: (available) => {
    isAvailable = available;
  },

  /**
   * Set to simulate cancelled sign-in
   */
  setCancel: (cancel) => {
    shouldCancel = cancel;
  },

  /**
   * Set to simulate an error
   */
  setError: (error) => {
    shouldThrowError = error;
  },

  /**
   * Set the mock identity token
   */
  setIdentityToken: (token) => {
    mockIdentityToken = token;
  },

  /**
   * Simulate missing identity token
   */
  setMissingIdentityToken: () => {
    mockIdentityToken = null;
  },

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    isAvailable = true;
    shouldCancel = false;
    shouldThrowError = null;
    mockIdentityToken = 'mock-apple-identity-token';
    jest.clearAllMocks();
  },
};

export {
  isAvailableAsync,
  signInAsync,
  getCredentialStateAsync,
  refreshAsync,
  AppleAuthenticationScope,
  AppleAuthenticationCredentialState,
};
