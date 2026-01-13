import * as Sentry from '@sentry/react';

let initialized = false;

/**
 * Initialize Sentry error tracking for the website
 */
export function initSentry(): void {
  if (initialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: `recrate-website@${appVersion}`,

    // Error tracking only - no performance monitoring
    tracesSampleRate: 0,

    // Only enable in production unless debugging
    enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_DEBUG === 'true',

    // Filter noisy errors
    ignoreErrors: [
      'ResizeObserver loop',
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'Failed to fetch',
      'Load failed',
      'Network request failed',
    ],
  });

  Sentry.setTag('package', 'website');
  initialized = true;
  console.log('[Sentry] Initialized for website package');
}

/**
 * Capture an error with optional context
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
): void {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// Re-export Sentry for direct access
export { Sentry };
