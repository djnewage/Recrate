import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const DisclaimerModal = () => {
  const insets = useSafeAreaInsets();
  const { hasAcceptedDisclaimer, acceptDisclaimer } = useStore();

  if (hasAcceptedDisclaimer) {
    return null;
  }

  return (
    <Modal
      visible={!hasAcceptedDisclaimer}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, { paddingBottom: insets.bottom + SPACING.lg }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning" size={32} color={COLORS.warning} />
            </View>
            <Text style={styles.title}>Important Notice</Text>
            <Text style={styles.subtitle}>Please read before continuing</Text>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DATA MODIFICATION</Text>
              <Text style={styles.sectionText}>
                This app reads and writes to your Serato DJ library files, including crate (.crate) files. While we take precautions to protect your data, there is always a risk of file corruption or data loss.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>BACKUP RECOMMENDATION</Text>
              <Text style={styles.sectionText}>
                We strongly recommend backing up your Serato library folder before using this app. Your Serato data is typically located in:
              </Text>
              <Text style={styles.pathText}>
                Mac: ~/Music/_Serato_{'\n'}
                Windows: %USERPROFILE%\Music\_Serato_
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>COMPATIBILITY</Text>
              <Text style={styles.sectionText}>
                Serato DJ software updates may affect compatibility with Recrate. If this occurs, we will work to address it, but cannot guarantee immediate fixes.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>NO WARRANTY</Text>
              <Text style={styles.sectionText}>
                This software is provided "as is" without warranty of any kind. The developers are not liable for any damages, including but not limited to data loss, file corruption, or any other issues arising from the use of this app.
              </Text>
            </View>

            <Text style={styles.agreement}>
              By tapping "I Understand & Accept" below, you acknowledge that you have read and understood these terms and agree to use this app at your own risk.
            </Text>
          </ScrollView>

          {/* Accept Button */}
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={acceptDisclaimer}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptButtonText}>I Understand & Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    width: '100%',
    maxHeight: '85%',
  },
  header: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  content: {
    height: 350,
  },
  contentContainer: {
    padding: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  sectionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
  pathText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  agreement: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  acceptButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default DisclaimerModal;
