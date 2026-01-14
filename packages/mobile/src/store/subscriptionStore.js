import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SubscriptionService from '../services/SubscriptionService';
import {
  SUBSCRIPTION_TIERS,
  TIER_FEATURES,
  TRIAL_DURATION_DAYS,
} from '../constants/subscription';

export const useSubscriptionStore = create(
  persist(
    (set, get) => ({
      // Core subscription state
      currentTier: null, // Will be determined on init
      isLoading: true,
      error: null,

      // Trial state
      trialStartDate: null,
      trialEndDate: null,
      hasSeenTrialStartScreen: false,

      // Usage tracking (for trial/pro limits)
      aiCrateBuildCount: 0,
      trackIdentificationCount: 0,
      usageResetDate: null, // ISO date string for monthly reset

      // RevenueCat data
      offerings: null,
      customerInfo: null,

      // Initialize subscription state
      initializeSubscription: async () => {
        set({ isLoading: true, error: null });

        try {
          // Initialize RevenueCat
          await SubscriptionService.initialize();

          // Get current tier
          const tier = await SubscriptionService.getCurrentTier();

          // Get trial dates if applicable
          const trialStartDate = await SubscriptionService.getTrialStartDate();
          const trialEndDate = await SubscriptionService.getTrialEndDate();
          const hasSeenTrialStartScreen = await SubscriptionService.hasSeenTrialScreen();

          // Check if we need to reset usage (monthly)
          const state = get();
          const now = new Date();
          let { aiCrateBuildCount, trackIdentificationCount, usageResetDate } = state;

          if (usageResetDate) {
            const resetDate = new Date(usageResetDate);
            // Reset if we're in a new month
            if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
              aiCrateBuildCount = 0;
              trackIdentificationCount = 0;
              usageResetDate = now.toISOString();
            }
          } else {
            // First time - set reset date
            usageResetDate = now.toISOString();
          }

          // Load offerings
          const offerings = await SubscriptionService.getOfferings();

          set({
            currentTier: tier,
            trialStartDate: trialStartDate?.toISOString() || null,
            trialEndDate: trialEndDate?.toISOString() || null,
            hasSeenTrialStartScreen,
            aiCrateBuildCount,
            trackIdentificationCount,
            usageResetDate,
            offerings,
            isLoading: false,
          });

          return tier;
        } catch (error) {
          console.error('[SubscriptionStore] Init error:', error);
          set({
            error: error.message,
            isLoading: false,
            currentTier: SUBSCRIPTION_TIERS.EXPIRED,
          });
          return SUBSCRIPTION_TIERS.EXPIRED;
        }
      },

      // Refresh subscription status from RevenueCat
      refreshSubscription: async () => {
        set({ isLoading: true });

        try {
          const tier = await SubscriptionService.getCurrentTier();
          const customerInfo = await SubscriptionService.getCustomerInfo(true);

          set({
            currentTier: tier,
            customerInfo,
            isLoading: false,
            error: null,
          });

          return tier;
        } catch (error) {
          set({ isLoading: false, error: error.message });
          return get().currentTier;
        }
      },

      // Start the free trial
      startTrial: async () => {
        const success = await SubscriptionService.startTrial();

        if (success) {
          const trialStartDate = await SubscriptionService.getTrialStartDate();
          const trialEndDate = await SubscriptionService.getTrialEndDate();

          set({
            currentTier: SUBSCRIPTION_TIERS.TRIAL,
            trialStartDate: trialStartDate?.toISOString() || null,
            trialEndDate: trialEndDate?.toISOString() || null,
            hasSeenTrialStartScreen: true,
            aiCrateBuildCount: 0,
            trackIdentificationCount: 0,
            usageResetDate: new Date().toISOString(),
          });

          await SubscriptionService.markTrialScreenSeen();
        }

        return success;
      },

      // Mark trial start screen as seen (without starting trial)
      markTrialScreenSeen: async () => {
        await SubscriptionService.markTrialScreenSeen();
        set({ hasSeenTrialStartScreen: true });
      },

      // Purchase a subscription
      purchasePackage: async (packageToPurchase) => {
        set({ isLoading: true, error: null });

        const result = await SubscriptionService.purchasePackage(packageToPurchase);

        if (result.success) {
          const tier = await SubscriptionService.getCurrentTier();
          set({
            currentTier: tier,
            customerInfo: result.customerInfo,
            isLoading: false,
            // Reset usage on new subscription
            aiCrateBuildCount: 0,
            trackIdentificationCount: 0,
            usageResetDate: new Date().toISOString(),
          });
        } else {
          set({
            isLoading: false,
            error: result.cancelled ? null : result.error,
          });
        }

        return result;
      },

      // Restore purchases
      restorePurchases: async () => {
        set({ isLoading: true, error: null });

        const result = await SubscriptionService.restorePurchases();

        if (result.success) {
          const tier = await SubscriptionService.getCurrentTier();
          set({
            currentTier: tier,
            customerInfo: result.customerInfo,
            isLoading: false,
          });
        } else {
          set({
            isLoading: false,
            error: result.error,
          });
        }

        return result;
      },

      // Check if user can use AI crate builder
      canUseCrateBuilder: () => {
        const { currentTier, aiCrateBuildCount } = get();
        const features = TIER_FEATURES[currentTier];

        if (!features?.hasAIAccess) {
          return false;
        }

        return aiCrateBuildCount < features.aiCrateBuilds;
      },

      // Check if user can use track identification
      canUseTrackIdentification: () => {
        const { currentTier, trackIdentificationCount } = get();
        const features = TIER_FEATURES[currentTier];

        if (!features?.hasAIAccess) {
          return false;
        }

        return trackIdentificationCount < features.trackIdentifications;
      },

      // Increment crate build usage
      incrementCrateBuildUsage: () => {
        const { aiCrateBuildCount } = get();
        set({ aiCrateBuildCount: aiCrateBuildCount + 1 });
      },

      // Increment track identification usage
      incrementTrackIdUsage: () => {
        const { trackIdentificationCount } = get();
        set({ trackIdentificationCount: trackIdentificationCount + 1 });
      },

      // Get remaining crate builds for current tier
      getRemainingCrateBuilds: () => {
        const { currentTier, aiCrateBuildCount } = get();
        const features = TIER_FEATURES[currentTier];

        if (!features?.hasAIAccess) {
          return 0;
        }

        return Math.max(0, features.aiCrateBuilds - aiCrateBuildCount);
      },

      // Get remaining track IDs for current tier
      getRemainingTrackIds: () => {
        const { currentTier, trackIdentificationCount } = get();
        const features = TIER_FEATURES[currentTier];

        if (!features?.hasAIAccess) {
          return 0;
        }

        return Math.max(0, features.trackIdentifications - trackIdentificationCount);
      },

      // Get trial days remaining
      getTrialDaysRemaining: () => {
        const { trialEndDate, currentTier } = get();

        if (currentTier !== SUBSCRIPTION_TIERS.TRIAL || !trialEndDate) {
          return 0;
        }

        const end = new Date(trialEndDate);
        const now = new Date();

        if (now >= end) return 0;

        const msRemaining = end.getTime() - now.getTime();
        return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      },

      // Get tier display info
      getTierInfo: () => {
        const { currentTier } = get();
        return TIER_FEATURES[currentTier] || TIER_FEATURES[SUBSCRIPTION_TIERS.EXPIRED];
      },

      // Check if user has AI access
      hasAIAccess: () => {
        const { currentTier } = get();
        return TIER_FEATURES[currentTier]?.hasAIAccess ?? false;
      },

      // Clear all subscription data (for testing/logout)
      clearSubscriptionData: async () => {
        await SubscriptionService.clearAllData();
        set({
          currentTier: null,
          trialStartDate: null,
          trialEndDate: null,
          hasSeenTrialStartScreen: false,
          aiCrateBuildCount: 0,
          trackIdentificationCount: 0,
          usageResetDate: null,
          offerings: null,
          customerInfo: null,
          isLoading: false,
          error: null,
        });
      },
    }),
    {
      name: 'recrate-subscription-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist these fields
        hasSeenTrialStartScreen: state.hasSeenTrialStartScreen,
        aiCrateBuildCount: state.aiCrateBuildCount,
        trackIdentificationCount: state.trackIdentificationCount,
        usageResetDate: state.usageResetDate,
      }),
    }
  )
);

export default useSubscriptionStore;
