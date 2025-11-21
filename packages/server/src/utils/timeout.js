const logger = require('./logger');

/**
 * Timeout utility for async operations
 * Prevents operations from hanging indefinitely
 */

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} operationName - Optional name for logging
 * @returns {Promise} Promise that rejects if timeout is exceeded
 */
function withTimeout(promise, ms, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        logger.warn(`${operationName} timed out after ${ms}ms`);
        reject(new Error(`${operationName} timed out after ${ms}ms`));
      }, ms);

      // Clear timeout if promise resolves first
      promise.finally(() => clearTimeout(timeoutId));
    })
  ]);
}

/**
 * Create a timeout wrapper function with a default timeout
 * @param {number} defaultMs - Default timeout in milliseconds
 * @returns {Function} Timeout wrapper function
 */
function createTimeoutWrapper(defaultMs) {
  return (promise, ms = defaultMs, operationName = 'Operation') => {
    return withTimeout(promise, ms, operationName);
  };
}

module.exports = {
  withTimeout,
  createTimeoutWrapper
};
