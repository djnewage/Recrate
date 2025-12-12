/**
 * Subscription configuration constants
 */

// RevenueCat API keys (test mode)
export const REVENUECAT_API_KEY_IOS = 'test_FNSywFWxeLiyYfmcXhIpxDQJjyw';
export const REVENUECAT_API_KEY_ANDROID = 'test_FNSywFWxeLiyYfmcXhIpxDQJjyw';

// Entitlement ID - must match RevenueCat dashboard
export const ENTITLEMENT_ID = 'Recrate Pro';

// Product identifier - must match App Store Connect / Google Play Console
export const PRODUCT_ID = 'recrate_pro_monthly';

// Free tier limits
export const MAX_FREE_CRATES = 1;

// In-app free trial (no payment required)
export const TRIAL_DAYS = 3;

// Premium feature identifiers for analytics/tracking
export const PREMIUM_FEATURES = {
  UNLIMITED_CRATES: 'unlimited_crates',
  TRACK_IDENTIFICATION: 'track_identification',
  ADVANCED_FILTERS: 'advanced_filters',
  NESTED_CRATES: 'nested_crates',
};

// Feature descriptions for paywall
export const FEATURE_DESCRIPTIONS = {
  [PREMIUM_FEATURES.UNLIMITED_CRATES]: {
    title: 'Unlimited Crates',
    description: 'Create as many crates as you need to organize your library',
    icon: 'folder-open',
  },
  [PREMIUM_FEATURES.TRACK_IDENTIFICATION]: {
    title: 'Track Identification',
    description: 'Identify any playing track with Shazam-like technology',
    icon: 'mic',
  },
  [PREMIUM_FEATURES.ADVANCED_FILTERS]: {
    title: 'Advanced Filters',
    description: 'Filter by BPM range, musical key, and genre',
    icon: 'options',
  },
  [PREMIUM_FEATURES.NESTED_CRATES]: {
    title: 'Nested Crates',
    description: 'Organize crates within crates for better structure',
    icon: 'git-branch',
  },
};
