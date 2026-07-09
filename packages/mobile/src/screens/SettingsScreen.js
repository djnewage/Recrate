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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import apiService from '../services/api';
import useStore from '../store/useStore';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { useAuthStore } from '../store/authStore';
import { SUBSCRIPTION_TIERS, TIER_FEATURES } from '../constants/subscription';
import ACRCloudService from '../services/ACRCloudService';
import AIKeyService from '../services/AIKeyService';
import TrialCountdownBadge, { TierBadge, UsageIndicator } from '../components/TrialCountdownBadge';
import SubscriptionService from '../services/SubscriptionService';

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

  // AI API Key settings
  const [hasAIKey, setHasAIKey] = useState(false);
  const [aiKeyInput, setAIKeyInput] = useState('');
  const [showAIKeyInput, setShowAIKeyInput] = useState(false);
  const [isSavingAIKey, setIsSavingAIKey] = useState(false);

  const { resetLibrary, loadLibrary } = useStore();

  // Auth state
  const {
    user,
    displayName,
    email,
    signOut,
    deleteAccount,
    getDisplayName,
    isLoading: isAuthLoading,
  } = useAuthStore();

  // Debug state
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  // Subscription state
  const {
    currentTier,
    aiCrateBuildCount,
    trackIdentificationCount,
    getTrialDaysRemaining,
    getRemainingCrateBuilds,
    getRemainingTrackIds,
    restorePurchases,
    refreshSubscription,
    hasAIAccess,
    isLoading: isSubscriptionLoading,
  } = useSubscriptionStore();
  const [isRestoring, setIsRestoring] = useState(false);

  const tierFeatures = TIER_FEATURES[currentTier] || TIER_FEATURES[SUBSCRIPTION_TIERS.EXPIRED];

  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);

    if (result.success) {
      Alert.alert('Restored!', 'Your purchases have been restored.');
    } else {
      Alert.alert('Restore Failed', result.error || 'No purchases found to restore.');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            const result = await signOut();
            if (!result.success) {
              Alert.alert('Error', result.error || 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all of your data (crates synced here, AI usage, subscription record). This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteAccount();
            if (!result.success) {
              Alert.alert('Error', result.error || 'Failed to delete account');
            }
            // On success the auth state clears and the app returns to the sign-in screen.
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadConfig(), scanForLibraries(), loadACRCloudConfig(), loadAIKeyConfig()]);
    } catch (error) {
      // Error loading data
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIKeyConfig = async () => {
    try {
      const hasKey = await AIKeyService.hasApiKey();
      setHasAIKey(hasKey);
    } catch (error) {
      setHasAIKey(false);
    }
  };

  const saveAIKey = async () => {
    if (!aiKeyInput.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }

    if (!AIKeyService.isValidKeyFormat(aiKeyInput)) {
      Alert.alert(
        'Invalid Key Format',
        'Anthropic API keys start with "sk-ant-". Please check your key and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSavingAIKey(true);
    try {
      const success = await AIKeyService.saveApiKey(aiKeyInput);
      if (success) {
        setHasAIKey(true);
        setAIKeyInput('');
        setShowAIKeyInput(false);
        Alert.alert('Success', 'API key saved securely');
      } else {
        Alert.alert('Error', 'Failed to save API key');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key');
    } finally {
      setIsSavingAIKey(false);
    }
  };

  const removeAIKey = async () => {
    Alert.alert(
      'Remove API Key',
      'Are you sure you want to remove your API key? You will return to the free tier.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await AIKeyService.removeApiKey();
            if (success) {
              setHasAIKey(false);
              setAIKeyInput('');
              Alert.alert('Removed', 'Your API key has been removed');
            }
          },
        },
      ]
    );
  };

  const loadACRCloudConfig = async () => {
    try {
      const hasCredentials = await ACRCloudService.hasCredentials();
      setHasACRCredentials(hasCredentials);
    } catch (error) {
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
      // Error loading config
    }
  };

  const scanForLibraries = async () => {
    try {
      setIsScanning(true);
      const data = await apiService.getSeratoInstallations();
      setInstallations(data.installations || []);
      setCurrentSeratoPath(data.currentSeratoPath || '');
    } catch (error) {
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
          <Text style={styles.subtitle}>
            Manage your account and library
          </Text>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.accountCard}>
            <View style={styles.accountInfo}>
              <View style={styles.accountAvatar}>
                <Ionicons name="person" size={24} color={COLORS.text} />
              </View>
              <View style={styles.accountDetails}>
                <Text style={styles.accountName}>{getDisplayName()}</Text>
                {email && (
                  <Text style={styles.accountEmail}>{email}</Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
              disabled={isAuthLoading}
            >
              {isAuthLoading ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
                  <Text style={styles.signOutButtonText}>Sign Out</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteAccountButton}
              onPress={handleDeleteAccount}
              disabled={isAuthLoading}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Library Section Header */}
        <View style={styles.libraryHeader}>
          <Text style={styles.sectionTitle}>Library</Text>
          <Text style={styles.librarySubtitle}>
            Select your Serato library location
          </Text>
        </View>

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

        {/* Subscription Settings */}
        <View style={styles.section}>
          <View style={styles.subscriptionSection}>
            <View style={styles.subscriptionHeader}>
              <View style={styles.subscriptionTitleRow}>
                <Ionicons name="diamond" size={20} color={COLORS.primary} />
                <Text style={styles.advancedToggleText}>Subscription</Text>
              </View>
              <TierBadge tier={currentTier} />
            </View>

            {/* Trial countdown if applicable */}
            {currentTier === SUBSCRIPTION_TIERS.TRIAL && (
              <TrialCountdownBadge
                onPress={() => navigation.navigate('Paywall')}
                style={styles.trialBadge}
              />
            )}

            {/* Expired notice */}
            {currentTier === SUBSCRIPTION_TIERS.EXPIRED && (
              <View style={styles.expiredNotice}>
                <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                <Text style={styles.expiredText}>
                  Your trial has ended. Subscribe to continue using AI features.
                </Text>
              </View>
            )}

            {/* Usage stats for trial/pro */}
            {hasAIAccess() && (
              <View style={styles.usageSection}>
                <UsageIndicator
                  label="AI Crate Builds"
                  used={aiCrateBuildCount}
                  total={tierFeatures.aiCrateBuilds}
                  style={styles.usageIndicator}
                />
                <UsageIndicator
                  label="Track Identifications"
                  used={trackIdentificationCount}
                  total={tierFeatures.trackIdentifications}
                  style={styles.usageIndicator}
                />
              </View>
            )}

            {/* Upgrade/Manage button */}
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => navigation.navigate('Paywall')}
            >
              <Text style={styles.upgradeButtonText}>
                {currentTier === SUBSCRIPTION_TIERS.PRO ? 'Manage Subscription' : 'Upgrade Plan'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>

            {/* Restore purchases */}
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestorePurchases}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color={COLORS.textSecondary} />
              ) : (
                <Text style={styles.restoreButtonText}>Restore Purchases</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.legalCard}>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => Linking.openURL('https://recrate.app/privacy')}
            >
              <Ionicons name="shield-checkmark" size={20} color={COLORS.textSecondary} />
              <Text style={styles.legalRowText}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.legalRow, styles.legalRowLast]}
              onPress={() => Linking.openURL('https://recrate.app/terms')}
            >
              <Ionicons name="document-text" size={20} color={COLORS.textSecondary} />
              <Text style={styles.legalRowText}>Terms of Service</Text>
              <Ionicons name="open-outline" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Debug Section (DEV ONLY) */}
        {__DEV__ && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowDebug(!showDebug)}
            >
              <Text style={styles.advancedToggleText}>
                {showDebug ? '▼' : '▶'} Debug: Trial Testing
              </Text>
            </TouchableOpacity>

            {showDebug && (
              <View style={styles.debugContent}>
                <Text style={styles.debugHint}>
                  Simulate different trial states for testing
                </Text>

                <View style={styles.debugButtonGrid}>
                  <TouchableOpacity
                    style={styles.debugButton}
                    onPress={async () => {
                      await SubscriptionService.simulateTrialDaysRemaining(3);
                      await refreshSubscription();
                      Alert.alert('Done', '3 days remaining');
                    }}
                  >
                    <Text style={styles.debugButtonText}>3 Days</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.debugButton}
                    onPress={async () => {
                      await SubscriptionService.simulateTrialDaysRemaining(1);
                      await refreshSubscription();
                      Alert.alert('Done', '1 day remaining');
                    }}
                  >
                    <Text style={styles.debugButtonText}>1 Day</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.debugButton}
                    onPress={async () => {
                      await SubscriptionService.simulateTrialDaysRemaining(0);
                      await refreshSubscription();
                      Alert.alert('Done', 'Last day of trial');
                    }}
                  >
                    <Text style={styles.debugButtonText}>Last Day</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.debugButton, styles.debugButtonDanger]}
                    onPress={async () => {
                      await SubscriptionService.simulateExpiredTrial();
                      await refreshSubscription();
                      Alert.alert('Done', 'Trial expired');
                    }}
                  >
                    <Text style={styles.debugButtonText}>Expired</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.debugResetButton}
                  onPress={async () => {
                    await SubscriptionService.clearAllData();
                    await refreshSubscription();
                    Alert.alert('Reset', 'All subscription data cleared. Restart the app to see trial screen.');
                  }}
                >
                  <Ionicons name="refresh" size={16} color={COLORS.warning} />
                  <Text style={styles.debugResetButtonText}>Reset All Data</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.debugResetButton}
                  onPress={() => {
                    Alert.alert(
                      'Reset ALL Local Data?',
                      'Clears Keychain trial data, all AsyncStorage (library cache, device ID, disclaimer, saved server), and signs out. Simulates a fresh install.\n\nNote: the server still remembers this account — to re-test the full new-user flow, sign up with a fresh email.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Reset',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              // Keychain trial keys + subscription store state
                              await useSubscriptionStore.getState().clearSubscriptionData();
                              // All zustand caches, device id, lastServerIP, disclaimer flag
                              await AsyncStorage.clear();
                              await signOut();
                            } catch (error) {
                              Alert.alert('Reset failed', error.message);
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash" size={16} color={COLORS.error} />
                  <Text style={[styles.debugResetButtonText, { color: COLORS.error }]}>
                    Reset ALL Local Data (fresh install)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.debugInfoButton}
                  onPress={async () => {
                    const info = await SubscriptionService.getDebugInfo();
                    setDebugInfo(info);
                  }}
                >
                  <Ionicons name="information-circle" size={16} color={COLORS.primary} />
                  <Text style={styles.debugInfoButtonText}>Show Debug Info</Text>
                </TouchableOpacity>

                {debugInfo && (
                  <View style={styles.debugInfoBox}>
                    <Text style={styles.debugInfoText}>
                      Tier: {debugInfo.currentTier}{'\n'}
                      Trial Active: {debugInfo.isTrialActive ? 'Yes' : 'No'}{'\n'}
                      Days Remaining: {debugInfo.daysRemaining}{'\n'}
                      Start: {debugInfo.trialStartDate || 'N/A'}{'\n'}
                      End: {debugInfo.trialEndDate || 'N/A'}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

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
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  // Account section styles
  accountCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  accountAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  accountDetails: {
    flex: 1,
  },
  accountName: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  accountEmail: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.md,
  },
  signOutButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.error,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  deleteAccountButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  libraryHeader: {
    marginBottom: SPACING.md,
  },
  librarySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
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
  // AI Key Settings styles
  freeTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  freeTierText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  aiKeyActions: {
    marginTop: SPACING.sm,
  },
  aiKeySection: {
    marginTop: SPACING.md,
  },
  addKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'flex-start',
  },
  addKeyButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  removeKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'flex-start',
    marginTop: SPACING.md,
  },
  removeKeyButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    fontWeight: '600',
  },
  aiKeyInputContainer: {
    marginTop: SPACING.sm,
  },
  aiKeyInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  aiKeyButtonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  aiKeyCancelButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
  },
  aiKeyCancelButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  aiKeySaveButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
  },
  aiKeySaveButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  aiKeyHelp: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  // Subscription section styles
  subscriptionSection: {
    paddingVertical: SPACING.md,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  subscriptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  trialBadge: {
    marginBottom: SPACING.md,
  },
  expiredNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  expiredText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
  },
  usageSection: {
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  usageIndicator: {
    // Inherits from component
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  upgradeButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.primary,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  restoreButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  // Debug section styles
  debugContent: {
    marginTop: SPACING.md,
  },
  debugHint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  debugButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  debugButton: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  debugButtonDanger: {
    borderColor: COLORS.error,
  },
  debugButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
  debugResetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  debugResetButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.warning,
    fontWeight: '600',
  },
  debugInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  debugInfoButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  debugInfoBox: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  debugInfoText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  // Legal section styles
  legalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  legalRowLast: {
    borderBottomWidth: 0,
  },
  legalRowText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
  },
});

export default SettingsScreen;
