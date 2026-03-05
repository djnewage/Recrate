const firestore = require('../../utils/firestore');
const logger = require('../../utils/logger');
const usageTracker = require('../../utils/usageTracker');
const { getTier, isByokAllowed } = require('../../config/tiers');
const { verifyIdToken } = require('../../utils/firebase');

/**
 * Require authentication - extracts user from Firebase ID token, Firebase UID header, or device ID
 *
 * Authentication priority:
 * 1. Authorization Bearer token (Firebase ID token - most secure, server-verified)
 * 2. X-Firebase-UID header (less secure, for migration period)
 * 3. X-User-Id header (alias for Firebase UID, for mobile compatibility)
 * 4. X-Device-Id header (backwards compatibility)
 *
 * Server is the source of truth for subscription/trial state.
 */
async function requireAuth(req, res, next) {
  try {
    let firebaseUid = null;
    let verifiedByToken = false;

    // Priority 1: Verify Authorization Bearer token (most secure)
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);
      const decodedToken = await verifyIdToken(idToken);
      if (decodedToken) {
        firebaseUid = decodedToken.uid;
        verifiedByToken = true;
        // Store decoded token info for potential use
        req.decodedToken = decodedToken;
      }
    }

    // Priority 2: Fall back to header-based auth (less secure, for migration)
    if (!firebaseUid) {
      firebaseUid = req.headers['x-firebase-uid'] || req.headers['x-user-id'];
    }

    // Priority 3: Device ID fallback
    const deviceId = req.headers['x-device-id'];

    // Require at least one form of identification
    if (!firebaseUid && !deviceId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Provide Authorization Bearer token or X-Device-Id header.',
      });
    }

    // Check if Firestore is available
    if (!firestore.isAvailable()) {
      // Allow requests without Firestore for development/testing
      logger.warn('[Auth] Firestore not available, using default trial user');
      req.user = {
        id: firebaseUid || deviceId || 'anonymous',
        tier: 'trial',
        byokKeyHash: null,
        verifiedByToken,
      };
      return next();
    }

    // Look up user by Firebase UID first (preferred)
    let user = null;

    if (firebaseUid) {
      user = await firestore.getUser(firebaseUid);

      // If not found by firebase_uid, check if there's a device user to migrate
      if (!user && deviceId) {
        const deviceUser = await firestore.getDeviceUserWithoutFirebase(deviceId);

        if (deviceUser) {
          // Migrate device user to Firebase UID
          await firestore.linkFirebaseUid(deviceUser.id, firebaseUid);
          user = await firestore.getUser(firebaseUid);
          logger.info(`[Auth] Migrated device user ${deviceUser.id} to Firebase UID ${firebaseUid}`);
        }
      }
    }

    // Fall back to device ID lookup for backwards compatibility
    if (!user && deviceId) {
      user = await firestore.getUserByDeviceId(deviceId);

      if (!user) {
        // Legacy lookup by id
        user = await firestore.getUserByLegacyId(deviceId);
      }
    }

    // Create new user if not found
    if (!user) {
      const id = firebaseUid || deviceId || `user-${Date.now()}`;
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 3);

      await firestore.createUser(id, {
        firebase_uid: firebaseUid || null,
        device_id: deviceId || null,
        tier: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnd.toISOString(),
      });

      user = await firestore.getUser(id);

      logger.info(`[Auth] Created new trial user: ${id} (Firebase: ${!!firebaseUid}, Verified: ${verifiedByToken})`);
    }

    // Check subscription expiration (server is source of truth)
    if (user.tier === 'pro' && user.subscription_expires_at) {
      if (new Date(user.subscription_expires_at) < new Date()) {
        // Subscription expired - downgrade
        await firestore.updateUser(user.id, { tier: 'expired' });
        user.tier = 'expired';
        logger.info(`[Auth] Subscription expired for user: ${user.firebase_uid || user.id}`);
      }
    }

    // Check trial expiration
    if (user.tier === 'trial' && user.trial_ends_at) {
      if (new Date(user.trial_ends_at) < new Date()) {
        // Trial expired - downgrade to expired (no AI access)
        await firestore.updateUser(user.id, { tier: 'expired' });
        user.tier = 'expired';
        logger.info(`[Auth] Trial expired for user: ${user.firebase_uid || user.id}`);
      }
    }

    // Set user on request - use firebase_uid as canonical ID if available
    req.user = {
      id: user.firebase_uid || user.id,
      internalId: user.id,
      firebaseUid: user.firebase_uid,
      deviceId: user.device_id,
      tier: user.tier,
      byokKeyHash: user.byok_key_hash,
      trialEndsAt: user.trial_ends_at,
      subscriptionExpiresAt: user.subscription_expires_at,
      subscriptionWillRenew: !!user.subscription_will_renew,
      verifiedByToken, // Indicates if auth was verified by Firebase token
    };

    next();
  } catch (error) {
    logger.error('[Auth] Error in requireAuth:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
}

/**
 * Require specific tier(s) for route access
 * @param {string[]} allowedTiers - Array of allowed tiers ('trial', 'basic', 'pro')
 */
function requireTier(allowedTiers) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!allowedTiers.includes(req.user.tier)) {
      const tierNames = { trial: 'Free Trial', basic: 'Basic', pro: 'Pro' };
      return res.status(403).json({
        success: false,
        error: `This feature requires ${allowedTiers.map((t) => tierNames[t]).join(' or ')} subscription.`,
        currentTier: req.user.tier,
        requiredTiers: allowedTiers,
      });
    }

    next();
  };
}

