/**
 * useSubscription - Convenience hook for subscription state and feature gating
 */
import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import useSubscriptionStore from '../store/subscriptionStore';
import { PREMIUM_FEATURES } from '../constants/subscription';

/**
 * Hook for accessing subscription state and feature gates
 */
export const useSubscription = () => {
  const navigation = useNavigation();

  const {
    isPremium,
    isLoading,
    activeSubscription,
    crateCount,
    offerings,
    error,
    isExpoGo,
    isInFreeTrial,
    trialDaysRemaining,
    canCreateCrate,
    hasPremiumAccess,
    getRemainingFreeCrates,
    purchasePackage,
    restorePurchases,
    clearError,
  } = useSubscriptionStore();

  /**
   * Navigate to paywall screen
   * @param {string} feature - The feature that triggered the paywall (for analytics)
   */
  const showPaywall = useCallback((feature = null) => {
    navigation.navigate('Paywall', { feature });
  }, [navigation]);

  // Check if user has premium access (subscription OR in-app trial)
  const hasAccess = hasPremiumAccess();

  /**
   * Check if user can use track identification
   */
  const canUseTrackId = hasAccess;

  /**
   * Check if user can use advanced filters (BPM, Key, Genre)
   */
  const canUseAdvancedFilters = hasAccess;

  /**
   * Check if user can create nested crates (subcrates)
   */
  const canCreateSubcrate = hasAccess;

  /**
   * Get in-app trial info
   */
  const trialInfo = isInFreeTrial
    ? {
        isActive: true,
        daysRemaining: trialDaysRemaining,
        isInAppTrial: true,
      }
    : activeSubscription?.isTrial
    ? {
        isActive: true,
        expiresDate: activeSubscription.expiresDate,
        isInAppTrial: false,
      }
    : null;

  /**
   * Format subscription expiry date
   */
  const getExpiryDateFormatted = useCallback(() => {
    if (!activeSubscription?.expiresDate) return null;
    return activeSubscription.expiresDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [activeSubscription]);

  /**
   * Get the monthly package from offerings
   */
  const getMonthlyPackage = useCallback(() => {
    if (!offerings?.availablePackages) return null;
    return offerings.availablePackages.find(
      pkg => pkg.packageType === 'MONTHLY' || pkg.identifier === '$rc_monthly'
    ) || offerings.availablePackages[0];
  }, [offerings]);

  return {
    // State
    isPremium,
    isLoading,
    activeSubscription,
    crateCount,
    offerings,
    error,
    isExpoGo,

    // Trial state
    isInFreeTrial,
    trialDaysRemaining,
    trialInfo,
    hasPremiumAccess: hasAccess,

    // Feature gates
    canCreateCrate: canCreateCrate(),
    canUseTrackId,
    canUseAdvancedFilters,
    canCreateSubcrate,

    // Helpers
    remainingFreeCrates: getRemainingFreeCrates(),
    expiryDate: getExpiryDateFormatted(),
    monthlyPackage: getMonthlyPackage(),

    // Actions
    showPaywall,
    purchasePackage,
    restorePurchases,
    clearError,

    // Feature constants for reference
    FEATURES: PREMIUM_FEATURES,
  };
};

export default useSubscription;
