const db = require('./db');
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
  recordUsage({ userId, deviceId, feature, tier, isByok, tokensIn = 0, tokensOut = 0 }) {
    if (!db.isInitialized()) {
      logger.warn('[UsageTracker] Database not initialized, skipping usage recording');
      return;
    }

    const yearMonth = getCurrentYearMonth();

    // Insert raw usage record
    db.run(
      `INSERT INTO ai_usage (user_id, device_id, feature, tier, is_byok, tokens_in, tokens_out)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, deviceId, feature, tier, isByok ? 1 : 0, tokensIn, tokensOut]
    );

    // Update monthly quota counter - use UPSERT pattern
    const column = isByok ? 'byok_usage' : 'included_usage';

    // Check if row exists
    const existing = db.get(
      `SELECT * FROM monthly_quotas WHERE user_id = ? AND year_month = ? AND feature = ?`,
      [userId, yearMonth, feature]
    );

    if (existing) {
      db.run(
        `UPDATE monthly_quotas SET ${column} = ${column} + 1
         WHERE user_id = ? AND year_month = ? AND feature = ?`,
        [userId, yearMonth, feature]
      );
    } else {
      const values = isByok
        ? [userId, yearMonth, feature, 0, 1]
        : [userId, yearMonth, feature, 1, 0];
      db.run(
        `INSERT INTO monthly_quotas (user_id, year_month, feature, included_usage, byok_usage)
         VALUES (?, ?, ?, ?, ?)`,
        values
      );
    }

    // Force save after usage recording (important for billing accuracy)
    db.saveDatabase();

    logger.info(`[UsageTracker] Recorded ${feature} usage for user ${userId} (BYOK: ${isByok})`);
  },

  /**
   * Get current month usage for a user
   * @param {string} userId - User ID
   * @param {string} feature - 'crate_builder' or 'track_identification'
   * @returns {{ included: number, byok: number }}
   */
  getMonthlyUsage(userId, feature) {
    if (!db.isInitialized()) {
      return { included: 0, byok: 0 };
    }

    const yearMonth = getCurrentYearMonth();
    const row = db.get(
      `SELECT included_usage, byok_usage FROM monthly_quotas
       WHERE user_id = ? AND year_month = ? AND feature = ?`,
      [userId, yearMonth, feature]
    );

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
   * @returns {{ allowed: boolean, remaining: number, limit: number, resetDate: string }}
   */
  checkQuota(userId, tier, feature, isByok) {
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

    const usage = this.getMonthlyUsage(userId, feature);
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
   * @returns {Object} Usage statistics
   */
  getUserStats(userId) {
    if (!db.isInitialized()) {
      return { features: {}, totalUsage: 0 };
    }

    const yearMonth = getCurrentYearMonth();
    const rows = db.all(
      `SELECT feature, included_usage, byok_usage FROM monthly_quotas
       WHERE user_id = ? AND year_month = ?`,
      [userId, yearMonth]
    );

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
  cleanupOldRecords(monthsToKeep = 3) {
    if (!db.isInitialized()) {
      return;
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsToKeep);
    const cutoffMonth = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

    db.run(`DELETE FROM monthly_quotas WHERE year_month < ?`, [cutoffMonth]);
    db.run(
      `DELETE FROM ai_usage WHERE created_at < datetime('now', '-' || ? || ' months')`,
      [monthsToKeep]
    );
    db.saveDatabase();

    logger.info(`[UsageTracker] Cleaned up records older than ${monthsToKeep} months`);
  },
};

module.exports = usageTracker;