/**
 * Check AI quota before allowing request
 * MUST be called BEFORE making Anthropic or ACRCloud calls
 * @param {string} feature - 'crate_builder' or 'track_identification'
 */
function requireQuota(feature) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const isByok = !!req.body?.userApiKey;

    // Check if BYOK is allowed for this tier
    if (isByok && !isByokAllowed(req.user.tier)) {
      return res.status(403).json({
        success: false,
        error: 'BYOK (Bring Your Own Key) is only available for Pro subscribers.',
        currentTier: req.user.tier,
      });
    }

    // QUOTA CHECK HAPPENS BEFORE API CALL
    const quota = await usageTracker.checkQuota(req.user.id, req.user.tier, feature, isByok);

    if (!quota.allowed) {
      const featureDisplayName = feature.replace(/_/g, ' ');
      const tierConfig = getTier(req.user.tier);

      return res.status(429).json({
        success: false,
        error:
          quota.limit === 0
            ? `${featureDisplayName} is not available on your ${tierConfig?.name || req.user.tier} plan. Upgrade to Pro.`
            : `Monthly quota exceeded for ${featureDisplayName}.`,
        quota: {
          feature: feature,
          used: quota.limit - quota.remaining,
          limit: quota.limit,
          remaining: quota.remaining,
          resetDate: quota.resetDate, // ISO 8601 UTC date of next reset
        },
      });
    }

    // Attach quota info for logging and response
    req.quota = quota;
    req.isByok = isByok;
    next();
  };
}

/**
 * Optional auth - extracts user if present but doesn't require it
 * Useful for endpoints that behave differently for authenticated users
 *
 * Unlike requireAuth, this will NOT return 401 if auth fails - it just sets req.user = null
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const firebaseUid = req.headers['x-firebase-uid'] || req.headers['x-user-id'];
  const deviceId = req.headers['x-device-id'];

  // No auth headers present - continue without user
  if (!authHeader && !firebaseUid && !deviceId) {
    req.user = null;
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  try {
    let verifiedUser = null;
    let verifiedByToken = false;

    // Try Bearer token verification
    if (authHeader?.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);
      const decodedToken = await verifyIdToken(idToken);
      if (decodedToken) {
        verifiedUser = decodedToken.uid;
        verifiedByToken = true;
      }
    }

    // Fall back to header-based auth
    if (!verifiedUser) {
      verifiedUser = firebaseUid;
    }

    // Look up or create user if we have identification
    if (verifiedUser || deviceId) {
      // Check if Firestore is available
      if (firestore.isAvailable()) {
        // Look up user by Firebase UID first
        let user = null;
        if (verifiedUser) {
          user = await firestore.getUser(verifiedUser);
        }
        // Fall back to device ID lookup
        if (!user && deviceId) {
          user = await firestore.getUserByDeviceId(deviceId);
          if (!user) {
            user = await firestore.getUserByLegacyId(deviceId);
          }
        }

        if (user) {
          req.user = {
            id: user.firebase_uid || user.id,
            internalId: user.id,
            firebaseUid: user.firebase_uid,
            deviceId: user.device_id,
            tier: user.tier,
            byokKeyHash: user.byok_key_hash,
            trialEndsAt: user.trial_ends_at,
            subscriptionExpiresAt: user.subscription_expires_at,
            subscriptionWillRenew: !!user.subscription_will_renew,
            verifiedByToken,
          };
        } else {
          // User not found - set basic info without creating
          req.user = {
            id: verifiedUser || deviceId,
            firebaseUid: verifiedUser,
            deviceId: deviceId,
            tier: 'trial',
            verifiedByToken,
          };
        }
      } else {
        // Firestore not available - set basic user info
        req.user = {
          id: verifiedUser || deviceId,
          firebaseUid: verifiedUser,
          deviceId: deviceId,
          tier: 'trial',
          verifiedByToken,
        };
      }
    } else {
      req.user = null;
    }
  } catch (error) {
    // Auth failed - continue without user (it's optional)
    logger.debug('[Auth] optionalAuth failed, continuing without user:', error.message);
    req.user = null;
  }

  next();
}

module.exports = {
  requireAuth,
  requireTier,
  requireQuota,
  optionalAuth,
};
