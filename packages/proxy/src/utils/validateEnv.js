/**
 * Startup environment validation.
 *
 * In production (`NODE_ENV==='production'`) a missing *required* variable is fatal —
 * we fail fast at boot instead of silently degrading (e.g. booting with no AI key,
 * no webhook secret, or wide-open CORS). In non-production we only warn so local dev
 * keeps working with a partial `.env`.
 */

const logger = require('./logger');

const REQUIRED = [
  'ANTHROPIC_API_KEY', // central key the LLM endpoint spends
  'REVENUECAT_WEBHOOK_AUTH_KEY', // webhook auth
  'ALLOWED_ORIGINS', // CORS allowlist — absence means permissive, unsafe in prod
  'FIREBASE_PROJECT_ID', // Firestore + ID-token verification
];

const OPTIONAL = ['SENTRY_DSN', 'GA4_MEASUREMENT_ID', 'GA4_API_SECRET'];

function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';

  const missing = REQUIRED.filter((key) => !process.env[key] || !String(process.env[key]).trim());

  // Firebase admin credentials: either inline service-account JSON or a file path.
  const hasFirebaseCreds = !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
  if (!hasFirebaseCreds) {
    missing.push('FIREBASE_SERVICE_ACCOUNT_KEY (or GOOGLE_APPLICATION_CREDENTIALS)');
  }

  if (missing.length) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    if (isProd) {
      logger.error(`[Env] ${message}`);
      throw new Error(message);
    }
    logger.warn(`[Env] ${message} — continuing in non-production with degraded features`);
  }

  for (const key of OPTIONAL) {
    if (!process.env[key]) logger.warn(`[Env] Optional ${key} is not set`);
  }
}

module.exports = { validateEnv };
