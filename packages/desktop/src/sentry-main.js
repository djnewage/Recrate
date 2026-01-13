const Sentry = require('@sentry/electron/main');
const { app } = require('electron');

let initialized = false;

/**
 * Initialize Sentry for Electron main process
 */
function initSentry() {
  if (initialized) return;

  const dsn = process.env.SENTRY_DSN_MAIN;
  if (!dsn) {
    console.log('[Sentry] No DSN configured for main process, skipping');
    return;
  }

  const packageVersion = require('../package.json').version;

  Sentry.init({
    dsn,
    environment: app.isPackaged ? 'production' : 'development',
    release: `recrate-desktop@${packageVersion}`,

    // Error tracking only
    tracesSampleRate: 0,

    // Only enable in production unless debugging
    enabled: app.isPackaged || process.env.SENTRY_DEBUG === 'true',

    // Filter noisy errors
    ignoreErrors: [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'EIO', // Ignore EIO errors during shutdown
      'EPIPE',
      'ECONNRESET',
    ],
  });

  Sentry.setTag('package', 'desktop');
  Sentry.setTag('process', 'main');
  initialized = true;
  console.log('[Sentry] Initialized for desktop main process');
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
 * Set user context for Sentry
 * @param {Object} user - User info
 */
function setUser(user) {
  if (!initialized) return;
  Sentry.setUser(user);
}

/**
 * Flush pending events (call before shutdown)
 * @param {number} timeout - Timeout in ms
 */
async function flush(timeout = 2000) {
  if (!initialized) return;
  await Sentry.close(timeout);
}

module.exports = { initSentry, captureError, setUser, flush, Sentry };
