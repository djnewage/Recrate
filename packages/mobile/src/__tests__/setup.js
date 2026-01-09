// Jest setup file for mobile tests

// Silence console output during tests to reduce noise
// Comment these out if you need to debug test failures
global.console.log = jest.fn();
global.console.warn = jest.fn();
global.console.error = jest.fn();

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
