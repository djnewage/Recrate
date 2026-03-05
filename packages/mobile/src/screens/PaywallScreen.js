import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  Platform,
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

const PaywallScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const {
    currentTier,
    offerings,
    purchasePackage,
    restorePurchases,
    getTrialDaysRemaining,
    isLoading,
    hasBillingIssue,
  } = useSubscriptionStore();

  const trialDaysRemaining = getTrialDaysRemaining();
  const showTrialBanner = currentTier === SUBSCRIPTION_TIERS.TRIAL && trialDaysRemaining > 0;
  const isExpired = currentTier === SUBSCRIPTION_TIERS.EXPIRED;
  const isPro = currentTier === SUBSCRIPTION_TIERS.PRO;

  // Get Pro package from offerings
  const proPackage = offerings?.current?.availablePackages?.find(
    (pkg) => pkg.product.identifier === PRODUCT_IDS.PRO_MONTHLY
  );

  const proFeatures = TIER_FEATURES[SUBSCRIPTION_TIERS.PRO];
  const displayPrice = proPackage?.product?.priceString || proFeatures.price;

  const handlePurchase = async () => {
    if (!proPackage) {
      Alert.alert('Error', 'Unable to load subscription options. Please try again later.');
      return;
    }

    setIsPurchasing(true);

    const result = await purchasePackage(proPackage);

    setIsPurchasing(false);

    if (result.success) {
      Alert.alert(
        'Success!',
        "You're now subscribed to Recrate Pro!",
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else if (!result.cancelled && result.error) {
      Alert.alert('Purchase Failed', result.error);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);

    const result = await restorePurchases();

    setIsRestoring(false);

    if (result.success) {
      Alert.alert('Restored!', 'Your purchases have been restored.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      Alert.alert('Restore Failed', result.error || 'No purchases found to restore.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscribe</Text>
        <View style={styles.closeButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Trial/Expired Banner */}
        {showTrialBanner && (
          <View style={styles.trialBanner}>
            <Ionicons name="time" size={20} color={COLORS.warning} />
            <Text style={styles.trialBannerText}>
              {trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left in your trial
            </Text>
          </View>
        )}

        {isExpired && (
          <View style={[styles.trialBanner, styles.expiredBanner]}>
            <Ionicons name="alert-circle" size={20} color={COLORS.error} />
            <Text style={[styles.trialBannerText, styles.expiredText]}>
              Your trial has ended. Subscribe to continue.
            </Text>
          </View>
        )}

        {hasBillingIssue && (
          <View style={[styles.trialBanner, styles.expiredBanner]}>
            <Ionicons name="card" size={20} color={COLORS.warning} />
            <Text style={[styles.trialBannerText, { color: COLORS.warning }]}>
              There's an issue with your payment. Please update your payment method to keep your subscription.
            </Text>
          </View>
        )}

        {/* Pro Plan Card */}
        <View style={styles.plansContainer}>
          <View style={[styles.planCard, styles.planCardSelected, isPro && styles.planCardCurrent]}>
            {isPro && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentText}>CURRENT PLAN</Text>
              </View>
            )}

            <View style={styles.planHeader}>
              <View style={styles.planTitleRow}>
                <Ionicons name="diamond" size={24} color={COLORS.primary} />
                <Text style={styles.planName}>Recrate Pro</Text>
              </View>
              <View style={styles.priceContainer}>
                <Text style={styles.planPrice}>{displayPrice}</Text>
              </View>
            </View>

            <Text style={styles.planDescription}>{proFeatures.description}</Text>

            <View style={styles.planFeatures}>
              {proFeatures.features.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={COLORS.primary}
                  />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Purchase Button */}
        {!isPro && (
          <TouchableOpacity
            style={styles.purchaseButton}
            onPress={handlePurchase}
            disabled={isPurchasing || isRestoring || isLoading}
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
                <Text style={styles.purchaseText}>
                  Subscribe - {displayPrice}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Already subscribed message */}
        {isPro && (
          <View style={styles.subscribedMessage}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            <Text style={styles.subscribedText}>You're subscribed to Pro!</Text>
          </View>
        )}

        {/* Restore Purchases */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={isPurchasing || isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator color={COLORS.textSecondary} size="small" />
          ) : (
            <Text style={styles.restoreText}>Restore Purchases</Text>
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

        {/* Terms */}
        <Text style={styles.termsText}>
          {Platform.OS === 'ios'
            ? `Payment will be charged to your Apple ID account at confirmation of purchase. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage subscriptions in Settings > Apple ID > Subscriptions.`
            : `Payment will be charged to your Google Play account at confirmation of purchase. Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period. Manage subscriptions in Google Play Store > Payments & subscriptions.`}
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${COLORS.warning}15`,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  trialBannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.warning,
    fontWeight: '500',
  },
  expiredBanner: {
    backgroundColor: `${COLORS.error}15`,
  },
  expiredText: {
    color: COLORS.error,
  },
  plansContainer: {
    marginBottom: SPACING.lg,
  },
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: COLORS.primary,
  },
  planCardCurrent: {
    borderColor: COLORS.success,
  },
  currentBadge: {
    position: 'absolute',
    top: -10,
    right: SPACING.md,
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  currentText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  planHeader: {
    marginBottom: SPACING.md,
  },
  planTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  planName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
  },
  planDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  planFeatures: {
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
  subscribedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  subscribedText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.success,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  restoreText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  legalLinkText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: FONT_SIZES.sm,
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

export default PaywallScreen;
