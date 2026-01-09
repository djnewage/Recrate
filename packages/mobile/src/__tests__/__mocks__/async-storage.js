/**
 * Mock for @react-native-async-storage/async-storage
 * Used in tests to simulate AsyncStorage behavior
 */

let store = {};

const AsyncStorageMock = {
  setItem: jest.fn((key, value) => {
    store[key] = value;
    return Promise.resolve();
  }),

  getItem: jest.fn((key) => {
    return Promise.resolve(store[key] || null);
  }),

  removeItem: jest.fn((key) => {
    delete store[key];
    return Promise.resolve();
  }),

  clear: jest.fn(() => {
    store = {};
    return Promise.resolve();
  }),

  getAllKeys: jest.fn(() => {
    return Promise.resolve(Object.keys(store));
  }),

  multiGet: jest.fn((keys) => {
    return Promise.resolve(keys.map((key) => [key, store[key] || null]));
  }),

  multiSet: jest.fn((keyValuePairs) => {
    keyValuePairs.forEach(([key, value]) => {
      store[key] = value;
    });
    return Promise.resolve();
  }),

  multiRemove: jest.fn((keys) => {
    keys.forEach((key) => {
      delete store[key];
    });
    return Promise.resolve();
  }),

  // Helper for tests to reset the mock store
  __resetStore: () => {
    store = {};
  },

  // Helper for tests to get the current store state
  __getStore: () => ({ ...store }),
};

export default AsyncStorageMock;
