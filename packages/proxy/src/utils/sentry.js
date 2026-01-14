const Sentry = require('@sentry/node');

let initialized = false;

/**
 * Initialize Sentry error tracking for proxy server
 */
function initSentry() {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  const packageVersion = require('../../package.json').version;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: `recrate-proxy@${packageVersion}`,

    // Error tracking only
    tracesSampleRate: 0,

    // Only enable in production unless debugging
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',

    // Filter noisy errors
    ignoreErrors: [
      'ECONNRESET',
      'EPIPE',
      'WebSocket is not open',
      'Connection closed',
      'ECONNREFUSED',
    ],
  });

  Sentry.setTag('package', 'proxy');
  initialized = true;
  console.log('[Sentry] Initialized for proxy package');
}

/**
 * Capture an error with optional context
 * @param {Error} error - The error to capture
 * @param {Object} context - Optional context
 * @param {Object} context.tags - Tags to add
 * @param {Object} context.extra - Extra data
 */
function captureError(error, context = {}) {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context.extra) {
      scope.setExtras(context.extra);
    }
    Sentry.captureException(error);
  });
}

/**
 * Flush pending events (call before shutdown)
 * @param {number} timeout - Timeout in ms
 */
async function flush(timeout = 2000) {
  if (!initialized) return;
  await Sentry.close(timeout);
}

/**
 * Express error handler middleware
 */
function expressErrorHandler() {
  return Sentry.setupExpressErrorHandler;
}

module.exports = { initSentry, captureError, flush, expressErrorHandler, Sentry };
