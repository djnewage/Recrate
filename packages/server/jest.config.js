module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 10000,
  // Transform ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(music-metadata|strtok3|token-types|peek-readable|@tokenizer)/)',
  ],
  // Mock ESM modules that can't be transformed
  moduleNameMapper: {
    '^music-metadata$': '<rootDir>/src/__tests__/__mocks__/music-metadata.js',
  },
};
