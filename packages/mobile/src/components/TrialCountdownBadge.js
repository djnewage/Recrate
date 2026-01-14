import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { SUBSCRIPTION_TIERS } from '../constants/subscription';

/**
 * Badge component showing trial days remaining
 * Tappable to navigate to paywall
 */
const TrialCountdownBadge = ({ onPress, style, compact = false }) => {
  const { currentTier, getTrialDaysRemaining } = useSubscriptionStore();
  const daysRemaining = getTrialDaysRemaining();

  // Only show for trial users with time remaining
  if (currentTier !== SUBSCRIPTION_TIERS.TRIAL || daysRemaining <= 0) {
    return null;
  }

  const isUrgent = daysRemaining <= 1;

  if (compact) {
    return (
      <TouchableOpacity
        style={[styles.compactContainer, style]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={isUrgent ? [COLORS.warning, '#F97316'] : [COLORS.primary, COLORS.secondary]}
          style={styles.compactGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Ionicons
            name={isUrgent ? 'warning' : 'time'}
            size={12}
            color="#FFFFFF"
          />
          <Text style={styles.compactText}>
            {daysRemaining}d
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <LinearGradient
        colors={isUrgent ? [COLORS.warning, '#F97316'] : [COLORS.primary, COLORS.secondary]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Ionicons
          name={isUrgent ? 'warning' : 'time'}
          size={16}
          color="#FFFFFF"
        />
        <Text style={styles.text}>
          {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left
        </Text>
        <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
      </LinearGradient>
    </TouchableOpacity>
  );
};

/**
 * Tier badge component showing current subscription status
 */
export const TierBadge = ({ tier, style }) => {
  const getBadgeConfig = () => {
    switch (tier) {
      case SUBSCRIPTION_TIERS.TRIAL:
        return {
          label: 'Trial',
          colors: [COLORS.primary, COLORS.secondary],
          icon: 'time',
        };
      case SUBSCRIPTION_TIERS.BASIC:
        return {
          label: 'Basic',
          colors: [COLORS.textSecondary, '#6B7280'],
          icon: 'person',
        };
      case SUBSCRIPTION_TIERS.PRO:
        return {
          label: 'Pro',
          colors: [COLORS.primary, COLORS.secondary],
          icon: 'diamond',
        };
      case SUBSCRIPTION_TIERS.EXPIRED:
        return {
          label: 'Expired',
          colors: [COLORS.error, '#DC2626'],
          icon: 'alert-circle',
        };
      default:
        return {
          label: 'Free',
          colors: [COLORS.textSecondary, '#6B7280'],
          icon: 'person',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <View style={[styles.tierBadgeContainer, style]}>
      <LinearGradient
        colors={config.colors}
        style={styles.tierBadgeGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Ionicons name={config.icon} size={12} color="#FFFFFF" />
        <Text style={styles.tierBadgeText}>{config.label}</Text>
      </LinearGradient>
    </View>
  );
};

/**
 * Usage indicator showing remaining AI uses
 */
export const UsageIndicator = ({ used, total, label, style }) => {
  const remaining = Math.max(0, total - used);
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  const isLow = percentage <= 20;

  return (
    <View style={[styles.usageContainer, style]}>
      <View style={styles.usageHeader}>
        <Text style={styles.usageLabel}>{label}</Text>
        <Text style={[styles.usageCount, isLow && styles.usageCountLow]}>
          {remaining}/{total}
        </Text>
      </View>
      <View style={styles.usageBarBackground}>
        <View
          style={[
            styles.usageBarFill,
            { width: `${percentage}%` },
            isLow && styles.usageBarFillLow,
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.xs,
  },
  text: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  compactContainer: {
    alignSelf: 'flex-start',
  },
  compactGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    gap: 2,
  },
  compactText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Tier Badge styles
  tierBadgeContainer: {
    alignSelf: 'flex-start',
  },
  tierBadgeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
  tierBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Usage Indicator styles
  usageContainer: {
    width: '100%',
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  usageLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  usageCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  usageCountLow: {
    color: COLORS.warning,
  },
  usageBarBackground: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  usageBarFillLow: {
    backgroundColor: COLORS.warning,
  },
});

export default TrialCountdownBadge;
