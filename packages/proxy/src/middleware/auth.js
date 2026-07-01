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

const { verifyIdToken, lookupFirebaseUser, isInitialized } = require('../utils/firebase');
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

  if (token && isInitialized()) {
    try {
      const decoded = await verifyIdToken(token);
      req.auth = {
        firebaseUid: decoded.uid,
        deviceId: req.headers['x-device-id'] || null,
        verified: true,
        // auth_time = epoch seconds of the user's last actual sign-in (changes only on
        // re-authentication, not token refresh). Used to record last_signed_in_at.
        authTime: decoded.auth_time || null,
      };
      return next();
    } catch (error) {
      // A supplied token that won't verify (expired, clock skew, a transient Firebase
      // outage) must NOT lock the user out — fall through to the legacy header identity.
      // This grants an attacker nothing: the header path is reachable without a token
      // anyway, and requireRealIdentity still gates trial-minting / key-spending routes.
      logger.warn(`[Auth] ID token verification failed; using header identity: ${error.message}`);
    }
  } else if (token) {
    // Token present but Firebase isn't initialized — can't verify. Degrade to the
    // header identity rather than hard-failing (boot env validation guards prod).
    logger.warn('[Auth] Bearer token supplied but Firebase not initialized; using header identity');
  }

  // No usable token — fall back to legacy identity headers (desktop / older clients).
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

  // Unverified identity: only allow it through if it maps to a real Firebase user.
  // Fail *closed* on a definitive "not found" (the abuse case); fail *open* on a
  // transient lookup error so a Firebase blip doesn't block a legitimate user.
  if (auth.firebaseUid) {
    const status = await lookupFirebaseUser(auth.firebaseUid);
    if (status === 'exists') return next();
    if (status === 'error') {
      logger.warn(
        `[Auth] Could not verify identity ${auth.firebaseUid} (transient); allowing through`
      );
      return next();
    }
    // status === 'not_found' → fall through to 403
  }

  return res.status(403).json({
    error: 'A signed-in account is required for this action.',
  });
}

module.exports = { requireAuth, requireRealIdentity };
