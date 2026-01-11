const db = require('../../utils/db');
const logger = require('../../utils/logger');
const usageTracker = require('../../utils/usageTracker');
const { getTier, isByokAllowed } = require('../../config/tiers');

/**
 * Require authentication - extracts user from token/session
 * For now, uses X-Device-Id as pseudo-auth until full auth is implemented
 */
function requireAuth(req, res, next) {
  const deviceId = req.headers['x-device-id'];
  const authHeader = req.headers.authorization;

  // TODO: Replace with proper JWT/session validation
  // For now, use device ID as user identifier
  if (!deviceId && !authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Provide X-Device-Id header.',
    });
  }

  const userId = deviceId || 'anonymous';

  // Check if database is initialized
  if (!db.isInitialized()) {
    // Allow requests without DB for development/testing
    logger.warn('[Auth] Database not initialized, using default trial user');
    req.user = {
      id: userId,
      tier: 'trial',
      byokKeyHash: null,
    };
    return next();
  }

  // Look up or create user by device ID
  let user = db.get('SELECT * FROM users WHERE id = ?', [userId]);

  if (!user) {
    // Create trial user (3 day trial)
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    db.run(
      `INSERT INTO users (id, tier, trial_started_at, trial_ends_at)
       VALUES (?, 'trial', datetime('now'), ?)`,
      [userId, trialEnd.toISOString()]
    );

    user = db.get('SELECT * FROM users WHERE id = ?', [userId]);
    logger.info(`[Auth] Created new trial user: ${userId}`);
  }

  // Check if trial expired
  if (user.tier === 'trial' && user.trial_ends_at) {
    if (new Date(user.trial_ends_at) < new Date()) {
      // Trial expired - downgrade to basic (no AI access)
      db.run(`UPDATE users SET tier = 'basic', updated_at = datetime('now') WHERE id = ?`, [userId]);
      user.tier = 'basic';
      logger.info(`[Auth] Trial expired for user: ${userId}`);
    }
  }

  req.user = {
    id: user.id,
    tier: user.tier,
    byokKeyHash: user.byok_key_hash,
    trialEndsAt: user.trial_ends_at,
  };

  next();
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
  return (req, res, next) => {
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
    const quota = usageTracker.checkQuota(req.user.id, req.user.tier, feature, isByok);

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
 */
function optionalAuth(req, res, next) {
  const deviceId = req.headers['x-device-id'];

  if (!deviceId) {
    req.user = null;
    return next();
  }

  // Delegate to requireAuth logic but don't fail
  requireAuth(req, res, (err) => {
    if (err) {
      req.user = null;
    }
    next();
  });
}

module.exports = {
  requireAuth,
  requireTier,
  requireQuota,
  optionalAuth,
};
