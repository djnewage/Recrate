/**
 * Subscription Routes
 * Endpoints for checking and syncing subscription status
 *
 * The proxy is the source of truth for subscription state.
 * Mobile app should sync with these endpoints on launch and periodically.
 */

const express = require('express');
const firestore = require('../utils/firestore');
const logger = require('../utils/logger');
const usageTracker = require('../utils/usageTracker');
const { getTier, getQuota } = require('../config/tiers');
const { trackEvent } = require('../utils/analytics');
const admin = require('firebase-admin');
const { setUser: setSentryUser } = require('../utils/sentry');
const { getBetaMode, getTrialDurationDays } = require('../utils/remoteConfig');

/**
 * Get user by Firebase UID or device ID (for backwards compatibility)
 * @param {string} firebaseUid - Firebase UID
 * @param {string} deviceId - Device ID (fallback)
 * @returns {Promise<Object|null>} User record
 */
async function getUser(firebaseUid, deviceId) {
  // Try Firebase UID first (preferred)
  if (firebaseUid) {
    const user = await firestore.getUser(firebaseUid);
    if (user) return user;
  }

  // Fall back to device ID for backwards compatibility
  if (deviceId) {
    // Check device_id field first, then legacy id
    let user = await firestore.getUserByDeviceId(deviceId);
    if (user) return user;

    user = await firestore.getUserByLegacyId(deviceId);
    if (user) return user;
  }

  return null;
}

/**
 * Create or get user, starting trial if new
 * @param {string} firebaseUid - Firebase UID
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} User record
 */
async function getOrCreateUser(firebaseUid, deviceId) {
  let user = await getUser(firebaseUid, deviceId);

  if (!user) {
    // Create new user with trial
    const id = firebaseUid || deviceId || `user-${Date.now()}`;
    const trialDays = await getTrialDurationDays();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);

    await firestore.createUser(id, {
      firebase_uid: firebaseUid || null,
      device_id: deviceId || null,
      tier: 'trial',
      trial_started_at: new Date().toISOString(),
      trial_ends_at: trialEnd.toISOString(),
    });

    user = await firestore.getUser(id);

    logger.info(`[Subscription] Created new trial user: ${id}`);
  }

  // Link Firebase UID to existing device-only user if needed
  if (firebaseUid && user && !user.firebase_uid && user.device_id === deviceId) {
    await firestore.updateUser(user.id, { firebase_uid: firebaseUid });
    user.firebase_uid = firebaseUid;
    logger.info(`[Subscription] Linked Firebase UID ${firebaseUid} to device ${deviceId}`);
  }

  return user;
}

/**
 * Check if trial or subscription has expired and update tier
 * @param {Object} user - User record
 * @returns {Promise<Object>} Updated user record
 */
async function checkExpiration(user) {
  const now = new Date();
  let needsUpdate = false;
  let newTier = user.tier;

  // Check subscription expiration
  if (user.tier === 'pro' && user.subscription_expires_at) {
    if (new Date(user.subscription_expires_at) < now) {
      newTier = 'expired';
      needsUpdate = true;
      logger.info(`[Subscription] User ${user.firebase_uid || user.id} subscription expired`);
    }
  }

  // Check trial expiration
  if (user.tier === 'trial' && user.trial_ends_at) {
    if (new Date(user.trial_ends_at) < now) {
      newTier = 'expired';
      needsUpdate = true;
      logger.info(`[Subscription] User ${user.firebase_uid || user.id} trial expired`);
    }
  }

  if (needsUpdate) {
    await firestore.updateUser(user.id, { tier: newTier });
    user.tier = newTier;
  }

  return user;
}

/**
 * Calculate days remaining for trial or subscription
 * @param {string} endDateStr - ISO date string
 * @returns {number} Days remaining (0 if expired)
 */
function getDaysRemaining(endDateStr) {
  if (!endDateStr) return 0;

  const endDate = new Date(endDateStr);
  const now = new Date();

  if (endDate <= now) return 0;

  const msRemaining = endDate.getTime() - now.getTime();
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
}

