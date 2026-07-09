import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { TIER_FEATURES, SUBSCRIPTION_TIERS, TRIAL_DURATION_DAYS } from '../constants/subscription';
import { useSubscriptionStore } from '../store/subscriptionStore';

const TrialStartScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [isStarting, setIsStarting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const { startTrialOnServer, restorePurchases, markTrialScreenSeen, syncWithServer } =
    useSubscriptionStore();

  const trialFeatures = TIER_FEATURES[SUBSCRIPTION_TIERS.TRIAL];

  const handleStartTrial = async () => {
    setIsStarting(true);

    // Server mints the trial — this requires a connection by design
    const success = await startTrialOnServer();

    setIsStarting(false);

    if (success) {
      navigation.replace('Connection');
    } else {
      Alert.alert(
        'Connection Required',
        'Starting your free trial needs an internet connection. Please check your connection and try again.',
        [
          { text: 'Retry', onPress: handleStartTrial },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleRestorePurchases = async () => {
    setIsRestoring(true);

    const result = await restorePurchases();

    setIsRestoring(false);

    if (result.success) {
      // Successfully restored - sync server state and continue to connect
      await markTrialScreenSeen();
      await syncWithServer();
      navigation.replace('Connection');
    }
  };

  const handleSkip = async () => {
    // Start trial anyway - user can't skip without starting
    await handleStartTrial();
  };

  const features = [
    {
      icon: 'musical-notes',
      title: 'Full Library Sync',
      description: 'Access your entire Serato library',
    },
    {
      icon: 'sparkles',
      title: 'AI Crate Builder',
      description: `${trialFeatures.aiCrateBuilds} AI-powered crate generations`,
    },
    {
      icon: 'mic',
      title: 'Track Identification',
      description: `${trialFeatures.trackIdentifications} song identifications`,
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top, paddingBottom: insets.bottom }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#1a1035', COLORS.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/officialLogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Welcome to Recrate</Text>
          <Text style={styles.subtitle}>Your DJ library, anywhere</Text>
        </View>

        {/* Trial badge */}
        <View style={styles.trialBadge}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            style={styles.trialBadgeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="gift" size={16} color="#FFFFFF" />
            <Text style={styles.trialBadgeText}>{TRIAL_DURATION_DAYS} Days Free</Text>
          </LinearGradient>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureIconContainer}>
                <Ionicons name={feature.icon} size={24} color={COLORS.primary} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
            </View>
          ))}
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* CTA Button */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleStartTrial}
          disabled={isStarting || isRestoring}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isStarting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.ctaText}>Start My Free Trial</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Restore purchases link */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestorePurchases}
          disabled={isStarting || isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator color={COLORS.textSecondary} size="small" />
          ) : (
            <Text style={styles.restoreText}>Already subscribed? Restore Purchases</Text>
          )}
        </TouchableOpacity>

        {/* Terms */}
        <Text style={styles.termsText}>
          No payment required. Trial includes full Pro features.{'\n'}
          Subscribe anytime to continue after trial ends.
        </Text>

        {/* Legal Links */}
        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => Linking.openURL('https://recrate.app/terms')}>
            <Text style={styles.legalLinkText}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>•</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://recrate.app/privacy')}>
            <Text style={styles.legalLinkText}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: SPACING.md,
    borderRadius: 20,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  trialBadge: {
    alignSelf: 'center',
    marginBottom: SPACING.xl,
  },
  trialBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.xs,
  },
  trialBadgeText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  featuresContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: `${COLORS.primary}15`,
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
  spacer: {
    flex: 1,
  },
  ctaButton: {
    marginBottom: SPACING.md,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md + 2,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  ctaText: {
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
    marginBottom: SPACING.sm,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
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
});

export default TrialStartScreen;
