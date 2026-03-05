/**
 * Webhook Routes
 * Handles incoming webhooks from RevenueCat for subscription events
 *
 * SECURITY: All webhooks are verified via Authorization header before processing.
 * RevenueCat sends the configured auth key in the Authorization header.
 * The server becomes the source of truth for subscription state, preventing
 * client-side manipulation or trial abuse.
 *
 * RevenueCat Webhook Events:
 * - INITIAL_PURCHASE: User subscribed for the first time
 * - RENEWAL: Subscription auto-renewed
 * - CANCELLATION: User cancelled (still active until period ends)
 * - UNCANCELLATION: User re-enabled auto-renewal
 * - EXPIRATION: Subscription period ended
 * - BILLING_ISSUE: Payment failed
 * - SUBSCRIBER_ALIAS: User ID changed (e.g., anonymous -> logged in)
 * - PRODUCT_CHANGE: User changed subscription product
 * - TRANSFER: Subscription transferred between users
 */

const express = require('express');
const firestore = require('../utils/firestore');
const logger = require('../utils/logger');

/**
 * Verify RevenueCat webhook authorization
 * RevenueCat sends the configured auth key in the Authorization header
 * @param {string} authHeader - Authorization header value
 * @param {string} expectedAuthKey - Expected auth key from environment
 * @returns {boolean} True if authorization is valid
 */
