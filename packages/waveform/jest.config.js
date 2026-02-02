module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
  ],
  moduleNameMapper: {
    '^../types$': '<rootDir>/src/types/index.ts',
    '^../../types$': '<rootDir>/src/types/index.ts',
  },
};
