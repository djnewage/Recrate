module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/server-bundle/'
  ],
  modulePathIgnorePatterns: [
    '/dist/',
    '/server-bundle/'
  ]
};
