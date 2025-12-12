import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { FEATURE_DESCRIPTIONS } from '../constants/subscription';

/**
 * UpgradePrompt - Reusable component for premium feature gating
 *
 * @param {string} feature - Feature key from PREMIUM_FEATURES
 * @param {string} variant - 'modal' | 'inline' | 'banner'
 * @param {function} onUpgrade - Called when user taps upgrade button
 * @param {function} onDismiss - Called when user dismisses (modal only)
 * @param {string} customMessage - Override default feature description
 */
const UpgradePrompt = ({
  feature,
  variant = 'inline',
  onUpgrade,
  onDismiss,
  customMessage,
}) => {
  const featureInfo = FEATURE_DESCRIPTIONS[feature] || {
    title: 'Premium Feature',
    description: 'Upgrade to access this feature',
    icon: 'star',
  };

  const message = customMessage || featureInfo.description;

  // Modal variant - full screen overlay
  if (variant === 'modal') {
    return (
      <Modal transparent animationType="fade" visible onRequestClose={onDismiss}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            {onDismiss && (
              <TouchableOpacity style={styles.modalClose} onPress={onDismiss}>
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}

            <View style={styles.modalIcon}>
              <Ionicons name={featureInfo.icon} size={32} color={COLORS.primary} />
            </View>

            <Text style={styles.modalTitle}>{featureInfo.title}</Text>
            <Text style={styles.modalMessage}>{message}</Text>

            <TouchableOpacity style={styles.modalButton} onPress={onUpgrade}>
              <Ionicons name="star" size={18} color="#fff" />
              <Text style={styles.modalButtonText}>Upgrade to Premium</Text>
            </TouchableOpacity>

            {onDismiss && (
              <TouchableOpacity style={styles.modalDismiss} onPress={onDismiss}>
                <Text style={styles.modalDismissText}>Maybe Later</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // Banner variant - compact horizontal bar
  if (variant === 'banner') {
    return (
      <TouchableOpacity style={styles.banner} onPress={onUpgrade} activeOpacity={0.8}>
        <View style={styles.bannerIcon}>
          <Ionicons name="lock-closed" size={14} color={COLORS.primary} />
        </View>
        <Text style={styles.bannerText} numberOfLines={1}>
          {message}
        </Text>
        <View style={styles.bannerBadge}>
          <Text style={styles.bannerBadgeText}>PRO</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Inline variant (default) - card style
  return (
    <View style={styles.inline}>
      <View style={styles.inlineHeader}>
        <View style={styles.inlineIcon}>
          <Ionicons name={featureInfo.icon} size={20} color={COLORS.primary} />
        </View>
        <View style={styles.inlineTextContainer}>
          <Text style={styles.inlineTitle}>{featureInfo.title}</Text>
          <Text style={styles.inlineMessage}>{message}</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.inlineButton} onPress={onUpgrade}>
        <Ionicons name="lock-open" size={16} color="#fff" />
        <Text style={styles.inlineButtonText}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * LockBadge - Small lock indicator overlay
 */
export const LockBadge = ({ size = 'small' }) => {
  const dimensions = size === 'small' ? 16 : 20;
  const iconSize = size === 'small' ? 10 : 12;

  return (
    <View style={[styles.lockBadge, { width: dimensions, height: dimensions }]}>
      <Ionicons name="lock-closed" size={iconSize} color="#fff" />
    </View>
  );
};

/**
 * PremiumBadge - "PRO" indicator badge
 */
export const PremiumBadge = () => (
  <View style={styles.premiumBadge}>
    <Ionicons name="star" size={10} color="#FFD700" />
    <Text style={styles.premiumBadgeText}>PRO</Text>
  </View>
);

const styles = StyleSheet.create({
  // Modal variant
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    padding: SPACING.xs,
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  modalMessage: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    width: '100%',
  },
  modalButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#fff',
  },
  modalDismiss: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
  },
  modalDismissText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },

  // Banner variant
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  bannerIcon: {
    marginRight: SPACING.sm,
  },
  bannerText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
  },
  bannerBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  bannerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },

  // Inline variant
  inline: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  inlineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  inlineTextContainer: {
    flex: 1,
  },
  inlineTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  inlineMessage: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  inlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  inlineButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#fff',
  },

  // Lock Badge
  lockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Premium Badge
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    gap: 2,
  },
  premiumBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFD700',
  },
});

export default UpgradePrompt;
