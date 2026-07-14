// RevenueCat API Keys
export const REVENUECAT_API_KEY_IOS = 'appl_HdOtnIWFgTxNgZoccSSKxSaBjbA';
export const REVENUECAT_API_KEY_ANDROID = 'goog_XXXXXXXX'; // TODO: Replace with actual Android key

// RevenueCat Entitlement IDs
export const ENTITLEMENTS = {
  PRO: 'pro_access',
};

// RevenueCat Product IDs
export const PRODUCT_IDS = {
  PRO_MONTHLY: 'recrate_pro_monthly',
};

// Subscription tier identifiers
export const SUBSCRIPTION_TIERS = {
  NEW: 'new', // Signed up, trial not started yet
  TRIAL: 'trial',
  PRO: 'pro',
  EXPIRED: 'expired',
};

// Trial duration (default fallback — actual value fetched from Firebase Remote Config)
export const TRIAL_DURATION_DAYS = 7;

// Feature limits and descriptions per tier
export const TIER_FEATURES = {
  [SUBSCRIPTION_TIERS.NEW]: {
    name: 'Free Trial Available',
    aiCrateBuilds: 0,
    trackIdentifications: 0,
    hasAIAccess: false,
    hasOfflineDownloads: false,
    price: 'Free',
    priceValue: 0,
    description: 'Start your 7-day trial',
    features: [
      'Start your free trial to unlock features',
    ],
  },
  [SUBSCRIPTION_TIERS.TRIAL]: {
    name: 'Free Trial',
    aiCrateBuilds: 15,
    trackIdentifications: 10,
    hasAIAccess: true,
    hasOfflineDownloads: false,
    price: 'Free',
    priceValue: 0,
    description: '7-day full access',
    features: [
      'Full library sync',
      'Crate management',
      'Audio streaming',
      'AI Crate Builder (15 builds)',
      'Track Identification (10 IDs)',
    ],
  },
  [SUBSCRIPTION_TIERS.PRO]: {
    name: 'Pro',
    aiCrateBuilds: 15,
    trackIdentifications: 100,
    hasAIAccess: true,
    hasOfflineDownloads: true,
    price: '$9.99/month',
    priceValue: 9.99,
    description: 'Full access with AI features',
    features: [
      'Full library sync',
      'Crate management',
      'Audio streaming',
      'Offline crate downloads',
      'AI Crate Builder (15/month)',
      'Track Identification (100/month)',
      'Priority support',
    ],
  },
  [SUBSCRIPTION_TIERS.EXPIRED]: {
    name: 'Expired',
    aiCrateBuilds: 0,
    trackIdentifications: 0,
    hasAIAccess: false,
    hasOfflineDownloads: false,
    price: 'Subscribe',
    priceValue: 0,
    description: 'Trial ended',
    features: [
      'Limited library access',
      'Subscribe to unlock features',
    ],
  },
};

// Storage keys for persisting subscription data
export const STORAGE_KEYS = {
  TRIAL_START_DATE: 'recrate_trial_start_date',
  HAS_SEEN_TRIAL_SCREEN: 'recrate_has_seen_trial_screen',
  CACHED_TIER: 'recrate_cached_tier',
  USAGE_DATA: 'recrate_usage_data',
};
