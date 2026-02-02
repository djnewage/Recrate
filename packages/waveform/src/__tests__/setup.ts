/**
 * Jest test setup for @recrate/waveform package
 *
 * Mocks React Native Skia for path generation tests
 */

// Mock path object that tracks method calls
const createMockPath = () => ({
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  close: jest.fn(),
  addRect: jest.fn(),
});

// Mock @shopify/react-native-skia
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Path: {
      Make: () => createMockPath(),
    },
  },
}));

// Export mock factory for tests that need to inspect path calls
export { createMockPath };
