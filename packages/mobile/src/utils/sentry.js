import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

/**
 * Initialize Sentry error tracking for React Native
 */
export function initSentry() {
  if (initialized) return;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ||
    Constants.expoConfig?.android?.versionCode?.toString() ||
    '1';

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    release: `recrate-mobile@${appVersion}`,
    dist: buildNumber,

    // Error tracking only - no performance monitoring
    tracesSampleRate: 0,
    profilesSampleRate: 0,

    // Only enable in production unless debugging
    enabled: !__DEV__ || process.env.EXPO_PUBLIC_SENTRY_DEBUG === 'true',

    // Filter noisy errors
    ignoreErrors: [
      'Network request failed',
      'Failed to fetch',
      'cancelled',
      'AbortError',
      'Non-Error promise rejection captured',
      'timeout',
      'The operation couldn't be completed',
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

  Sentry.setTag('package', 'mobile');
  initialized = true;
  console.log('[Sentry] Initialized for mobile package');
}

/**
 * Capture an error with optional context
 * @param {Error} error - The error to capture
 * @param {Object} context - Optional context
 * @param {Object} context.user - User info
 * @param {Object} context.tags - Tags to add
 * @param {Object} context.extra - Extra data
 */
export function captureError(error, context = {}) {
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
export function setUser(user) {
  if (!initialized) return;
  Sentry.setUser({
    id: user.deviceId,
    ...user,
  });
}

/**
 * Add a breadcrumb for debugging
 * @param {string} message - Breadcrumb message
 * @param {string} category - Category (navigation, ui, network, etc.)
 * @param {string} level - Severity level (info, warning, error)
 */
export function addBreadcrumb(message, category = 'navigation', level = 'info') {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    message,
    category,
    level,
  });
}

// Re-export Sentry for direct access
export { Sentry };
