/**
 * Recrate Subscription Tiers
 * This is the authoritative reference for pricing and features.
 *
 * Single paid plan model:
 * - Free Trial: 7 days (Remote Config `trial_duration_days`), full access
 * - Pro ($9.99/mo): full app + monthly AI allowance
 * - BYOK: Pro users can use their own Anthropic key (no allowance deduction for crate_builder)
 *
 * The monthly crate_builder limit can be overridden live via Remote Config
 * `crate_builder_monthly_limit` (applies a single flat limit across tiers).
 *
 * BYOK RULES:
 * - crate_builder: BYOK bypasses quota (user pays their own Anthropic costs)
 * - track_identification: BYOK does NOT bypass quota (still uses our ACRCloud)
 */

const TIERS = {
  trial: {
    name: 'Free Trial',
    price: 0,
    duration: 7, // days (Remote Config trial_duration_days is the live source)
    features: {
      crateManagement: true,
      audioStreaming: true,
      remoteAccess: true,
      aiCrateBuilder: true,
      trackIdentification: true,
    },
    aiQuotas: {
      crate_builder: 15,
      track_identification: 10,
    },
    byokAllowed: false,
  },
  pro: {
    name: 'Pro',
    price: 9.99,
    features: {
      crateManagement: true,
      audioStreaming: true,
      remoteAccess: true,
      aiCrateBuilder: true,
      trackIdentification: true,
    },
    aiQuotas: {
      crate_builder: 15,
      track_identification: 100,
    },
    byokAllowed: true,
  },
  expired: {
    name: 'Expired',
    price: 0,
    features: {
      crateManagement: true,  // Allow basic browsing
      audioStreaming: false,
      remoteAccess: false,
      aiCrateBuilder: false,
      trackIdentification: false,
    },
    aiQuotas: {
      crate_builder: 0,
      track_identification: 0,
    },
    byokAllowed: false,
  },
};

/**
 * Get tier configuration by name
 * @param {string} tierName - 'trial' or 'pro'
 * @returns {Object|null} Tier configuration
 */
function getTier(tierName) {
  return TIERS[tierName] || null;
}

/**
 * Get AI quota for a tier and feature
 * @param {string} tierName - 'trial' or 'pro'
 * @param {string} feature - 'crate_builder' or 'track_identification'
 * @returns {number} Quota limit (0 = blocked)
 */
function getQuota(tierName, feature) {
  const tier = TIERS[tierName];
  if (!tier) return 0;
  return tier.aiQuotas[feature] ?? 0;
}

/**
 * Check if a tier allows BYOK
 * @param {string} tierName - 'trial' or 'pro'
 * @returns {boolean}
 */
function isByokAllowed(tierName) {
  const tier = TIERS[tierName];
  return tier?.byokAllowed ?? false;
}

/**
 * Check if BYOK bypasses quota for a specific feature
 * @param {string} feature - 'crate_builder' or 'track_identification'
 * @returns {boolean}
 */
function byokBypassesQuota(feature) {
  // BYOK only bypasses quota for crate_builder (uses user's Anthropic key)
  // track_identification always uses our ACRCloud, so no bypass
  return feature === 'crate_builder';
}

module.exports = {
  TIERS,
  getTier,
  getQuota,
  isByokAllowed,
  byokBypassesQuota,
};
