import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {
  REVENUECAT_API_KEY_IOS,
  REVENUECAT_API_KEY_ANDROID,
  ENTITLEMENTS,
  SUBSCRIPTION_TIERS,
  TRIAL_DURATION_DAYS,
  TIER_FEATURES,
  STORAGE_KEYS,
} from '../constants/subscription';

// Check if running in Expo Go (which doesn't support native modules like RevenueCat)
const isExpoGo = Constants.appOwnership === 'expo';

// RevenueCat module - only available in development builds with native code
// To enable purchases, add to package.json: "react-native-purchases": "^9.6.15"
// Then create a development build: npx expo run:ios or eas build --profile development
let Purchases = null;
let revenueCatAvailable = false;
let revenueCatChecked = false;

const loadRevenueCat = async () => {
  if (revenueCatChecked) return revenueCatAvailable;
  revenueCatChecked = true;

  // Skip loading RevenueCat in Expo Go - it requires native modules
  if (isExpoGo) {
    console.log('[SubscriptionService] Expo Go detected - running in trial-only mode');
    revenueCatAvailable = false;
    return false;
  }

  // Check if native module exists before requiring (prevents NativeEventEmitter error
  // when package was removed from package.json but native code is still in dev build)
  const { NativeModules } = require('react-native');
  if (!NativeModules.RNPurchases) {
    console.log('[SubscriptionService] RevenueCat native module not found - running in trial-only mode');
    revenueCatAvailable = false;
    return false;
  }

  try {
    // Attempt to load RevenueCat (only works if added to package.json and native build created)
    Purchases = require('react-native-purchases').default;
    revenueCatAvailable = true;
    console.log('[SubscriptionService] RevenueCat loaded successfully');
    return true;
  } catch (error) {
    console.log('[SubscriptionService] RevenueCat not installed - running in trial-only mode');
    console.log('[SubscriptionService] To enable purchases, add react-native-purchases and create a dev build');
    revenueCatAvailable = false;
    return false;
  }
};

/**
 * Service for managing RevenueCat subscriptions and trial periods
 */
