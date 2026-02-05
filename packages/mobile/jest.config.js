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
    '^@react-native-firebase/auth$':
      '<rootDir>/src/__tests__/__mocks__/firebase-auth.js',
    '^@react-native-google-signin/google-signin$':
      '<rootDir>/src/__tests__/__mocks__/google-signin.js',
    '^expo-apple-authentication$':
      '<rootDir>/src/__tests__/__mocks__/apple-authentication.js',
    '^expo-crypto$':
      '<rootDir>/src/__tests__/__mocks__/expo-crypto.js',
  },
  collectCoverageFrom: [
    'src/store/**/*.js',
    'src/services/SyncService.js',
    'src/services/AuthService.js',
    '!src/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
