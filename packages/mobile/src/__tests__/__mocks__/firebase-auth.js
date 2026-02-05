/**
 * Mock for @react-native-firebase/auth
 * Used in tests to simulate Firebase Authentication behavior
 */

// Mock user factory
export const createMockUser = (overrides = {}) => ({
  uid: 'test-uid-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: 'https://example.com/photo.jpg',
  emailVerified: true,
  providerData: [{ providerId: 'password' }],
  updateProfile: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

// Internal state
let currentUser = null;
let authStateCallback = null;

// Mock auth instance methods
const mockAuthInstance = {
  get currentUser() {
    return currentUser;
  },
  onAuthStateChanged: jest.fn((callback) => {
    authStateCallback = callback;
    // Immediately call with current user
    callback(currentUser);
    // Return unsubscribe function
    return jest.fn();
  }),
  signInWithCredential: jest.fn().mockImplementation((credential) => {
    const user = createMockUser();
    currentUser = user;
    if (authStateCallback) authStateCallback(user);
    return Promise.resolve({
      user,
      additionalUserInfo: { isNewUser: false },
    });
  }),
  signInWithEmailAndPassword: jest.fn().mockImplementation((email, password) => {
    const user = createMockUser({ email });
    currentUser = user;
    if (authStateCallback) authStateCallback(user);
    return Promise.resolve({ user });
  }),
  createUserWithEmailAndPassword: jest.fn().mockImplementation((email, password) => {
    const user = createMockUser({ email, displayName: null });
    currentUser = user;
    if (authStateCallback) authStateCallback(user);
    return Promise.resolve({ user });
  }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  signOut: jest.fn().mockImplementation(() => {
    currentUser = null;
    if (authStateCallback) authStateCallback(null);
    return Promise.resolve();
  }),
};

// Auth providers
const AppleAuthProvider = {
  credential: jest.fn((identityToken, rawNonce) => ({
    providerId: 'apple.com',
    token: identityToken,
    secret: rawNonce,
  })),
};

const GoogleAuthProvider = {
  credential: jest.fn((idToken) => ({
    providerId: 'google.com',
    idToken,
  })),
};

// Main mock function - returns instance when called
const authMock = jest.fn(() => mockAuthInstance);

// Attach providers to the mock function
authMock.AppleAuthProvider = AppleAuthProvider;
authMock.GoogleAuthProvider = GoogleAuthProvider;

// Helper functions for tests
export const mockHelpers = {
  /**
   * Set the current user
   * @param {Object|null} user - User object or null
   */
  setCurrentUser: (user) => {
    currentUser = user;
  },

  /**
   * Trigger auth state change callback
   * @param {Object|null} user - User object or null
   */
  triggerAuthStateChange: (user) => {
    currentUser = user;
    if (authStateCallback) {
      authStateCallback(user);
    }
  },

  /**
   * Get the current auth state callback
   */
  getAuthStateCallback: () => authStateCallback,

  /**
   * Reset all mocks to initial state
   */
  resetMocks: () => {
    currentUser = null;
    authStateCallback = null;
    jest.clearAllMocks();
  },

  /**
   * Create a mock user with custom properties
   */
  createMockUser,

  /**
   * Get the mock auth instance
   */
  getMockAuthInstance: () => mockAuthInstance,
};

export default authMock;