/**
 * Create subscription routes
 */
function createSubscriptionRoutes() {
  const router = express.Router();

  /**
   * GET /api/subscription/status
   * Get current subscription status for the authenticated user
   */
  router.get('/status', async (req, res) => {
    try {
      const firebaseUid = req.headers['x-firebase-uid'];
      const deviceId = req.headers['x-device-id'];

      if (!firebaseUid && !deviceId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'Provide X-Firebase-UID or X-Device-Id header',
        });
      }

      // Get or create user
      let user = await getOrCreateUser(firebaseUid, deviceId);

      // Set Sentry user context for error tracking
      setSentryUser({
        id: user.firebase_uid || user.id,
        email: user.email || undefined,
      });

      // Update user metadata for analytics (fire-and-forget)
      const metadataUpdate = {
        last_active_at: new Date().toISOString(),
        login_count: admin.firestore.FieldValue.increment(1),
      };
      const userEmail = req.headers['x-user-email'];
      const userDisplayName = req.headers['x-user-displayname'];
      const appVersion = req.headers['x-app-version'];
      const platform = req.headers['x-platform'];
      const signInMethod = req.headers['x-sign-in-method'];

      if (userEmail && !user.email) metadataUpdate.email = userEmail;
      if (userDisplayName) metadataUpdate.display_name = userDisplayName;
      if (appVersion) metadataUpdate.app_version = appVersion;
      if (platform) metadataUpdate.platform = platform;
      if (signInMethod) metadataUpdate.sign_in_method = signInMethod;

      firestore.updateUser(user.id, metadataUpdate).catch(() => {});

      // Check for expiration
      user = await checkExpiration(user);

      // Get tier info
      const tierInfo = getTier(user.tier) || getTier('expired');

      // Calculate trial info
      const trialActive = user.tier === 'trial' && user.trial_ends_at &&
        new Date(user.trial_ends_at) > new Date();

      const trial = {
        active: trialActive,
        startedAt: user.trial_started_at,
        endsAt: user.trial_ends_at,
        daysRemaining: trialActive ? getDaysRemaining(user.trial_ends_at) : 0,
      };

      // Calculate subscription info
      const subscriptionActive = user.tier === 'pro' && user.subscription_expires_at &&
        new Date(user.subscription_expires_at) > new Date();

      const subscription = {
        active: subscriptionActive,
        productId: user.subscription_product_id,
        expiresAt: user.subscription_expires_at,
        willRenew: !!user.subscription_will_renew,
        cancelledAt: user.subscription_cancelled_at,
        daysRemaining: subscriptionActive ? getDaysRemaining(user.subscription_expires_at) : 0,
      };

      // Track login event for GA4 user identity
      const userId = user.firebase_uid || user.id;
      trackEvent(userId, 'login', { tier: user.tier }, userId);

      // Get usage quotas
      const crateBuilderUsage = await usageTracker.getMonthlyUsage(userId, 'crate_builder');
      const trackIdUsage = await usageTracker.getMonthlyUsage(userId, 'track_identification');

      const crateBuilderLimit = getQuota(user.tier, 'crate_builder');
      const trackIdLimit = getQuota(user.tier, 'track_identification');

      // Calculate reset date (first of next month)
      const now = new Date();
      const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

      const quotas = {
        crate_builder: {
          used: crateBuilderUsage.included,
          limit: crateBuilderLimit,
          remaining: Math.max(0, crateBuilderLimit - crateBuilderUsage.included),
          byokUsed: crateBuilderUsage.byok,
          resetDate,
        },
        track_identification: {
          used: trackIdUsage.included,
          limit: trackIdLimit,
          remaining: Math.max(0, trackIdLimit - trackIdUsage.included),
          resetDate,
        },
      };

      // Check beta mode from Remote Config
      const betaMode = await getBetaMode();

      res.json({
        tier: user.tier,
        tierInfo: {
          name: tierInfo.name,
          price: tierInfo.price,
          features: tierInfo.features,
          aiQuotas: tierInfo.aiQuotas,
          byokAllowed: tierInfo.byokAllowed,
        },
        trial,
        subscription,
        quotas,
        userId: userId,
        linkedToFirebase: !!user.firebase_uid,
        betaMode,
      });
    } catch (error) {
      logger.error('[Subscription] Error getting status:', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  });

  /**
   * POST /api/subscription/start-trial
   * Start the free trial for a user (if not already started)
   */
  router.post('/start-trial', async (req, res) => {
    try {
      const firebaseUid = req.headers['x-firebase-uid'];
      const deviceId = req.headers['x-device-id'];

      if (!firebaseUid && !deviceId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get or create user
      let user = await getOrCreateUser(firebaseUid, deviceId);

      // Check if trial already started
      if (user.trial_started_at) {
        return res.status(400).json({
          error: 'Trial already started',
          trialEndsAt: user.trial_ends_at,
          daysRemaining: getDaysRemaining(user.trial_ends_at),
        });
      }

      // Start trial
      const trialDays = await getTrialDurationDays();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + trialDays);

      await firestore.updateUser(user.id, {
        tier: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEnd.toISOString(),
      });

      logger.info(`[Subscription] Trial started for user ${user.firebase_uid || user.id}`);
      const trialUserId = user.firebase_uid || user.id;
      trackEvent(trialUserId, 'trial_started', { user_id: trialUserId }, trialUserId);

      res.json({
        success: true,
        tier: 'trial',
        trialStartedAt: new Date().toISOString(),
        trialEndsAt: trialEnd.toISOString(),
        daysRemaining: trialDays,
      });
    } catch (error) {
      logger.error('[Subscription] Error starting trial:', error);
      res.status(500).json({ error: 'Failed to start trial' });
    }
  });

  /**
   * POST /api/subscription/link-firebase
   * Link a Firebase UID to an existing device-based user
   */
  router.post('/link-firebase', async (req, res) => {
    try {
      const firebaseUid = req.headers['x-firebase-uid'];
      const deviceId = req.headers['x-device-id'];

      if (!firebaseUid) {
        return res.status(400).json({ error: 'X-Firebase-UID header required' });
      }

      // Check if Firebase UID already has an account
      const existingFirebaseUser = await firestore.getUser(firebaseUid);

      if (existingFirebaseUser) {
        // User already has a Firebase-linked account
        return res.json({
          success: true,
          message: 'Firebase account already linked',
          userId: existingFirebaseUser.id,
          tier: existingFirebaseUser.tier,
        });
      }

      // Check if device has an account to link
      if (deviceId) {
        const deviceUser = await firestore.getDeviceUserWithoutFirebase(deviceId);

        if (deviceUser) {
          // Link Firebase UID to device user
          await firestore.linkFirebaseUid(deviceUser.id, firebaseUid);

          logger.info(`[Subscription] Linked Firebase ${firebaseUid} to device user ${deviceUser.id}`);
          trackEvent(firebaseUid, 'firebase_linked', { user_id: firebaseUid, merged: 'true' }, firebaseUid);

          return res.json({
            success: true,
            message: 'Firebase account linked to existing device account',
            userId: deviceUser.id,
            tier: deviceUser.tier,
            merged: true,
          });
        }
      }

      // No existing account - create new one
      const user = await getOrCreateUser(firebaseUid, deviceId);
      trackEvent(firebaseUid, 'firebase_linked', { user_id: firebaseUid, merged: 'false' }, firebaseUid);

      res.json({
        success: true,
        message: 'New account created with Firebase',
        userId: user.id,
        tier: user.tier,
        merged: false,
      });
    } catch (error) {
      logger.error('[Subscription] Error linking Firebase:', error);
      res.status(500).json({ error: 'Failed to link Firebase account' });
    }
  });

  return router;
}

module.exports = createSubscriptionRoutes;