const SubscriptionService = {
  _initialized: false,
  _customerInfoCache: null,
  _cacheTimestamp: null,
  _cacheTTL: 5 * 60 * 1000, // 5 minutes

  /**
   * Initialize RevenueCat SDK
   */
  initialize: async () => {
    if (SubscriptionService._initialized) {
      return true;
    }

    // Try to load RevenueCat (will fail gracefully in Expo Go)
    const available = await loadRevenueCat();
    if (!available) {
      console.log('[SubscriptionService] Running in trial-only mode (no RevenueCat)');
      SubscriptionService._initialized = true;
      return true;
    }

    try {
      const apiKey = Platform.OS === 'ios'
        ? REVENUECAT_API_KEY_IOS
        : REVENUECAT_API_KEY_ANDROID;

      await Purchases.configure({ apiKey });
      SubscriptionService._initialized = true;
      console.log('[SubscriptionService] RevenueCat initialized');
      return true;
    } catch (error) {
      console.error('[SubscriptionService] Failed to initialize:', error);
      SubscriptionService._initialized = true; // Still mark as initialized to allow trial mode
      return false;
    }
  },

  /**
   * Set the user ID for RevenueCat (use device ID)
   */
  setUserId: async (userId) => {
    try {
      if (!SubscriptionService._initialized) {
        await SubscriptionService.initialize();
      }
      if (!revenueCatAvailable) {
        console.log('[SubscriptionService] RevenueCat not available, skipping setUserId');
        return true;
      }
      await Purchases.logIn(userId);
      console.log('[SubscriptionService] User ID set:', userId);
      return true;
    } catch (error) {
      console.error('[SubscriptionService] Failed to set user ID:', error);
      return false;
    }
  },

  /**
   * Get customer info from RevenueCat (with caching)
   */
  getCustomerInfo: async (forceRefresh = false) => {
    try {
      const now = Date.now();

      // Return cached data if valid and not forcing refresh
      if (
        !forceRefresh &&
        SubscriptionService._customerInfoCache &&
        SubscriptionService._cacheTimestamp &&
        now - SubscriptionService._cacheTimestamp < SubscriptionService._cacheTTL
      ) {
        return SubscriptionService._customerInfoCache;
      }

      if (!SubscriptionService._initialized) {
        await SubscriptionService.initialize();
      }

      // Return null if RevenueCat not available (trial-only mode)
      if (!revenueCatAvailable) {
        return null;
      }

      const customerInfo = await Purchases.getCustomerInfo();
      SubscriptionService._customerInfoCache = customerInfo;
      SubscriptionService._cacheTimestamp = now;
      return customerInfo;
    } catch (error) {
      console.error('[SubscriptionService] Failed to get customer info:', error);
      // Return cached data on error if available
      return SubscriptionService._customerInfoCache;
    }
  },

  /**
   * Determine current subscription tier based on RevenueCat entitlements and trial status
   */
  getCurrentTier: async () => {
    try {
      // First check if in trial period
      const trialActive = await SubscriptionService.isTrialActive();
      if (trialActive) {
        return SUBSCRIPTION_TIERS.TRIAL;
      }

      // Check RevenueCat entitlements
      const customerInfo = await SubscriptionService.getCustomerInfo();

      if (customerInfo?.entitlements?.active?.[ENTITLEMENTS.PRO]) {
        return SUBSCRIPTION_TIERS.PRO;
      }

      // Check if trial has been started but expired
      const hasStartedTrial = await SubscriptionService.hasStartedTrial();
      if (hasStartedTrial) {
        return SUBSCRIPTION_TIERS.EXPIRED;
      }

      // New user - treat as pre-trial (will show trial screen)
      return SUBSCRIPTION_TIERS.TRIAL;
    } catch (error) {
      console.error('[SubscriptionService] Failed to get current tier:', error);
      // Fallback to cached tier
      const cachedTier = await SecureStore.getItemAsync(STORAGE_KEYS.CACHED_TIER);
      return cachedTier || SUBSCRIPTION_TIERS.EXPIRED;
    }
  },

  /**
   * Start the free trial period
   */
  startTrial: async () => {
    try {
      const now = new Date().toISOString();
      await SecureStore.setItemAsync(STORAGE_KEYS.TRIAL_START_DATE, now);
      console.log('[SubscriptionService] Trial started:', now);
      return true;
    } catch (error) {
      console.error('[SubscriptionService] Failed to start trial:', error);
      return false;
    }
  },

  /**
   * Get trial start date
   */
  getTrialStartDate: async () => {
    try {
      const dateStr = await SecureStore.getItemAsync(STORAGE_KEYS.TRIAL_START_DATE);
      return dateStr ? new Date(dateStr) : null;
    } catch (error) {
      console.error('[SubscriptionService] Failed to get trial start date:', error);
      return null;
    }
  },

  /**
   * Check if user has ever started a trial
   */
  hasStartedTrial: async () => {
    const startDate = await SubscriptionService.getTrialStartDate();
    return startDate !== null;
  },

  /**
   * Get trial end date
   */
  getTrialEndDate: async () => {
    const startDate = await SubscriptionService.getTrialStartDate();
    if (!startDate) return null;

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);
    return endDate;
  },

  /**
   * Check if trial is currently active
   */
  isTrialActive: async () => {
    const endDate = await SubscriptionService.getTrialEndDate();
    if (!endDate) return false;

    return new Date() < endDate;
  },

  /**
   * Get remaining trial days
   */
  getTrialDaysRemaining: async () => {
    const endDate = await SubscriptionService.getTrialEndDate();
    if (!endDate) return 0;

    const now = new Date();
    if (now >= endDate) return 0;

    const msRemaining = endDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
    return Math.max(0, daysRemaining);
  },

  /**
   * Check if user has seen the trial start screen
   */
  hasSeenTrialScreen: async () => {
    try {
      const seen = await SecureStore.getItemAsync(STORAGE_KEYS.HAS_SEEN_TRIAL_SCREEN);
      return seen === 'true';
    } catch (error) {
      return false;
    }
  },

  /**
   * Mark trial start screen as seen
   */
  markTrialScreenSeen: async () => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.HAS_SEEN_TRIAL_SCREEN, 'true');
      return true;
    } catch (error) {
      console.error('[SubscriptionService] Failed to mark trial screen seen:', error);
      return false;
    }
  },

  /**
   * Get available subscription offerings
   */
  getOfferings: async () => {
    try {
      if (!SubscriptionService._initialized) {
        await SubscriptionService.initialize();
      }
      if (!revenueCatAvailable) {
        console.log('[SubscriptionService] RevenueCat not available, no offerings');
        return null;
      }
      const offerings = await Purchases.getOfferings();
      return offerings;
    } catch (error) {
      console.error('[SubscriptionService] Failed to get offerings:', error);
      return null;
    }
  },

  /**
   * Purchase a package
   */
  purchasePackage: async (packageToPurchase) => {
    if (!revenueCatAvailable) {
      return { success: false, error: 'Purchases not available in Expo Go. Use a development build.' };
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

      // Update cache
      SubscriptionService._customerInfoCache = customerInfo;
      SubscriptionService._cacheTimestamp = Date.now();

      // Cache the new tier
      const tier = await SubscriptionService.getCurrentTier();
      await SecureStore.setItemAsync(STORAGE_KEYS.CACHED_TIER, tier);

      return { success: true, customerInfo };
    } catch (error) {
      if (error.userCancelled) {
        return { success: false, cancelled: true };
      }
      console.error('[SubscriptionService] Purchase failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Restore previous purchases
   */
  restorePurchases: async () => {
    if (!revenueCatAvailable) {
      return { success: false, error: 'Purchases not available in Expo Go. Use a development build.' };
    }
    try {
      if (!SubscriptionService._initialized) {
        await SubscriptionService.initialize();
      }
      const customerInfo = await Purchases.restorePurchases();

      // Update cache
      SubscriptionService._customerInfoCache = customerInfo;
      SubscriptionService._cacheTimestamp = Date.now();

      // Cache the restored tier
      const tier = await SubscriptionService.getCurrentTier();
      await SecureStore.setItemAsync(STORAGE_KEYS.CACHED_TIER, tier);

      return { success: true, customerInfo };
    } catch (error) {
      console.error('[SubscriptionService] Restore failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Check if user can access AI features
   */
  canUseAI: async () => {
    const tier = await SubscriptionService.getCurrentTier();
    return TIER_FEATURES[tier]?.hasAIAccess ?? false;
  },

  /**
   * Get tier features for display
   */
  getTierFeatures: (tier) => {
    return TIER_FEATURES[tier] || TIER_FEATURES[SUBSCRIPTION_TIERS.EXPIRED];
  },

  /**
   * Clear all subscription data (for testing/logout)
   */
  clearAllData: async () => {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEYS.TRIAL_START_DATE);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.HAS_SEEN_TRIAL_SCREEN);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.CACHED_TIER);
      await SecureStore.deleteItemAsync(STORAGE_KEYS.USAGE_DATA);
      SubscriptionService._customerInfoCache = null;
      SubscriptionService._cacheTimestamp = null;
      return true;
    } catch (error) {
      console.error('[SubscriptionService] Failed to clear data:', error);
      return false;
    }
  },

  // ============================================
  // DEBUG FUNCTIONS (for testing trial scenarios)
  // ============================================

  /**
   * DEBUG: Set trial start date to a specific date
   * @param {Date|string} date - The date to set as trial start
   */
  setTrialStartDate: async (date) => {
    const dateStr = date instanceof Date ? date.toISOString() : date;
    await SecureStore.setItemAsync(STORAGE_KEYS.TRIAL_START_DATE, dateStr);
    console.log('[SubscriptionService] DEBUG: Trial start set to:', dateStr);
    return dateStr;
  },

  /**
   * DEBUG: Simulate trial with X days remaining
   * Sets the trial start date to (TRIAL_DURATION_DAYS - days) ago
   * @param {number} days - Number of days remaining in trial
   */
  simulateTrialDaysRemaining: async (days) => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (TRIAL_DURATION_DAYS - days));
    await SubscriptionService.setTrialStartDate(startDate);
    console.log(`[SubscriptionService] DEBUG: Simulated ${days} days remaining`);
    return startDate.toISOString();
  },

  /**
   * DEBUG: Simulate expired trial
   * Sets the trial start date to (TRIAL_DURATION_DAYS + 1) days ago
   */
  simulateExpiredTrial: async () => {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - (TRIAL_DURATION_DAYS + 1));
    await SubscriptionService.setTrialStartDate(expiredDate);
    console.log('[SubscriptionService] DEBUG: Trial set to expired');
    return expiredDate.toISOString();
  },

  /**
   * DEBUG: Get current trial debug info
   * Returns all trial-related dates and status for debugging
   */
  getDebugInfo: async () => {
    const startDate = await SubscriptionService.getTrialStartDate();
    const endDate = await SubscriptionService.getTrialEndDate();
    const daysRemaining = await SubscriptionService.getTrialDaysRemaining();
    const isActive = await SubscriptionService.isTrialActive();
    const tier = await SubscriptionService.getCurrentTier();

    const info = {
      trialStartDate: startDate?.toISOString() || null,
      trialEndDate: endDate?.toISOString() || null,
      daysRemaining,
      isTrialActive: isActive,
      currentTier: tier,
      now: new Date().toISOString(),
    };

    console.log('[SubscriptionService] DEBUG Info:', JSON.stringify(info, null, 2));
    return info;
  },
};

export default SubscriptionService;
