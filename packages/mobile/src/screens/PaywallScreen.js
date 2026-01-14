import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
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
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const {
    currentTier,
    offerings,
    purchasePackage,
    restorePurchases,
    getTrialDaysRemaining,
    isLoading,
  } = useSubscriptionStore();

  const trialDaysRemaining = getTrialDaysRemaining();
  const showTrialBanner = currentTier === SUBSCRIPTION_TIERS.TRIAL && trialDaysRemaining > 0;
  const isExpired = currentTier === SUBSCRIPTION_TIERS.EXPIRED;

  // Get packages from offerings
  const basicPackage = offerings?.current?.availablePackages?.find(
    (pkg) => pkg.product.identifier === PRODUCT_IDS.BASIC_MONTHLY
  );
  const proPackage = offerings?.current?.availablePackages?.find(
    (pkg) => pkg.product.identifier === PRODUCT_IDS.PRO_MONTHLY
  );

  const handlePurchase = async () => {
    const packageToPurchase = selectedPlan === 'pro' ? proPackage : basicPackage;

    if (!packageToPurchase) {
      Alert.alert('Error', 'Unable to load subscription options. Please try again later.');
      return;
    }

    setIsPurchasing(true);

    const result = await purchasePackage(packageToPurchase);

    setIsPurchasing(false);

    if (result.success) {
      Alert.alert(
        'Success!',
        `You're now subscribed to ${selectedPlan === 'pro' ? 'Pro' : 'Basic'}!`,
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

  const basicFeatures = TIER_FEATURES[SUBSCRIPTION_TIERS.BASIC];
  const proFeatures = TIER_FEATURES[SUBSCRIPTION_TIERS.PRO];

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      price: basicPackage?.product?.priceString || basicFeatures.price,
      period: '/month',
      features: basicFeatures.features,
      hasAI: false,
      isCurrent: currentTier === SUBSCRIPTION_TIERS.BASIC,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: proPackage?.product?.priceString || proFeatures.price,
      period: '/month',
      features: proFeatures.features,
      hasAI: true,
      recommended: true,
      isCurrent: currentTier === SUBSCRIPTION_TIERS.PRO,
    },
  ];

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
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
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

        {/* Plan Cards */}
        <View style={styles.plansContainer}>
          {plans.map((plan) => (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                selectedPlan === plan.id && styles.planCardSelected,
                plan.isCurrent && styles.planCardCurrent,
              ]}
              onPress={() => !plan.isCurrent && setSelectedPlan(plan.id)}
              disabled={plan.isCurrent}
              activeOpacity={0.8}
            >
              {plan.recommended && !plan.isCurrent && (
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedText}>RECOMMENDED</Text>
                </View>
              )}

              {plan.isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentText}>CURRENT PLAN</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.priceContainer}>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  <Text style={styles.planPeriod}>{plan.period}</Text>
                </View>
              </View>

              <View style={styles.planFeatures}>
                {plan.features.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={plan.hasAI ? COLORS.primary : COLORS.success}
                    />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {selectedPlan === plan.id && !plan.isCurrent && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Purchase Button */}
        {currentTier !== SUBSCRIPTION_TIERS.PRO && currentTier !== SUBSCRIPTION_TIERS.BASIC && (
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
                  Subscribe to {selectedPlan === 'pro' ? 'Pro' : 'Basic'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Upgrade button for Basic users */}
        {currentTier === SUBSCRIPTION_TIERS.BASIC && (
          <TouchableOpacity
            style={styles.purchaseButton}
            onPress={handlePurchase}
            disabled={isPurchasing || selectedPlan !== 'pro'}
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
                <Text style={styles.purchaseText}>Upgrade to Pro</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
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

        {/* Terms */}
        <Text style={styles.termsText}>
          Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period.
          Manage subscriptions in your App Store settings.
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
    gap: SPACING.md,
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
    opacity: 0.7,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  recommendedText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
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
  planName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
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
  planPeriod: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginLeft: 2,
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
  selectedIndicator: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
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
    paddingVertical: SPACING.md,
  },
  restoreText: {
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
