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

      // Server-side subscription data (source of truth)
      serverQuotas: null,
      serverTierInfo: null,

      // Initialize subscription state
      initializeSubscription: async (firebaseUid = null) => {
        set({ isLoading: true, error: null });

        try {
          // Initialize RevenueCat
          await SubscriptionService.initialize();

          // Link RevenueCat to Firebase UID if provided
          if (firebaseUid) {
            await SubscriptionService.setUserId(firebaseUid);
            console.log('[SubscriptionStore] Linked RevenueCat to Firebase UID:', firebaseUid);
          }

          // Get current tier from RevenueCat (local)
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

          // Set initial state from local/RevenueCat
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

          // Sync with server (source of truth) in background
          // This updates quotas and ensures trial/subscription state is accurate
          // Don't await - let it happen in background to not block UI
          get().syncWithServer().catch((err) => {
            console.warn('[SubscriptionStore] Background server sync failed:', err.message);
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

      /**
       * Sync subscription state with server (source of truth)
       * Call this on app launch and after any subscription changes
       * Server-side validation prevents trial abuse and ensures accurate quotas
       */
      syncWithServer: async () => {
        try {
          // Import apiService dynamically to avoid circular dependency
          const { apiService } = require('../services/api');

          const serverStatus = await apiService.getSubscriptionStatus();

          if (serverStatus) {
            console.log('[SubscriptionStore] Synced with server:', serverStatus.tier);

            // Map server tier to local tier constant
            let localTier = serverStatus.tier;
            if (localTier === 'basic') {
              // If server says 'basic', treat as expired for AI features
              localTier = SUBSCRIPTION_TIERS.EXPIRED;
            } else if (localTier === 'pro') {
              localTier = SUBSCRIPTION_TIERS.PRO;
            } else if (localTier === 'trial') {
              localTier = SUBSCRIPTION_TIERS.TRIAL;
            } else {
              localTier = SUBSCRIPTION_TIERS.EXPIRED;
            }

            // Update local state with server values
            set({
              currentTier: localTier,
              // Trial info from server
              trialStartDate: serverStatus.trial?.startedAt || null,
              trialEndDate: serverStatus.trial?.endsAt || null,
              // Quota info from server (server tracks actual usage)
              aiCrateBuildCount: serverStatus.quotas?.crate_builder?.used || 0,
              trackIdentificationCount: serverStatus.quotas?.track_identification?.used || 0,
              // Server's reset date
              usageResetDate: serverStatus.quotas?.crate_builder?.resetDate || null,
              // Store server quota limits for reference
              serverQuotas: serverStatus.quotas,
              serverTierInfo: serverStatus.tierInfo,
            });

            return serverStatus;
          }
        } catch (error) {
          // Don't fail silently - log for debugging
          console.warn('[SubscriptionStore] Server sync failed (using local state):', error.message);
          // Continue using local state - server may not be connected
        }

        return null;
      },

      /**
       * Start trial on server (server controls trial dates)
       * This prevents client-side manipulation of trial period
       */
      startTrialOnServer: async () => {
        try {
          const { apiService } = require('../services/api');
          const result = await apiService.startTrial();

          if (result.success) {
            set({
              currentTier: SUBSCRIPTION_TIERS.TRIAL,
              trialStartDate: result.trialStartedAt,
              trialEndDate: result.trialEndsAt,
              hasSeenTrialStartScreen: true,
              aiCrateBuildCount: 0,
              trackIdentificationCount: 0,
              usageResetDate: new Date().toISOString(),
            });

            // Also start locally for offline support
            await SubscriptionService.startTrial();
            await SubscriptionService.markTrialScreenSeen();

            return true;
          }

          return false;
        } catch (error) {
          console.error('[SubscriptionStore] Failed to start trial on server:', error);
          // Fall back to local trial start
          return get().startTrial();
        }
      },

      /**
       * Link Firebase account on server
       * Merges any device-based subscription data with Firebase account
       */
      linkFirebaseOnServer: async (firebaseUid) => {
        try {
          const { apiService } = require('../services/api');
          await apiService.linkFirebaseAccount();
          console.log('[SubscriptionStore] Linked Firebase on server:', firebaseUid);

          // Sync to get merged state
          await get().syncWithServer();
          return true;
        } catch (error) {
          console.warn('[SubscriptionStore] Server link failed:', error.message);
          return false;
        }
      },

      // Link RevenueCat customer to Firebase UID (call after authentication)
      linkToFirebaseUser: async (firebaseUid) => {
        try {
          if (!firebaseUid) {
            console.log('[SubscriptionStore] No Firebase UID provided, skipping link');
            return false;
          }

          // Link RevenueCat to Firebase UID
          const success = await SubscriptionService.setUserId(firebaseUid);
          if (success) {
            console.log('[SubscriptionStore] Linked RevenueCat to Firebase UID:', firebaseUid);

            // Link on server to merge any device-based data
            await get().linkFirebaseOnServer(firebaseUid);

            // Refresh subscription data after linking
            await get().refreshSubscription();
          }
          return success;
        } catch (error) {
          console.error('[SubscriptionStore] Failed to link to Firebase:', error);
          return false;
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
