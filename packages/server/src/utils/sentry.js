const Sentry = require('@sentry/node');

let initialized = false;

/**
 * Initialize Sentry error tracking
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
    release: `recrate-server@${packageVersion}`,

    // Error tracking only - no performance monitoring
    tracesSampleRate: 0,
    profilesSampleRate: 0,

    // Only enable in production unless debugging
    enabled: process.env.NODE_ENV === 'production' || process.env.SENTRY_DEBUG === 'true',

    // Depth for normalizing objects
    normalizeDepth: 5,

    // Filter noisy errors
    ignoreErrors: [
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'cancelled',
      'AbortError',
      'ECONNRESET',
      'ECONNREFUSED',
      'EPIPE',
      'ETIMEDOUT',
    ],

    // Sanitize sensitive data before sending
    beforeSend: (event) => {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
          if (breadcrumb.data?.url) {
            // Remove auth tokens from URLs
            breadcrumb.data.url = breadcrumb.data.url.replace(/token=[^&]+/, 'token=REDACTED');
          }
          return breadcrumb;
        });
      }
      return event;
    },
  });

  Sentry.setTag('package', 'server');
  initialized = true;
  console.log('[Sentry] Initialized for server package');
}

/**
 * Capture an error with optional context
 * @param {Error} error - The error to capture
 * @param {Object} context - Optional context
 * @param {Object} context.user - User info
 * @param {Object} context.tags - Tags to add
 * @param {Object} context.extra - Extra data
 */
function captureError(error, context = {}) {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context.user) {
      scope.setUser(context.user);
    }
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
 * Set user context for Sentry
 * @param {Object} user - User info (id, deviceId, etc.)
 */
function setUser(user) {
  if (!initialized) return;
  Sentry.setUser(user);
}

/**
 * Express request handler middleware (must be first middleware)
 */
function expressRequestHandler() {
  return Sentry.expressIntegration().setupExpressErrorHandler;
}

/**
 * Express error handler middleware
 */
function expressErrorHandler() {
  return Sentry.setupExpressErrorHandler;
}

/**
 * Flush pending events (call before shutdown)
 * @param {number} timeout - Timeout in ms
 */
async function flush(timeout = 2000) {
  if (!initialized) return;
  await Sentry.close(timeout);
}

module.exports = {
  initSentry,
  captureError,
  setUser,
  expressRequestHandler,
  expressErrorHandler,
  flush,
  Sentry,
};