function verifyAuthorization(authHeader, expectedAuthKey) {
  if (!authHeader || !expectedAuthKey) {
    return false;
  }

  // RevenueCat sends: "Bearer <your_auth_key>"
  const expectedAuth = `Bearer ${expectedAuthKey}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    if (authHeader.length !== expectedAuth.length) {
      return false;
    }
    return require('crypto').timingSafeEqual(
      Buffer.from(authHeader, 'utf8'),
      Buffer.from(expectedAuth, 'utf8')
    );
  } catch (error) {
    return false;
  }
}

/**
 * Get or create user by Firebase UID
 * @param {string} firebaseUid - Firebase UID
 * @returns {Promise<Object>} User record
 */
async function getOrCreateUser(firebaseUid) {
  let user = await firestore.getUser(firebaseUid);

  if (!user) {
    // Also check if this ID exists as a legacy device ID
    user = await firestore.getUserByLegacyId(firebaseUid);

    if (user) {
      // Migrate legacy device ID user to Firebase UID
      await firestore.linkFirebaseUid(user.id, firebaseUid);
      user = await firestore.getUser(firebaseUid);
      logger.info(`[Webhook] Migrated legacy user to Firebase UID: ${firebaseUid}`);
    } else {
      // Create new user - trial will be started when they first use the app
      await firestore.createUser(firebaseUid, {
        firebase_uid: firebaseUid,
        tier: 'trial',
      });
      user = await firestore.getUser(firebaseUid);
      logger.info(`[Webhook] Created new user for Firebase UID: ${firebaseUid}`);
    }
  }

  return user;
}

/**
 * Handle subscription activation (initial purchase or renewal)
 */
async function handleSubscriptionActive(firebaseUid, eventData) {
  const {
    product_id,
    expiration_at_ms,
    purchased_at_ms,
    transaction_id,
    original_transaction_id,
  } = eventData;

  const expiresAt = expiration_at_ms ? new Date(expiration_at_ms).toISOString() : null;
  const startedAt = purchased_at_ms ? new Date(purchased_at_ms).toISOString() : null;

  // Ensure user exists
  await getOrCreateUser(firebaseUid);

  await firestore.updateUser(firebaseUid, {
    tier: 'pro',
    subscription_product_id: product_id,
    subscription_id: original_transaction_id || transaction_id,
    subscription_expires_at: expiresAt,
    subscription_started_at: startedAt,
    subscription_will_renew: 1,
    subscription_cancelled_at: null,
    revenuecat_app_user_id: firebaseUid,
  });

  logger.success(`[Webhook] User ${firebaseUid} subscription activated (expires: ${expiresAt})`);
}

/**
 * Handle subscription cancellation (user cancelled but still active until period ends)
 */
async function handleSubscriptionCancelled(firebaseUid, eventData) {
  const { expiration_at_ms, cancellation_reason } = eventData;
  const expiresAt = expiration_at_ms ? new Date(expiration_at_ms).toISOString() : null;

  await firestore.updateUser(firebaseUid, {
    subscription_will_renew: 0,
    subscription_expires_at: expiresAt,
    subscription_cancelled_at: new Date().toISOString(),
  });

  logger.info(
    `[Webhook] User ${firebaseUid} cancelled subscription (expires: ${expiresAt}, reason: ${cancellation_reason || 'unknown'})`
  );
}

/**
 * Handle subscription uncancellation (user re-enabled auto-renewal)
 */
async function handleSubscriptionUncancelled(firebaseUid, eventData) {
  const { expiration_at_ms } = eventData;
  const expiresAt = expiration_at_ms ? new Date(expiration_at_ms).toISOString() : null;

  await firestore.updateUser(firebaseUid, {
    subscription_will_renew: 1,
    subscription_expires_at: expiresAt,
    subscription_cancelled_at: null,
  });

  logger.info(`[Webhook] User ${firebaseUid} uncancelled subscription (expires: ${expiresAt})`);
}

/**
 * Handle subscription expiration
 */
async function handleSubscriptionExpired(firebaseUid) {
  await firestore.updateUser(firebaseUid, {
    tier: 'expired',
    subscription_will_renew: 0,
  });

  logger.info(`[Webhook] User ${firebaseUid} subscription expired`);
}

/**
 * Handle billing issue (payment failed)
 */
async function handleBillingIssue(firebaseUid, eventData) {
  const { grace_period_expires_at_ms } = eventData;

  // During grace period, subscription is still active
  // After grace period, it will expire
  const gracePeriodEnds = grace_period_expires_at_ms
    ? new Date(grace_period_expires_at_ms).toISOString()
    : null;

  await firestore.updateUser(firebaseUid, {
    subscription_will_renew: 0,
  });

  logger.warn(
    `[Webhook] User ${firebaseUid} billing issue (grace period ends: ${gracePeriodEnds || 'N/A'})`
  );
}

/**
 * Handle user alias change (e.g., anonymous user logs in)
 */
async function handleSubscriberAlias(oldUserId, newUserId, eventData) {
  // Check if old user exists (by firebase_uid or doc ID)
  const oldUser = await firestore.getUserByFirebaseUidOrId(oldUserId);

  if (!oldUser) {
    logger.info(`[Webhook] Alias: Old user ${oldUserId} not found, skipping`);
    return;
  }

  // Check if new user already exists
  const newUser = await firestore.getUser(newUserId);

  if (newUser) {
    // Merge: Copy subscription data from old to new if new doesn't have active subscription
    if (oldUser.tier === 'pro' && newUser.tier !== 'pro') {
      await firestore.updateUser(newUserId, {
        tier: oldUser.tier,
        subscription_product_id: oldUser.subscription_product_id,
        subscription_id: oldUser.subscription_id,
        subscription_expires_at: oldUser.subscription_expires_at,
        subscription_started_at: oldUser.subscription_started_at,
        subscription_will_renew: oldUser.subscription_will_renew,
        revenuecat_app_user_id: newUserId,
      });
      logger.info(`[Webhook] Merged subscription from ${oldUserId} to ${newUserId}`);
    }
  } else {
    // Update old user's Firebase UID to new UID
    await firestore.linkFirebaseUid(oldUser.id, newUserId, {
      revenuecat_app_user_id: newUserId,
    });
    logger.info(`[Webhook] Aliased user ${oldUserId} -> ${newUserId}`);
  }
}

/**
 * Handle product change (user upgraded/downgraded)
 */
async function handleProductChange(firebaseUid, eventData) {
  const { new_product_id, expiration_at_ms } = eventData;
  const expiresAt = expiration_at_ms ? new Date(expiration_at_ms).toISOString() : null;

  await firestore.updateUser(firebaseUid, {
    tier: 'pro',
    subscription_product_id: new_product_id,
    subscription_expires_at: expiresAt,
    subscription_will_renew: 1,
  });

  logger.info(`[Webhook] User ${firebaseUid} changed product to ${new_product_id}`);
}

/**
 * Create webhook routes
 */
function createWebhookRoutes() {
  const router = express.Router();

  /**
   * POST /api/webhooks/revenuecat
   * Receives subscription events from RevenueCat
   */
  router.post('/revenuecat', express.raw({ type: 'application/json' }), async (req, res) => {
    const startTime = Date.now();

    try {
      const webhookAuthKey = process.env.REVENUECAT_WEBHOOK_AUTH_KEY;

      if (!webhookAuthKey) {
        logger.error('[Webhook] REVENUECAT_WEBHOOK_AUTH_KEY not configured');
        // Return 200 to prevent RevenueCat from retrying (misconfiguration, not transient error)
        return res.status(200).json({ received: true, error: 'Webhook not configured' });
      }

      // Get Authorization header
      const authHeader = req.headers['authorization'];

      // Verify authorization
      if (!verifyAuthorization(authHeader, webhookAuthKey)) {
        logger.warn('[Webhook] Invalid RevenueCat authorization');
        // Return 401 for invalid authorization
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Get raw body and parse the JSON
      const rawBody = req.body.toString('utf8');
      const payload = JSON.parse(rawBody);
      const { event } = payload;

      if (!event) {
        logger.warn('[Webhook] No event in payload');
        return res.status(400).json({ error: 'No event in payload' });
      }

      const {
        type,
        app_user_id, // This should be Firebase UID (set via Purchases.logIn)
        original_app_user_id,
      } = event;

      // Use app_user_id as Firebase UID (we set this via Purchases.logIn in mobile app)
      const firebaseUid = app_user_id;

      logger.info(`[Webhook] RevenueCat event: ${type} for user ${firebaseUid}`);

      // Handle different event types
      switch (type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
        case 'PRODUCT_CHANGE':
          await handleSubscriptionActive(firebaseUid, event);
          break;

        case 'CANCELLATION':
          await handleSubscriptionCancelled(firebaseUid, event);
          break;

        case 'UNCANCELLATION':
          await handleSubscriptionUncancelled(firebaseUid, event);
          break;

        case 'EXPIRATION':
        case 'BILLING_ISSUE':
          // For billing issues, we mark as potentially expiring
          // but don't immediately downgrade (grace period)
          if (type === 'EXPIRATION') {
            await handleSubscriptionExpired(firebaseUid);
          } else {
            await handleBillingIssue(firebaseUid, event);
          }
          break;

        case 'SUBSCRIBER_ALIAS':
          await handleSubscriberAlias(original_app_user_id, app_user_id, event);
          break;

        case 'TRANSFER':
          // Subscription transferred to another user
          // The new owner will get an INITIAL_PURCHASE event
          logger.info(`[Webhook] Subscription transferred from ${original_app_user_id} to ${app_user_id}`);
          await handleSubscriptionExpired(original_app_user_id);
          break;

        case 'NON_RENEWING_PURCHASE':
          // One-time purchase (if you add this later)
          await handleSubscriptionActive(firebaseUid, event);
          break;

        default:
          logger.info(`[Webhook] Unhandled event type: ${type}`);
      }

      const duration = Date.now() - startTime;
      logger.info(`[Webhook] Processed ${type} in ${duration}ms`);

      // Always return 200 to acknowledge receipt
      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('[Webhook] Error processing RevenueCat webhook:', error);

      // Return 200 to prevent infinite retries for malformed payloads
      // Log the error for investigation
      res.status(200).json({ received: true, error: error.message });
    }
  });

  /**
   * GET /api/webhooks/health
   * Health check for webhook endpoint
   */
  router.get('/health', (req, res) => {
    const configured = !!process.env.REVENUECAT_WEBHOOK_AUTH_KEY;

    res.json({
      status: 'ok',
      configured,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

module.exports = createWebhookRoutes;
