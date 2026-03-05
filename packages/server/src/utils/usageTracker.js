const firestore = require('./firestore');
const logger = require('./logger');
const { getQuota, byokBypassesQuota } = require('../config/tiers');

/**
 * Get current year-month string for quota tracking
 * @returns {string} Format: "YYYY-MM"
 */
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get the first day of next month (UTC) for quota reset date
 * @returns {Date}
 */
function getNextResetDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

const usageTracker = {
  /**
   * Record an AI usage event
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.deviceId - Device ID
   * @param {string} params.feature - 'crate_builder' or 'track_identification'
   * @param {string} params.tier - User's tier
   * @param {boolean} params.isByok - Whether BYOK key was used
   * @param {number} params.tokensIn - Input tokens (for AI features)
   * @param {number} params.tokensOut - Output tokens (for AI features)
   */
  async recordUsage({ userId, deviceId, feature, tier, isByok, tokensIn = 0, tokensOut = 0 }) {
    if (!firestore.isAvailable()) {
      logger.warn('[UsageTracker] Firestore not available, skipping usage recording');
      return;
    }

    const yearMonth = getCurrentYearMonth();

    // Insert raw usage record
    await firestore.recordAiUsage(userId, {
      device_id: deviceId,
      feature,
      tier,
      is_byok: !!isByok,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    });

    // Update monthly quota counter using transaction
    await firestore.incrementQuota(userId, yearMonth, feature, isByok);

    logger.info(`[UsageTracker] Recorded ${feature} usage for user ${userId} (BYOK: ${isByok})`);
  },

  /**
   * Get current month usage for a user
   * @param {string} userId - User ID
   * @param {string} feature - 'crate_builder' or 'track_identification'
   * @returns {Promise<{ included: number, byok: number }>}
   */
  async getMonthlyUsage(userId, feature) {
    if (!firestore.isAvailable()) {
      return { included: 0, byok: 0 };
    }

    const yearMonth = getCurrentYearMonth();
    const row = await firestore.getMonthlyQuota(userId, yearMonth, feature);

    return {
      included: row?.included_usage || 0,
      byok: row?.byok_usage || 0,
    };
  },

  /**
   * Check if user has quota remaining
   * IMPORTANT: Call BEFORE making API calls
   * @param {string} userId - User ID
   * @param {string} tier - User's tier
   * @param {string} feature - 'crate_builder' or 'track_identification'
   * @param {boolean} isByok - Whether BYOK key will be used
   * @returns {Promise<{ allowed: boolean, remaining: number, limit: number, resetDate: string }>}
   */
  async checkQuota(userId, tier, feature, isByok) {
    const resetDate = getNextResetDate().toISOString();

    // BYOK bypasses quota for crate_builder only (uses user's Anthropic key)
    // track_identification always uses our ACRCloud, so no bypass
    if (isByok && byokBypassesQuota(feature)) {
      return { allowed: true, remaining: Infinity, limit: Infinity, resetDate: null };
    }

    const limit = getQuota(tier, feature);

    // Zero limit = feature blocked for this tier
    if (limit === 0) {
      return { allowed: false, remaining: 0, limit: 0, resetDate };
    }

    const usage = await this.getMonthlyUsage(userId, feature);
    const remaining = Math.max(0, limit - usage.included);

    return {
      allowed: remaining > 0,
      remaining,
      limit,
      resetDate,
    };
  },

  /**
   * Get usage stats for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Usage statistics
   */
  async getUserStats(userId) {
    if (!firestore.isAvailable()) {
      return { features: {}, totalUsage: 0 };
    }

    const yearMonth = getCurrentYearMonth();
    const rows = await firestore.getAllMonthlyQuotas(userId, yearMonth);

    const features = {};
    let totalUsage = 0;

    for (const row of rows) {
      features[row.feature] = {
        included: row.included_usage || 0,
        byok: row.byok_usage || 0,
      };
      totalUsage += (row.included_usage || 0) + (row.byok_usage || 0);
    }

    return { features, totalUsage, yearMonth };
  },

  /**
   * Clean up old records to prevent unbounded growth
   * @param {number} monthsToKeep - Number of months of history to retain
   */
  async cleanupOldRecords(monthsToKeep = 3) {
    if (!firestore.isAvailable()) {
      return;
    }

    await firestore.cleanupOldRecords(monthsToKeep);
    logger.info(`[UsageTracker] Cleaned up records older than ${monthsToKeep} months`);
  },
};

module.exports = usageTracker;
