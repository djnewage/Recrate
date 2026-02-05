/**
 * Authentication Store
 * Manages Firebase authentication state with Zustand
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthService from '../services/AuthService';
import { setFirebaseUser } from '../config/firebase';
import { setUser as setSentryUser } from '../utils/sentry';
import { useConnectionStore } from './connectionStore';
import { useSubscriptionStore } from './subscriptionStore';

/**
 * Auth store for managing Firebase authentication state
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      // User state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // User properties (extracted for convenience)
      uid: null,
      email: null,
      displayName: null,
      photoURL: null,
      provider: null,

      // Actions

      /**
       * Initialize auth service and set up listener
       * Should be called once on app mount
       * @returns {Function} Unsubscribe function
       */
      initialize: () => {
        // Initialize the auth service (configures Google Sign-In)
        AuthService.initialize();

        // Set up auth state listener
        const unsubscribe = AuthService.onAuthStateChanged(async (firebaseUser) => {
          if (firebaseUser) {
            // User is signed in
            const userData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              emailVerified: firebaseUser.emailVerified,
              provider: AuthService.getProvider(),
            };

            set({
              user: userData,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              provider: AuthService.getProvider(),
            });

            // Update external services with user context
            await get().updateExternalServices(userData);

            console.log('[AuthStore] User signed in:', firebaseUser.uid);
          } else {
            // User is signed out
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
              uid: null,
              email: null,
              displayName: null,
              photoURL: null,
              provider: null,
            });

            // Clear external service user context
            await get().clearExternalServices();

            console.log('[AuthStore] User signed out');
          }
        });

        return unsubscribe;
      },

      /**
       * Update external services (Sentry, Firebase Crashlytics, RevenueCat) with user context
       */
      updateExternalServices: async (userData) => {
        try {
          // Update Sentry user context
          setSentryUser({
            id: userData.uid,
            email: userData.email,
            username: userData.displayName,
          });

          // Update Firebase user context (Crashlytics, Analytics)
          await setFirebaseUser(userData.uid, userData.email);

          // Update connection store with user ID (for API headers)
          useConnectionStore.getState().setUserId(userData.uid);

          // Link RevenueCat to Firebase UID
          await useSubscriptionStore.getState().linkToFirebaseUser(userData.uid);
        } catch (error) {
          console.error('[AuthStore] Failed to update external services:', error);
        }
      },

      /**
       * Clear user context from external services
       */
      clearExternalServices: async () => {
        try {
          setSentryUser(null);
          await setFirebaseUser(null);

          // Clear user ID from connection store
          useConnectionStore.getState().setUserId(null);
        } catch (error) {
          console.error('[AuthStore] Failed to clear external services:', error);
        }
      },

      /**
       * Sign in with Apple
       */
      signInWithApple: async () => {
        set({ isLoading: true, error: null });

        const result = await AuthService.signInWithApple();

        if (result.success) {
          // Auth state listener will handle state update
        } else if (!result.cancelled) {
          set({ error: result.error, isLoading: false });
        } else {
          set({ isLoading: false });
        }

        return result;
      },

      /**
       * Sign in with Google
       */
      signInWithGoogle: async () => {
        set({ isLoading: true, error: null });

        const result = await AuthService.signInWithGoogle();

        if (result.success) {
          // Auth state listener will handle state update
        } else if (!result.cancelled) {
          set({ error: result.error, isLoading: false });
        } else {
          set({ isLoading: false });
        }

        return result;
      },

      /**
       * Sign in with email and password
       */
      signInWithEmail: async (email, password) => {
        set({ isLoading: true, error: null });

        const result = await AuthService.signInWithEmail(email, password);

        if (result.success) {
          // Auth state listener will handle state update
        } else {
          set({ error: result.error, isLoading: false });
        }

        return result;
      },

      /**
       * Create new account with email and password
       */
      signUp: async (email, password, displayName = null) => {
        set({ isLoading: true, error: null });

        const result = await AuthService.signUp(email, password, displayName);

        if (result.success) {
          // Auth state listener will handle state update
        } else {
          set({ error: result.error, isLoading: false });
        }

        return result;
      },

      /**
       * Send password reset email
       */
      resetPassword: async (email) => {
        set({ isLoading: true, error: null });

        const result = await AuthService.resetPassword(email);

        set({ isLoading: false });

        if (!result.success) {
          set({ error: result.error });
        }

        return result;
      },

      /**
       * Sign out the current user
       */
      signOut: async () => {
        set({ isLoading: true, error: null });

        const result = await AuthService.signOut();

        if (!result.success) {
          set({ error: result.error, isLoading: false });
        }

        return result;
      },

      /**
       * Delete user account
       */
      deleteAccount: async () => {
        set({ isLoading: true, error: null });

        const result = await AuthService.deleteAccount();

        if (!result.success) {
          set({ error: result.error, isLoading: false });
        }

        return result;
      },

      /**
       * Clear any auth errors
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Get the current user's display name or email
       */
      getDisplayName: () => {
        const { displayName, email } = get();
        return displayName || email?.split('@')[0] || 'User';
      },
    }),
    {
      name: 'recrate-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist minimal user data for quick re-render before Firebase verifies
      partialize: (state) => ({
        uid: state.uid,
        email: state.email,
        displayName: state.displayName,
        photoURL: state.photoURL,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
