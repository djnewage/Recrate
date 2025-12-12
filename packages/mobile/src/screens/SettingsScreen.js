import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import apiService from '../services/api';
import useStore from '../store/useStore';
import useSubscription from '../hooks/useSubscription';
import ACRCloudService from '../services/ACRCloudService';

const SettingsScreen = ({ navigation }) => {
  const [installations, setInstallations] = useState([]);
  const [currentSeratoPath, setCurrentSeratoPath] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Manual input fields
  const [manualMusicPath, setManualMusicPath] = useState('');
  const [manualSeratoPath, setManualSeratoPath] = useState('');

  // ACRCloud settings (now server-side)
  const [hasACRCredentials, setHasACRCredentials] = useState(false);

  const { resetLibrary, loadLibrary } = useStore();

  const {
    isPremium,
    isLoading: isSubscriptionLoading,
    activeSubscription,
    trialInfo,
    expiryDate,
    showPaywall,
    restorePurchases,
    isInFreeTrial,
    trialDaysRemaining,
    hasPremiumAccess,
  } = useSubscription();

  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadConfig(), scanForLibraries(), loadACRCloudConfig()]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadACRCloudConfig = async () => {
    try {
      const hasCredentials = await ACRCloudService.hasCredentials();
      setHasACRCredentials(hasCredentials);
    } catch (error) {
      console.error('Error loading ACRCloud config:', error);
      setHasACRCredentials(false);
    }
  };

  const loadConfig = async () => {
    try {
      const config = await apiService.getConfig();
      setCurrentSeratoPath(config.seratoPath || '');
      setManualSeratoPath(config.seratoPath || '');
      setManualMusicPath(
        config.musicPaths && config.musicPaths.length > 0
          ? config.musicPaths[0]
          : config.musicPath || ''
      );
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const scanForLibraries = async () => {
    try {
      setIsScanning(true);
      const data = await apiService.getSeratoInstallations();
      setInstallations(data.installations || []);
      setCurrentSeratoPath(data.currentSeratoPath || '');
    } catch (error) {
      console.error('Error scanning for libraries:', error);
      Alert.alert('Scan Error', 'Could not scan for Serato libraries. Check server connection.');
    } finally {
      setIsScanning(false);
    }
  };

  const selectLibrary = async (installation) => {
    Alert.alert(
      'Switch Library',
      `Switch to "${installation.name}"?\n\n` +
      `${installation.trackCount.toLocaleString()} tracks • ${installation.crateCount} crates\n\n` +
      `Note: Server restart required for changes to fully apply.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: () => applyLibrary(installation),
        },
      ]
    );
  };

  const applyLibrary = async (installation) => {
    try {
      setIsSaving(true);

      const configData = {
        seratoPath: installation.seratoPath,
        musicPaths: installation.musicPaths,
      };

      const result = await apiService.updateConfig(configData);

      Alert.alert(
        'Library Updated',
        result.requiresRestart
          ? 'Configuration saved! Restart the server to fully apply changes.'
          : 'Configuration saved! Library will reload automatically.',
        [
          {
            text: 'OK',
            onPress: async () => {
              if (!result.requiresRestart) {
                resetLibrary();
                await loadLibrary();
              }
              await loadConfig();
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to update configuration';
      Alert.alert('Error', errorMessage);
      console.error('Error saving config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveManualConfig = async () => {
    try {
      setIsSaving(true);

      const configData = {};
      if (manualMusicPath) configData.musicPath = manualMusicPath;
      if (manualSeratoPath) configData.seratoPath = manualSeratoPath;

      const result = await apiService.updateConfig(configData);

      Alert.alert(
        'Configuration Saved',
        result.requiresRestart
          ? 'Settings saved! Restart the server to apply changes.'
          : 'Settings saved! Library will reload.',
        [
          {
            text: 'OK',
            onPress: async () => {
              if (!result.requiresRestart) {
                resetLibrary();
                await loadLibrary();
              }
              await loadConfig();
              setShowAdvanced(false);
              navigation.goBack();
            },
          },
        ]
      );
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to update configuration';
      Alert.alert('Error', errorMessage);
      console.error('Error saving config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const renderLibraryCard = (installation) => {
    const isActive = installation.isActive || installation.seratoPath === currentSeratoPath;

    // Icon based on volume type
    const icon = installation.volumeType === 'internal' ? '💿' : '💾';

    return (
      <TouchableOpacity
        key={installation.id}
        style={[styles.libraryCard, isActive && styles.libraryCardActive]}
        onPress={() => !isActive && selectLibrary(installation)}
        disabled={isSaving || !installation.available}
      >
        <View style={styles.libraryCardHeader}>
          <View style={styles.libraryCardTitle}>
            <Text style={styles.libraryCardIcon}>{icon}</Text>
            <Text style={styles.libraryCardName}>{installation.name}</Text>
          </View>
          {isActive && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}
        </View>

        <View style={styles.libraryCardStats}>
          <Text style={styles.libraryCardStat}>
            {installation.trackCount.toLocaleString()} tracks
          </Text>
          <Text style={styles.libraryCardStat}>•</Text>
          <Text style={styles.libraryCardStat}>
            {installation.crateCount} crates
          </Text>
        </View>

        <Text style={styles.libraryCardPath} numberOfLines={1}>
          {installation.seratoPath}
        </Text>

        {!installation.available && (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableText}>Drive not connected</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Subscription Section */}
        <View style={styles.subscriptionSection}>
          <View style={styles.subscriptionCard}>
            <View style={styles.subscriptionHeader}>
              <View style={[styles.subscriptionBadge, isInFreeTrial && styles.trialBadgeIcon]}>
                <Ionicons
                  name={hasPremiumAccess ? 'star' : 'star-outline'}
                  size={20}
                  color={hasPremiumAccess ? '#FFD700' : COLORS.textSecondary}
                />
              </View>
              <View style={styles.subscriptionInfo}>
                <Text style={styles.subscriptionTitle}>
                  {isPremium ? 'Recrate Pro' : isInFreeTrial ? 'Free Trial' : 'Free Plan'}
                </Text>
                {isInFreeTrial && (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>{trialDaysRemaining} DAY{trialDaysRemaining !== 1 ? 'S' : ''} LEFT</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Premium Subscriber */}
            {isPremium && (
              <View style={styles.subscriptionDetails}>
                <Text style={styles.subscriptionDetailText}>
                  {activeSubscription?.willRenew
                    ? `Renews ${expiryDate}`
                    : `Expires ${expiryDate}`}
                </Text>
                <TouchableOpacity
                  style={styles.manageButton}
                  onPress={() => {
                    if (Platform.OS === 'ios') {
                      Linking.openURL('https://apps.apple.com/account/subscriptions');
                    } else {
                      Linking.openURL('https://play.google.com/store/account/subscriptions');
                    }
                  }}
                >
                  <Text style={styles.manageButtonText}>Manage Subscription</Text>
                  <Ionicons name="open-outline" size={14} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
            )}

            {/* In Free Trial */}
            {!isPremium && isInFreeTrial && (
              <View style={styles.subscriptionDetails}>
                <Text style={styles.subscriptionDetailText}>
                  You have full access to all features during your trial
                </Text>
                <View style={styles.trialFeaturesList}>
                  <Text style={styles.featureItemActive}>✓ Unlimited crates</Text>
                  <Text style={styles.featureItemActive}>✓ Track identification</Text>
                  <Text style={styles.featureItemActive}>✓ Advanced filters</Text>
                  <Text style={styles.featureItemActive}>✓ Nested crates</Text>
                </View>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() => showPaywall()}
                >
                  <Ionicons name="star" size={16} color="#fff" />
                  <Text style={styles.upgradeButtonText}>Subscribe Now</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Trial Expired / Free Plan */}
            {!isPremium && !isInFreeTrial && (
              <View style={styles.subscriptionDetails}>
                <Text style={styles.subscriptionDetailText}>
                  Your trial has ended. Subscribe to unlock all features.
                </Text>
                <View style={styles.freeFeaturesList}>
                  <Text style={styles.featureItem}>• 1 crate limit</Text>
                  <Text style={styles.featureItem}>• Basic sorting only</Text>
                  <Text style={styles.featureItem}>• No track identification</Text>
                </View>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() => showPaywall()}
                >
                  <Ionicons name="star" size={16} color="#fff" />
                  <Text style={styles.upgradeButtonText}>Upgrade to Recrate Pro</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={async () => {
                    setIsRestoringPurchases(true);
                    const result = await restorePurchases();
                    setIsRestoringPurchases(false);
                    if (result.success && result.restored) {
                      Alert.alert('Success', 'Your subscription has been restored!');
                    } else if (result.success && !result.restored) {
                      Alert.alert('No Subscription Found', 'No previous subscription was found.');
                    } else {
                      Alert.alert('Error', result.error || 'Failed to restore purchases.');
                    }
                  }}
                  disabled={isRestoringPurchases}
                >
                  {isRestoringPurchases ? (
                    <ActivityIndicator size="small" color={COLORS.textSecondary} />
                  ) : (
                    <Text style={styles.restoreButtonText}>Restore Purchases</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Library Section Header */}
        <Text style={styles.sectionHeaderText}>Library Settings</Text>

        {/* Available Libraries Section */}
        {installations.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Available Libraries</Text>
              <TouchableOpacity onPress={scanForLibraries} disabled={isScanning}>
                <Text style={styles.refreshText}>
                  {isScanning ? 'Scanning...' : '↻ Refresh'}
                </Text>
              </TouchableOpacity>
            </View>

            {installations.map(installation => renderLibraryCard(installation))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🔍</Text>
            <Text style={styles.emptyStateTitle}>No Libraries Found</Text>
            <Text style={styles.emptyStateText}>
              No Serato installations detected. {'\n'}
              Use manual configuration below.
            </Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={scanForLibraries}
              disabled={isScanning}
            >
              <Text style={styles.scanButtonText}>
                {isScanning ? 'Scanning...' : 'Scan Again'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Advanced/Manual Configuration */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Text style={styles.advancedToggleText}>
              {showAdvanced ? '▼' : '▶'} Manual Configuration
            </Text>
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedContent}>
              <Text style={styles.advancedHint}>
                For custom paths or network drives
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Music Files Path</Text>
                <TextInput
                  style={styles.input}
                  value={manualMusicPath}
                  onChangeText={setManualMusicPath}
                  placeholder="/path/to/music"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Serato Library Path</Text>
                <TextInput
                  style={styles.input}
                  value={manualSeratoPath}
                  onChangeText={setManualSeratoPath}
                  placeholder="/path/to/_Serato_"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={saveManualConfig}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Text style={styles.saveButtonText}>Save Manual Configuration</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ACRCloud Settings */}
        <View style={styles.section}>
          <View style={styles.acrStatusSection}>
            <View style={styles.acrToggleRow}>
              <View style={styles.acrToggleLeft}>
                <Ionicons name="mic" size={20} color={COLORS.primary} />
                <Text style={styles.advancedToggleText}>Track Identification</Text>
              </View>
              {hasACRCredentials ? (
                <View style={styles.configuredBadge}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  <Text style={styles.configuredText}>Configured</Text>
                </View>
              ) : (
                <View style={styles.notConfiguredBadge}>
                  <Ionicons name="close-circle" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.notConfiguredText}>Not Configured</Text>
                </View>
              )}
            </View>
            <Text style={styles.acrHint}>
              {hasACRCredentials
                ? 'ACRCloud is configured on the server. You can use track identification.'
                : 'ACRCloud credentials need to be configured on the server to enable track identification.'}
            </Text>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>💡 How It Works</Text>
          <Text style={styles.infoText}>
            • Libraries are auto-detected from mounted drives{'\n'}
            • Tap a library card to switch to it{'\n'}
            • Server restart required for changes to apply{'\n'}
            • Use manual config for network/cloud drives
          </Text>
        </View>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  header: {
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  refreshText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  libraryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  libraryCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
  },
  libraryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  libraryCardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  libraryCardIcon: {
    fontSize: 24,
    marginRight: SPACING.sm,
  },
  libraryCardName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  activeBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  activeBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.text,
  },
  libraryCardStats: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  libraryCardStat: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  libraryCardPath: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  unavailableBadge: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  unavailableText: {
    fontSize: FONT_SIZES.xs,
    color: '#EF4444',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
    marginBottom: SPACING.lg,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  emptyStateTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  emptyStateText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  scanButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  scanButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  advancedToggle: {
    paddingVertical: SPACING.md,
  },
  advancedToggleText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  advancedContent: {
    marginTop: SPACING.md,
  },
  advancedHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  formGroup: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoBox: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  infoText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  cancelButton: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  acrStatusSection: {
    paddingVertical: SPACING.md,
  },
  acrToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  acrToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  configuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  configuredText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.success,
    fontWeight: '600',
  },
  notConfiguredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  notConfiguredText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  acrHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },

  // Subscription styles
  subscriptionSection: {
    marginBottom: SPACING.xl,
  },
  subscriptionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  subscriptionBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  subscriptionInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  subscriptionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  trialBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  trialBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  subscriptionDetails: {
    marginTop: SPACING.xs,
  },
  subscriptionDetailText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  manageButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },
  freeFeaturesList: {
    marginBottom: SPACING.md,
  },
  trialFeaturesList: {
    marginBottom: SPACING.md,
    paddingLeft: SPACING.xs,
  },
  featureItem: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  featureItemActive: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.success || '#10B981',
    marginBottom: SPACING.xs,
    fontWeight: '500',
  },
  trialBadgeIcon: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  upgradeButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#fff',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  restoreButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  sectionHeaderText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
});

export default SettingsScreen;
