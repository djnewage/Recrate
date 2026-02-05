/**
 * Mock for expo-crypto
 * Used in tests to simulate cryptographic operations
 */

// Crypto Digest Algorithms
const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
  MD2: 'MD2',
  MD4: 'MD4',
  MD5: 'MD5',
};

// Crypto Encoding
const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
};

/**
 * Hash a string using the specified algorithm
 */
const digestStringAsync = jest.fn().mockImplementation((algorithm, data, options = {}) => {
  // Return a deterministic mock hash based on input
  const mockHash = `mock-${algorithm.toLowerCase().replace('-', '')}-hash-${Buffer.from(data).toString('hex').substring(0, 16)}`;
  return Promise.resolve(mockHash);
});

/**
 * Get random bytes
 */
const getRandomBytesAsync = jest.fn().mockImplementation((byteCount) => {
  // Return mock random bytes
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Promise.resolve(bytes);
});

/**
 * Get random values (Web Crypto API compatible)
 */
const getRandomValues = jest.fn().mockImplementation((array) => {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
});

/**
 * Generate a random UUID
 */
const randomUUID = jest.fn().mockImplementation(() => {
  return 'mock-uuid-' + Math.random().toString(36).substring(2, 11);
});

// Helper functions for tests
export const mockHelpers = {
  /**
   * Reset all mocks
   */
  resetMocks: () => {
    jest.clearAllMocks();
  },
};

export {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytesAsync,
  getRandomValues,
  randomUUID,
};
