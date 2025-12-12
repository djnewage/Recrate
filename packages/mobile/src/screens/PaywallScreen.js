import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { FEATURE_DESCRIPTIONS, TRIAL_DAYS } from '../constants/subscription';
import useSubscription from '../hooks/useSubscription';
import useSubscriptionStore from '../store/subscriptionStore';

const PaywallScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [isProcessing, setIsProcessing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isExpoGo = useSubscriptionStore((state) => state.isExpoGo);

  const {
    isPremium,
    isLoading,
    monthlyPackage,
    purchasePackage,
    restorePurchases,
    error,
    isInFreeTrial,
    trialDaysRemaining,
    hasPremiumAccess,
  } = useSubscription();

  // Feature that triggered the paywall (for context)
  const triggerFeature = route?.params?.feature;

  // Trial has expired (was in trial but now it's over)
  const trialExpired = !isInFreeTrial && trialDaysRemaining === 0;

  // Show development mode message in Expo Go
  if (isExpoGo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 10 }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={styles.devModeContent}>
          <View style={styles.devModeIcon}>
            <Ionicons name="code-working" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.devModeTitle}>Development Mode</Text>
          <Text style={styles.devModeSubtitle}>
            Subscription features are unavailable in Expo Go.
          </Text>
          <Text style={styles.devModeNote}>
            To test subscriptions, create a development build using:{'\n\n'}
            <Text style={styles.devModeCode}>npx expo run:ios</Text>
            {'\n'}or{'\n'}
            <Text style={styles.devModeCode}>eas build --profile development</Text>
          </Text>
          <TouchableOpacity
            style={styles.devModeDoneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.devModeDoneButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handlePurchase = async () => {
    if (!monthlyPackage) {
      Alert.alert('Error', 'Unable to load subscription. Please try again later.');
      return;
    }

    setIsProcessing(true);
    const result = await purchasePackage(monthlyPackage);
    setIsProcessing(false);

    if (result.success) {
      navigation.goBack();
    } else if (result.error && !result.cancelled) {
      Alert.alert('Purchase Failed', result.error);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);

    if (result.success) {
      if (result.restored) {
        Alert.alert('Success', 'Your subscription has been restored!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        Alert.alert('No Subscription Found', 'No previous subscription was found for this account.');
      }
    } else {
      Alert.alert('Restore Failed', result.error || 'Unable to restore purchases.');
    }
  };

  const openTerms = () => {
    Linking.openURL('https://recrate.app/terms');
  };

  const openPrivacy = () => {
    Linking.openURL('https://recrate.app/privacy');
  };

  // Get price from package or show default
  const priceString = monthlyPackage?.product?.priceString || '$4.99';

  // If user has premium access (subscription or trial), show success state
  if (hasPremiumAccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + 10 }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={styles.successContent}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color={COLORS.success} />
          </View>
          <Text style={styles.successTitle}>
            {isInFreeTrial ? 'Free Trial Active!' : "You're Premium!"}
          </Text>
          <Text style={styles.successSubtitle}>
            {isInFreeTrial
              ? `${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} left to explore all features`
              : 'Enjoy unlimited access to all features'
            }
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Close Button */}
      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + 10 }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="close" size={28} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.premiumBadge}>
            <Ionicons name="star" size={24} color="#FFD700" />
          </View>
          <Text style={styles.title}>
            {trialExpired ? 'Trial Ended' : 'Upgrade to Recrate Pro'}
          </Text>
          <Text style={styles.subtitle}>
            {trialExpired
              ? 'Subscribe to continue using all features'
              : 'Unlock the full potential of Recrate'
            }
          </Text>
        </View>

        {/* Trial Expired Banner */}
        {trialExpired && (
          <View style={styles.trialExpiredBanner}>
            <Ionicons name="time-outline" size={20} color="#F59E0B" />
            <Text style={styles.trialExpiredText}>
              Your {TRIAL_DAYS}-day free trial has ended
            </Text>
          </View>
        )}

        {/* Features List */}
        <View style={styles.featuresSection}>
          {Object.entries(FEATURE_DESCRIPTIONS).map(([key, feature]) => (
            <View
              key={key}
              style={[
                styles.featureRow,
                triggerFeature === key && styles.featureRowHighlight
              ]}
            >
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={COLORS.primary} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              <Ionicons name="checkmark" size={20} color={COLORS.success} />
            </View>
          ))}
        </View>

        {/* Pricing */}
        <View style={styles.pricingSection}>
          <View style={styles.priceCard}>
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>{TRIAL_DAYS}-DAY FREE TRIAL</Text>
            </View>
            <Text style={styles.price}>{priceString}</Text>
            <Text style={styles.priceInterval}>per month</Text>
            <Text style={styles.priceNote}>
              Cancel anytime. No commitment.
            </Text>
          </View>
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[styles.ctaButton, (isProcessing || isLoading) && styles.ctaButtonDisabled]}
          onPress={handlePurchase}
          disabled={isProcessing || isLoading}
          activeOpacity={0.8}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.ctaButtonText}>Start Free Trial</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        {/* Restore Purchases */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={COLORS.textSecondary} />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

        {/* Legal Links */}
        <View style={styles.legalSection}>
          <TouchableOpacity onPress={openTerms}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalDivider}>•</Text>
          <TouchableOpacity onPress={openPrivacy}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legalNote}>
          Payment will be charged to your Apple ID account at confirmation of purchase.
          Subscription automatically renews unless auto-renew is turned off at least
          24-hours before the end of the current period.
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
  closeButton: {
    position: 'absolute',
    right: SPACING.lg,
    zIndex: 10,
    padding: SPACING.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.xl,
    paddingTop: SPACING.xl * 2,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  premiumBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  // Features
  featuresSection: {
    marginBottom: SPACING.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  featureRowHighlight: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Pricing
  pricingSection: {
    marginBottom: SPACING.xl,
  },
  priceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  trialBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
  },
  trialBadgeText: {
    color: '#fff',
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.text,
  },
  priceInterval: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  priceNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },

  // CTA
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: '#fff',
  },

  // Restore
  restoreButton: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  restoreButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },

  // Legal
  legalSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  legalLink: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
  },
  legalDivider: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.sm,
  },
  legalNote: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: SPACING.xl,
  },

  // Trial expired banner
  trialExpiredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  trialExpiredText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#F59E0B',
  },

  // Success state
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  successIcon: {
    marginBottom: SPACING.lg,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  successSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  doneButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl * 2,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  doneButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#fff',
  },

  // Development Mode (Expo Go)
  devModeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  devModeIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  devModeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  devModeSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  devModeNote: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  devModeCode: {
    fontFamily: 'monospace',
    color: COLORS.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  devModeDoneButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.xl * 2,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  devModeDoneButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default PaywallScreen;
