module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|zustand)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/src/__tests__/__mocks__/async-storage.js',
  },
  collectCoverageFrom: [
    'src/store/**/*.js',
    'src/services/SyncService.js',
    '!src/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
