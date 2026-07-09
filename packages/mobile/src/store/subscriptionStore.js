import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SubscriptionService from '../services/SubscriptionService';
import { logEvent, firebaseAnalytics } from '../config/firebase';
import {
  SUBSCRIPTION_TIERS,
  TIER_FEATURES,
  TRIAL_DURATION_DAYS,
} from '../constants/subscription';

// Bounds how long the navigation gate can stay 'unknown' waiting on the server.
// Falling back to 'needsTrial' is safe: TrialStartScreen's button requires the
// server anyway and errors with a Retry, and startTrialOnServer treats
// "already started" as success.
const TRIAL_GATE_TIMEOUT_MS = 8000;
let trialGateTimeout = null;

function clearTrialGateTimeout() {
  if (trialGateTimeout) {
    clearTimeout(trialGateTimeout);
    trialGateTimeout = null;
  }
}

export const useSubscriptionStore = create(
  persist(
    (set, get) => ({
      // Core subscription state
      currentTier: null, // Will be determined on init
      isLoading: true,
      error: null,
      betaMode: false,

      // Trial state
      trialStartDate: null,
      trialEndDate: null,
      hasSeenTrialStartScreen: false,

      // Navigation gate: has this account started (or moved past) the trial?
      // 'unknown' -> spinner, 'needsTrial' -> TrialStartScreen, 'ready' -> Connection.
      // Never persisted — re-derived from the server each session.
      trialGate: 'unknown',

      // Reset the gate (on sign-in/sign-out) and arm a timeout so navigation
      // can't hang forever if the server sync never resolves it.
      resetTrialGate: () => {
        clearTrialGateTimeout();
        set({ trialGate: 'unknown' });
        trialGateTimeout = setTimeout(() => {
          trialGateTimeout = null;
          if (get().trialGate === 'unknown') {
            // Offline/timeout fallback: local evidence of a past trial means an
            // existing user (e.g. offline cold start) — don't strand them on
            // TrialStartScreen. Only true fresh installs fall to 'needsTrial'.
            const { trialStartDate, hasSeenTrialStartScreen } = get();
            const fallback = trialStartDate || hasSeenTrialStartScreen ? 'ready' : 'needsTrial';
            console.warn(`[SubscriptionStore] Trial gate timed out, defaulting to ${fallback}`);
            set({ trialGate: fallback });
          }
        }, TRIAL_GATE_TIMEOUT_MS);
      },

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

          // Pre-resolve the navigation gate from local evidence so existing
          // users never wait on the network. New installs stay 'unknown' until
          // syncWithServer resolves it (bounded by the resetTrialGate timeout).
          if (trialStartDate || hasSeenTrialStartScreen) {
            clearTrialGateTimeout();
            set({ trialGate: 'ready' });
          } else if (get().trialGate === 'unknown' && !trialGateTimeout) {
            get().resetTrialGate();
          }

          // Sync with server (source of truth) in background
          // This updates quotas and ensures trial/subscription state is accurate
          // Don't await - let it happen in background to not block UI
          get().syncWithServer().catch((err) => {
            console.warn('[SubscriptionStore] Background server sync failed:', err.message);
          });

          return tier;
        } catch (error) {
          console.error('[SubscriptionStore] Init error:', error);
          // Only assume EXPIRED if a trial was actually started at some point;
          // a fresh install with an init error must not get the blocking paywall.
          const hadTrial = !!get().trialStartDate;
          const fallbackTier = hadTrial ? SUBSCRIPTION_TIERS.EXPIRED : SUBSCRIPTION_TIERS.NEW;
          set({
            error: error.message,
            isLoading: false,
            currentTier: fallbackTier,
          });
          if (get().trialGate === 'unknown' && !trialGateTimeout) {
            get().resetTrialGate();
          }
          return fallbackTier;
        }
      },

      // Refresh subscription status from RevenueCat.
      // WARNING: this derives the tier from LOCAL evidence (RevenueCat
      // entitlements + Keychain trial dates) and overwrites currentTier.
      // Never call it right after syncWithServer — the server tier is the
      // source of truth. Use it only where RevenueCat is authoritative
      // (purchases/restores) or in dev tooling.
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
            } else if (localTier === 'new') {
              // Signed up but trial not started yet — must not fall through to
              // EXPIRED or the blocking paywall would show for brand-new users.
              localTier = SUBSCRIPTION_TIERS.NEW;
            } else {
              localTier = SUBSCRIPTION_TIERS.EXPIRED;
            }

            // Beta mode: override tier to PRO for full access
            if (serverStatus.betaMode) {
              localTier = SUBSCRIPTION_TIERS.PRO;
            }

            // Server is the source of truth for the navigation gate
            clearTrialGateTimeout();
            const trialGate =
              serverStatus.tier === 'new' && !serverStatus.betaMode ? 'needsTrial' : 'ready';

            // Update local state with server values
            set({
              currentTier: localTier,
              trialGate,
              betaMode: !!serverStatus.betaMode,
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

            // Set user property for subscription tier
            if (firebaseAnalytics) {
              firebaseAnalytics.setUserProperties({ subscription_tier: serverStatus.tier });
            }

            return serverStatus;
          }
        } catch (error) {
          // Don't fail silently - log for debugging
          console.warn('[SubscriptionStore] Server sync failed (using local state):', error.message);
          // Continue using local state - server may not be connected.
          // If local evidence shows a past trial, resolve the gate now instead
          // of stranding an offline existing user on the spinner/timeout.
          if (get().trialGate === 'unknown') {
            const { trialStartDate, hasSeenTrialStartScreen } = get();
            if (trialStartDate || hasSeenTrialStartScreen) {
              clearTrialGateTimeout();
              set({ trialGate: 'ready' });
            }
          }
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
            clearTrialGateTimeout();
            set({
              currentTier: SUBSCRIPTION_TIERS.TRIAL,
              trialGate: 'ready',
              trialStartDate: result.trialStartedAt,
              trialEndDate: result.trialEndsAt,
              hasSeenTrialStartScreen: true,
              aiCrateBuildCount: 0,
              trackIdentificationCount: 0,
              usageResetDate: new Date().toISOString(),
            });

            logEvent('trial_started');

            // Also start locally for offline support
            await SubscriptionService.startTrial();
            await SubscriptionService.markTrialScreenSeen();

            return true;
          }

          return false;
        } catch (error) {
          // Server already has a trial for this account (e.g. existing account
          // on a wiped device) — sync the real state and proceed.
          if (error.response?.status === 400) {
            console.log('[SubscriptionStore] Trial already started on server, syncing');
            await SubscriptionService.markTrialScreenSeen();
            set({ hasSeenTrialStartScreen: true });
            await get().syncWithServer();
            clearTrialGateTimeout();
            set({ trialGate: 'ready' });
            return true;
          }

          // No local fallback: the server is the only trial-minting authority.
          console.error('[SubscriptionStore] Failed to start trial on server:', error);
          set({ error: error.message });
          return false;
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

            // Refresh RevenueCat customer info for the newly-linked identity,
            // but do NOT recompute the tier locally (refreshSubscription would
            // overwrite the server-synced tier with a Keychain-derived guess —
            // e.g. clobbering 'expired' so the paywall never shows).
            const customerInfo = await SubscriptionService.getCustomerInfo(true);
            if (customerInfo) {
              set({ customerInfo });
            }
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
        set({ error: null });

        const result = await SubscriptionService.purchasePackage(packageToPurchase);

        if (result.success) {
          const tier = await SubscriptionService.getCurrentTier();
          set({
            currentTier: tier,
            customerInfo: result.customerInfo,
            // Reset usage on new subscription
            aiCrateBuildCount: 0,
            trackIdentificationCount: 0,
            usageResetDate: new Date().toISOString(),
          });

          logEvent('subscription_purchased', {
            product_id: packageToPurchase?.product?.identifier,
          });
        } else {
          set({
            error: result.cancelled ? null : result.error,
          });
        }

        return result;
      },

      // Restore purchases
      restorePurchases: async () => {
        set({ error: null });

        const result = await SubscriptionService.restorePurchases();

        if (result.success) {
          const tier = await SubscriptionService.getCurrentTier();
          set({
            currentTier: tier,
            customerInfo: result.customerInfo,
          });

          logEvent('subscription_restored');
        } else {
          set({
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
        clearTrialGateTimeout();
        set({
          currentTier: null,
          trialGate: 'unknown',
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
        betaMode: state.betaMode,
      }),
    }
  )
);

export default useSubscriptionStore;
