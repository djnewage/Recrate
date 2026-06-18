/**
 * Auth middleware
 *
 * Establishes request identity in `req.auth` for the proxy's user-facing routes.
 *
 * Identity is resolved in priority order:
 *   1. `Authorization: Bearer <Firebase ID token>` — verified with the Admin SDK.
 *      The mobile app already sends this (packages/mobile/src/services/api.js).
 *      A verified token is authoritative: its uid wins over any client-set header,
 *      and `req.auth.verified === true`.
 *   2. Legacy `X-Firebase-UID` / `X-Device-Id` headers — used when no token is
 *      present (e.g. the desktop server, which forwards a UID string it received
 *      from the original mobile request but cannot itself mint a token). These are
 *      unverified: `req.auth.verified === false`.
 *
 * A *malformed/expired* Bearer token is a hard 401 — we never silently downgrade a
 * supplied token to the legacy path. Only the *absence* of a token falls through.
 *
 * Key-spending / trial-minting routes additionally call `requireRealIdentity` to
 * ensure an unverified UID actually exists in Firebase Auth before it can mint a
 * trial or spend the shared Anthropic key. That closes the "fabricate unlimited
 * device-ids → unlimited free trials" abuse vector without requiring the desktop
 * to forward a token.
 */

const { verifyIdToken, firebaseUserExists, isInitialized } = require('../utils/firebase');
const logger = require('../utils/logger');

function getBearerToken(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

/**
 * Populate req.auth = { firebaseUid, deviceId, verified }.
 * 401 when neither a token nor a legacy identity header is present, or when a
 * supplied token fails verification.
 */
async function requireAuth(req, res, next) {
  const token = getBearerToken(req);

  if (token) {
    // If Firebase isn't initialized we can't verify a supplied token. Fail closed
    // rather than trusting it — boot-time env validation should prevent this in prod.
    if (!isInitialized()) {
      logger.error('[Auth] Bearer token supplied but Firebase is not initialized');
      return res.status(503).json({ error: 'Auth service unavailable' });
    }
    try {
      const decoded = await verifyIdToken(token);
      req.auth = {
        firebaseUid: decoded.uid,
        deviceId: req.headers['x-device-id'] || null,
        verified: true,
      };
      return next();
    } catch (error) {
      logger.warn(`[Auth] ID token verification failed: ${error.message}`);
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
  }

  // No token — fall back to legacy identity headers (desktop / older clients).
  const firebaseUid = req.headers['x-firebase-uid'] || null;
  const deviceId = req.headers['x-device-id'] || null;
  if (!firebaseUid && !deviceId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.auth = { firebaseUid, deviceId, verified: false };
  return next();
}

/**
 * Guard for routes that mint trials or spend the shared AI key. Allows the request
 * only when the identity is backed by a real Firebase user: either a verified token,
 * or an unverified UID that exists in Firebase Auth. Raw device-id-only identities
 * (no Firebase account) are rejected.
 *
 * Must run after requireAuth.
 */
async function requireRealIdentity(req, res, next) {
  const auth = req.auth || {};
  if (auth.verified) return next();

  if (auth.firebaseUid && (await firebaseUserExists(auth.firebaseUid))) {
    return next();
  }

  return res.status(403).json({
    error: 'A signed-in account is required for this action.',
  });
}

module.exports = { requireAuth, requireRealIdentity };
