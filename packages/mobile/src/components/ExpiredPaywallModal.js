import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import {
  TIER_FEATURES,
  SUBSCRIPTION_TIERS,
  PRODUCT_IDS,
} from '../constants/subscription';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { useAuthStore } from '../store/authStore';
import SubscriptionService from '../services/SubscriptionService';

const ExpiredPaywallModal = () => {
  const insets = useSafeAreaInsets();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const {
    currentTier,
    offerings,
    purchasePackage,
    restorePurchases,
    clearSubscriptionData,
  } = useSubscriptionStore();

  const { signOut } = useAuthStore();

  const isVisible = currentTier === SUBSCRIPTION_TIERS.EXPIRED;

  // Retry loading offerings when modal becomes visible and offerings are null
  useEffect(() => {
    if (isVisible && !offerings) {
      SubscriptionService.getOfferings().then((freshOfferings) => {
        if (freshOfferings) {
          useSubscriptionStore.setState({ offerings: freshOfferings });
        }
      }).catch(() => {});
    }
  }, [isVisible, offerings]);

  if (!isVisible) {
    return null;
  }

  const proFeatures = TIER_FEATURES[SUBSCRIPTION_TIERS.PRO];
  const proPackage = offerings?.current?.availablePackages?.find(
    (pkg) => pkg.product.identifier === PRODUCT_IDS.PRO_MONTHLY
  );
  const displayPrice = proPackage?.product?.priceString || proFeatures.price;

  const handlePurchase = async () => {
    let pkg = proPackage;

    // Just-in-time retry if offerings were not loaded
    if (!pkg) {
      try {
        const freshOfferings = await SubscriptionService.getOfferings();
        if (freshOfferings) {
          useSubscriptionStore.setState({ offerings: freshOfferings });
          pkg = freshOfferings?.current?.availablePackages?.find(
            (p) => p.product.identifier === PRODUCT_IDS.PRO_MONTHLY
          );
        }
      } catch (e) {
        // Fall through to error below
      }
    }

    if (!pkg) {
      Alert.alert('Error', 'Unable to load subscription options. Please try again later.');
      return;
    }

    setIsPurchasing(true);
    const result = await purchasePackage(pkg);
    setIsPurchasing(false);

    if (result.success) {
      // Modal auto-dismisses when currentTier changes to pro
    } else if (!result.cancelled && result.error) {
      Alert.alert('Purchase Failed', result.error);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);

    if (!result.success) {
      Alert.alert('Restore Failed', result.error || 'No active subscriptions found to restore.');
    }
    // If successful, currentTier changes and modal auto-dismisses
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await clearSubscriptionData();
    await signOut();
    setIsSigningOut(false);
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <Ionicons name="lock-closed" size={32} color={COLORS.error} />
              </View>
              <Text style={styles.title}>Trial Ended</Text>
              <Text style={styles.subtitle}>
                Your free trial has expired. Subscribe to continue using Recrate.
              </Text>
            </View>

            {/* Pro Features */}
            <View style={styles.featuresCard}>
              <View style={styles.planTitleRow}>
                <Ionicons name="diamond" size={20} color={COLORS.primary} />
                <Text style={styles.planName}>Recrate Pro</Text>
              </View>
              <Text style={styles.planPrice}>{displayPrice}</Text>
              <View style={styles.featuresList}>
                {proFeatures.features.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Subscribe Button */}
            <TouchableOpacity
              style={styles.purchaseButton}
              onPress={handlePurchase}
              disabled={isPurchasing || isRestoring || isSigningOut}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary]}
                style={styles.purchaseGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.purchaseText}>Subscribe - {displayPrice}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Restore Purchases */}
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={isPurchasing || isRestoring || isSigningOut}
            >
              {isRestoring ? (
                <ActivityIndicator color={COLORS.textSecondary} size="small" />
              ) : (
                <Text style={styles.restoreText}>Restore Purchases</Text>
              )}
            </TouchableOpacity>

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
              disabled={isPurchasing || isRestoring || isSigningOut}
            >
              {isSigningOut ? (
                <ActivityIndicator color={COLORS.textSecondary} size="small" />
              ) : (
                <Text style={styles.signOutText}>Sign Out</Text>
              )}
            </TouchableOpacity>

            {/* Legal Links */}
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => Linking.openURL('https://recrate.app/privacy')}>
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>•</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://recrate.app/terms')}>
                <Text style={styles.legalLinkText}>Terms of Service</Text>
              </TouchableOpacity>
            </View>

            {/* Apple Terms */}
            <Text style={styles.termsText}>
              Payment will be charged to your Apple ID account at confirmation of purchase.
              Subscriptions automatically renew unless cancelled at least 24 hours before the end
              of the current period. Manage subscriptions in Settings {'>'} Apple ID {'>'} Subscriptions.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    maxHeight: '90%',
  },
  scrollContent: {
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${COLORS.error}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  featuresCard: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  planName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  planPrice: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.md,
  },
  featuresList: {
    gap: SPACING.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    flex: 1,
  },
  purchaseButton: {
    marginBottom: SPACING.md,
  },
  purchaseGradient: {
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  restoreText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  signOutText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  legalLinkText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  termsText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.md,
  },
});

export default ExpiredPaywallModal;
