/**
 * Subscription Routes
 * Endpoints for checking and syncing subscription status
 *
 * The server is the source of truth for subscription state.
 * Mobile app should sync with these endpoints on launch and periodically.
 */

const express = require('express');
const db = require('../../utils/db');
const logger = require('../../utils/logger');
const usageTracker = require('../../utils/usageTracker');
const { getTier, getQuota } = require('../../config/tiers');

/**
 * Get user by Firebase UID or device ID (for backwards compatibility)
 * @param {string} firebaseUid - Firebase UID
 * @param {string} deviceId - Device ID (fallback)
 * @returns {Object|null} User record
 */
function getUser(firebaseUid, deviceId) {
  // Try Firebase UID first (preferred)
  if (firebaseUid) {
    const user = db.get('SELECT * FROM users WHERE firebase_uid = ?', [firebaseUid]);
    if (user) return user;
  }

  // Fall back to device ID for backwards compatibility
  if (deviceId) {
    // Check device_id column first, then legacy id column
    let user = db.get('SELECT * FROM users WHERE device_id = ?', [deviceId]);
    if (user) return user;

    user = db.get('SELECT * FROM users WHERE id = ? AND firebase_uid IS NULL', [deviceId]);
    if (user) return user;
  }

  return null;
}

/**
 * Create or get user, starting trial if new
 * @param {string} firebaseUid - Firebase UID
 * @param {string} deviceId - Device ID
 * @returns {Object} User record
 */
function getOrCreateUser(firebaseUid, deviceId) {
  let user = getUser(firebaseUid, deviceId);

  if (!user) {
    // Create new user with trial
    const id = firebaseUid || deviceId || `user-${Date.now()}`;
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3); // 3 day trial

    db.run(
      `INSERT INTO users (id, firebase_uid, device_id, tier, trial_started_at, trial_ends_at, created_at, updated_at)
       VALUES (?, ?, ?, 'trial', datetime('now'), ?, datetime('now'), datetime('now'))`,
      [id, firebaseUid || null, deviceId || null, trialEnd.toISOString()]
    );

    user = firebaseUid
      ? db.get('SELECT * FROM users WHERE firebase_uid = ?', [firebaseUid])
      : db.get('SELECT * FROM users WHERE id = ?', [id]);

    logger.info(`[Subscription] Created new trial user: ${id}`);
  }

  // Link Firebase UID to existing device-only user if needed
  if (firebaseUid && user && !user.firebase_uid && user.device_id === deviceId) {
    db.run(
      'UPDATE users SET firebase_uid = ?, updated_at = datetime("now") WHERE id = ?',
      [firebaseUid, user.id]
    );
    user.firebase_uid = firebaseUid;
    logger.info(`[Subscription] Linked Firebase UID ${firebaseUid} to device ${deviceId}`);
  }

  return user;
}

/**
 * Check if trial or subscription has expired and update tier
 * @param {Object} user - User record
 * @returns {Object} Updated user record
 */
function checkExpiration(user) {
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
    db.run(
      'UPDATE users SET tier = ?, updated_at = datetime("now") WHERE id = ?',
      [newTier, user.id]
    );
    db.saveDatabase();
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
   *
   * Headers:
   * - X-Firebase-UID: Firebase user ID (preferred)
   * - X-Device-Id: Device ID (fallback for backwards compatibility)
   *
   * Response:
   * {
   *   tier: 'trial' | 'pro' | 'expired',
   *   tierInfo: { name, price, features, aiQuotas },
   *   trial: { active, startedAt, endsAt, daysRemaining },
   *   subscription: { active, productId, expiresAt, willRenew, daysRemaining },
   *   quotas: {
   *     crate_builder: { used, limit, remaining, resetDate },
   *     track_identification: { used, limit, remaining, resetDate }
   *   }
   * }
   */
  router.get('/status', (req, res) => {
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
      let user = getOrCreateUser(firebaseUid, deviceId);

      // Check for expiration
      user = checkExpiration(user);

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

      // Get usage quotas
      const userId = user.firebase_uid || user.id;
      const crateBuilderUsage = usageTracker.getMonthlyUsage(userId, 'crate_builder');
      const trackIdUsage = usageTracker.getMonthlyUsage(userId, 'track_identification');

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
      });
    } catch (error) {
      logger.error('[Subscription] Error getting status:', error);
      res.status(500).json({ error: 'Failed to get subscription status' });
    }
  });

  /**
   * POST /api/subscription/start-trial
   * Start the free trial for a user (if not already started)
   *
   * This is called by the mobile app when the user accepts the trial.
   * Server-side trial start prevents manipulation of trial dates.
   */
  router.post('/start-trial', (req, res) => {
    try {
      const firebaseUid = req.headers['x-firebase-uid'];
      const deviceId = req.headers['x-device-id'];

      if (!firebaseUid && !deviceId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get or create user
      let user = getOrCreateUser(firebaseUid, deviceId);

      // Check if trial already started
      if (user.trial_started_at) {
        return res.status(400).json({
          error: 'Trial already started',
          trialEndsAt: user.trial_ends_at,
          daysRemaining: getDaysRemaining(user.trial_ends_at),
        });
      }

      // Start trial
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 3); // 3 day trial

      db.run(
        `UPDATE users SET
          tier = 'trial',
          trial_started_at = datetime('now'),
          trial_ends_at = ?,
          updated_at = datetime('now')
        WHERE id = ?`,
        [trialEnd.toISOString(), user.id]
      );

      db.saveDatabase();

      logger.info(`[Subscription] Trial started for user ${user.firebase_uid || user.id}`);

      res.json({
        success: true,
        tier: 'trial',
        trialStartedAt: new Date().toISOString(),
        trialEndsAt: trialEnd.toISOString(),
        daysRemaining: 3,
      });
    } catch (error) {
      logger.error('[Subscription] Error starting trial:', error);
      res.status(500).json({ error: 'Failed to start trial' });
    }
  });

  /**
   * POST /api/subscription/link-firebase
   * Link a Firebase UID to an existing device-based user
   * This merges the device's trial/subscription to the Firebase account
   */
  router.post('/link-firebase', (req, res) => {
    try {
      const firebaseUid = req.headers['x-firebase-uid'];
      const deviceId = req.headers['x-device-id'];

      if (!firebaseUid) {
        return res.status(400).json({ error: 'X-Firebase-UID header required' });
      }

      // Check if Firebase UID already has an account
      const existingFirebaseUser = db.get(
        'SELECT * FROM users WHERE firebase_uid = ?',
        [firebaseUid]
      );

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
        const deviceUser = db.get(
          'SELECT * FROM users WHERE (device_id = ? OR id = ?) AND firebase_uid IS NULL',
          [deviceId, deviceId]
        );

        if (deviceUser) {
          // Link Firebase UID to device user
          db.run(
            `UPDATE users SET
              firebase_uid = ?,
              updated_at = datetime('now')
            WHERE id = ?`,
            [firebaseUid, deviceUser.id]
          );

          db.saveDatabase();

          logger.info(`[Subscription] Linked Firebase ${firebaseUid} to device user ${deviceUser.id}`);

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
      const user = getOrCreateUser(firebaseUid, deviceId);

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
