/**
 * Mock for ../utils/sentry
 * Used in tests to simulate Sentry functionality
 */

let initialized = false;
let currentUser = null;
let breadcrumbs = [];
let capturedErrors = [];

/**
 * Initialize Sentry (mock)
 */
export const initSentry = jest.fn(() => {
  initialized = true;
});

/**
 * Capture an error
 */
export const captureError = jest.fn((error, context = {}) => {
  capturedErrors.push({ error, context });
});

/**
 * Set user context
 */
export const setUser = jest.fn((user) => {
  currentUser = user;
});

/**
 * Add a breadcrumb
 */
export const addBreadcrumb = jest.fn((message, category = 'navigation', level = 'info') => {
  breadcrumbs.push({ message, category, level });
});

/**
 * Mock Sentry namespace
 */
export const Sentry = {
  init: jest.fn(),
  setUser: jest.fn((user) => {
    currentUser = user;
  }),
  setTag: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  withScope: jest.fn((callback) => {
    callback({
      setUser: jest.fn(),
      setTag: jest.fn(),
      setExtras: jest.fn(),
    });
  }),
};

// Helper functions for tests
export const mockHelpers = {
  /**
   * Check if initialized
   */
  isInitialized: () => initialized,

  /**
   * Get current user
   */
  getCurrentUser: () => currentUser,

  /**
   * Get captured errors
   */
  getCapturedErrors: () => [...capturedErrors],

  /**
   * Get breadcrumbs
   */
  getBreadcrumbs: () => [...breadcrumbs],

  /**
   * Reset all mocks
   */
  resetMocks: () => {
    initialized = false;
    currentUser = null;
    breadcrumbs = [];
    capturedErrors = [];
    jest.clearAllMocks();
  },
};
