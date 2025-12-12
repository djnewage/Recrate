/**
 * Subscription Store - RevenueCat integration for freemium model
 * Includes 3-day free trial for all new users (no payment required)
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  REVENUECAT_API_KEY_IOS,
  REVENUECAT_API_KEY_ANDROID,
  ENTITLEMENT_ID,
  MAX_FREE_CRATES,
  TRIAL_DAYS,
} from '../constants/subscription';

const TRIAL_START_KEY = '@recrate/trial_start_date';

// Detect if running in Expo Go (which doesn't support native modules)
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Lazy load Purchases to avoid crash in Expo Go
let Purchases = null;
let LOG_LEVEL = null;
if (!isExpoGo) {
  try {
    const PurchasesModule = require('react-native-purchases');
    Purchases = PurchasesModule.default;
    LOG_LEVEL = PurchasesModule.LOG_LEVEL;
  } catch (e) {
    console.warn('[Subscription] Failed to load react-native-purchases:', e.message);
  }
}

const useSubscriptionStore = create((set, get) => ({
  // Environment detection
  isExpoGo,

  // Subscription state
  isPremium: false,
  isLoading: true,
  isInitialized: false,

  // Subscription details
  activeSubscription: null, // { productId, expiresDate, isTrial, willRenew }
  offerings: null,

  // Free tier tracking
  crateCount: 0,

  // In-app free trial state
  trialStartDate: null,
  isInFreeTrial: false,
  trialDaysRemaining: 0,

  // Error state
  error: null,

  /**
   * Initialize the free trial (called on every app launch)
   */
  initializeTrial: async () => {
    try {
      let trialStart = await AsyncStorage.getItem(TRIAL_START_KEY);

      // First time user - start the trial
      if (!trialStart) {
        trialStart = new Date().toISOString();
        await AsyncStorage.setItem(TRIAL_START_KEY, trialStart);
        console.log('[Subscription] Free trial started');
      }

      const startDate = new Date(trialStart);
      const now = new Date();
      const daysPassed = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const daysRemaining = Math.max(0, Math.ceil(TRIAL_DAYS - daysPassed));
      const isInTrial = daysPassed < TRIAL_DAYS;

      set({
        trialStartDate: startDate,
        isInFreeTrial: isInTrial,
        trialDaysRemaining: daysRemaining,
      });

      console.log(`[Subscription] Trial status: ${isInTrial ? `Active (${daysRemaining} days left)` : 'Expired'}`);
    } catch (error) {
      console.error('[Subscription] Trial initialization error:', error);
    }
  },

  /**
   * Check if user has premium access (subscription OR active trial)
   */
  hasPremiumAccess: () => {
    const { isPremium, isInFreeTrial } = get();
    return isPremium || isInFreeTrial;
  },

  /**
   * Initialize RevenueCat SDK
   */
  initialize: async () => {
    // Always initialize the free trial first
    await get().initializeTrial();

    // Skip RevenueCat in Expo Go - native modules not available
    if (isExpoGo || !Purchases) {
      console.warn('[Subscription] Running in Expo Go - RevenueCat disabled. Subscription features will be unavailable.');
      set({
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    try {
      const apiKey = Platform.OS === 'ios'
        ? REVENUECAT_API_KEY_IOS
        : REVENUECAT_API_KEY_ANDROID;

      // Skip initialization if using placeholder keys
      if (apiKey.includes('REPLACE_WITH')) {
        console.log('[Subscription] Using placeholder API key - subscription features disabled');
        set({
          isLoading: false,
          isInitialized: true,
          isPremium: false,
        });
        return;
      }

      // Enable verbose logging for debugging
      if (LOG_LEVEL) {
        Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
      }

      await Purchases.configure({ apiKey });

      // Set up listener for subscription changes
      Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        get().updateSubscriptionStatus(customerInfo);
      });

      // Check current subscription status
      await get().checkSubscription();

      // Load offerings
      await get().loadOfferings();

      set({ isInitialized: true });
    } catch (error) {
      console.error('[Subscription] Initialize error:', error);
      set({
        error: error.message,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  /**
   * Check current subscription status
   */
  checkSubscription: async () => {
    if (isExpoGo || !Purchases) return;

    try {
      set({ isLoading: true });
      const customerInfo = await Purchases.getCustomerInfo();
      get().updateSubscriptionStatus(customerInfo);
    } catch (error) {
      console.error('[Subscription] Check subscription error:', error);
      set({ error: error.message, isLoading: false });
    }
  },

  /**
   * Update subscription status from customer info
   */
  updateSubscriptionStatus: (customerInfo) => {
    const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

    if (entitlement) {
      set({
        isPremium: true,
        activeSubscription: {
          productId: entitlement.productIdentifier,
          expiresDate: entitlement.expirationDate ? new Date(entitlement.expirationDate) : null,
          isTrial: entitlement.periodType === 'TRIAL',
          willRenew: entitlement.willRenew,
        },
        isLoading: false,
        error: null,
      });
    } else {
      set({
        isPremium: false,
        activeSubscription: null,
        isLoading: false,
        error: null,
      });
    }
  },

  /**
   * Load available offerings from RevenueCat
   */
  loadOfferings: async () => {
    if (isExpoGo || !Purchases) return;

    try {
      const offerings = await Purchases.getOfferings();
      set({ offerings: offerings.current });
    } catch (error) {
      console.error('[Subscription] Load offerings error:', error);
    }
  },

  /**
   * Purchase a package
   */
  purchasePackage: async (pkg) => {
    if (isExpoGo || !Purchases) {
      return { success: false, error: 'Purchases unavailable in Expo Go' };
    }

    try {
      set({ isLoading: true, error: null });
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      get().updateSubscriptionStatus(customerInfo);
      return { success: true };
    } catch (error) {
      // User cancelled is not an error
      if (error.userCancelled) {
        set({ isLoading: false });
        return { success: false, cancelled: true };
      }

      console.error('[Subscription] Purchase error:', error);
      set({ error: error.message, isLoading: false });
      return { success: false, error: error.message };
    }
  },

  /**
   * Restore previous purchases
   */
  restorePurchases: async () => {
    if (isExpoGo || !Purchases) {
      return { success: false, error: 'Purchases unavailable in Expo Go' };
    }

    try {
      set({ isLoading: true, error: null });
      const customerInfo = await Purchases.restorePurchases();
      get().updateSubscriptionStatus(customerInfo);

      const isPremium = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
      return { success: true, restored: isPremium };
    } catch (error) {
      console.error('[Subscription] Restore error:', error);
      set({ error: error.message, isLoading: false });
      return { success: false, error: error.message };
    }
  },

  /**
   * Update crate count for free tier gating
   */
  updateCrateCount: (count) => {
    set({ crateCount: count });
  },

  /**
   * Check if user can create a new crate
   */
  canCreateCrate: () => {
    const { crateCount } = get();
    const hasPremium = get().hasPremiumAccess();
    return hasPremium || crateCount < MAX_FREE_CRATES;
  },

  /**
   * Get remaining free crates
   */
  getRemainingFreeCrates: () => {
    const { crateCount } = get();
    return Math.max(0, MAX_FREE_CRATES - crateCount);
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },
}));

export default useSubscriptionStore;
