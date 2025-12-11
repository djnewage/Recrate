import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectionStore, CONNECTION_TYPES } from '../store/connectionStore';
import { COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';
import QRScanner from '../components/QRScanner';

const ConnectionScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    connectionType,
    serverURL,
    isConnected,
    isSearching,
    hasEverConnected,
    findServer,
    connectManually,
    disconnect,
    enterDemoMode,
    checkHasEverConnected,
  } = useConnectionStore();

  const [showManualModal, setShowManualModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [manualURL, setManualURL] = useState('');
  const [connectionError, setConnectionError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check connection history and optionally auto-connect on mount
  useEffect(() => {
    const initConnection = async () => {
      // First, check if user has ever connected before
      const hasConnected = await checkHasEverConnected();

      // Only auto-connect if user has connected before
      // This ensures first-time users (like Apple reviewers) see the welcome screen
      if (hasConnected && !isConnected && !isSearching) {
        findServer();
      }
    };

    initConnection();
  }, []);

  // Navigate to main app when connected
  useEffect(() => {
    if (isConnected) {
      setTimeout(() => {
        navigation.replace('Main');
      }, 1000);
    }
  }, [isConnected, navigation]);

  const handleManualConnect = async () => {
    if (!manualURL) return;

    setIsConnecting(true);
    setConnectionError(null);

    const success = await connectManually(manualURL);

    setIsConnecting(false);

    if (success) {
      setShowManualModal(false);
      setManualURL('');
    } else {
      setConnectionError('Could not connect. Check the address and try again.');
    }
  };

  const handleQRScan = async (url) => {
    setShowQRScanner(false);
    const baseURL = url.replace('/health', '');
    const success = await connectManually(baseURL);
    if (!success) {
      setConnectionError('Could not connect to scanned server.');
    }
  };

  const getStatusText = () => {
    if (isConnected) {
      return 'Connected!';
    }
    if (isSearching) {
      return 'Looking for server...';
    }
    return 'Not connected';
  };

  const getStatusIcon = () => {
    if (isConnected) {
      return <Ionicons name="checkmark-circle" size={20} color="#10B981" />;
    }
    if (isSearching) {
      return <ActivityIndicator size="small" color={COLORS.primary} />;
    }
    return <Ionicons name="wifi-outline" size={20} color={COLORS.textSecondary} />;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      {/* Logo */}
      <Image
        source={require('../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* Title */}
      <Text style={styles.title}>Recrate</Text>
      <Text style={styles.subtitle}>Connect to your music library</Text>

      {/* Connection Status */}
      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          {getStatusIcon()}
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
        {isConnected && serverURL && (
          <Text style={styles.serverURL} numberOfLines={1}>
            {serverURL}
          </Text>
        )}
      </View>

      {/* Actions */}
      {isConnected ? (
        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={disconnect}
          activeOpacity={0.7}
        >
          <Text style={styles.disconnectButtonText}>Disconnect</Text>
        </TouchableOpacity>
      ) : (
        <>
          {/* Retry Button (if not searching) */}
          {!isSearching && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={findServer}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={18} color={COLORS.text} />
              <Text style={styles.retryButtonText}>Search Again</Text>
            </TouchableOpacity>
          )}

          {/* Secondary Actions */}
          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowQRScanner(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="qr-code-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.secondaryButtonText}>Scan QR</Text>
            </TouchableOpacity>

            <View style={styles.dividerVertical} />

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowManualModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.secondaryButtonText}>Enter IP</Text>
            </TouchableOpacity>
          </View>

          {/* Demo Mode Button - Prominent for first-time users */}
          <TouchableOpacity
            style={styles.demoButton}
            onPress={enterDemoMode}
            activeOpacity={0.7}
          >
            <Ionicons name="play-circle-outline" size={24} color={COLORS.primary} />
            <View style={styles.demoButtonTextContainer}>
              <Text style={styles.demoButtonTitle}>Try Demo Mode</Text>
              <Text style={styles.demoButtonSubtitle}>Preview app without server connection</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </>
      )}

      {/* Help Section */}
      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>Having trouble?</Text>
        <Text style={styles.helpItem}>• Make sure the desktop app is running</Text>
        <Text style={styles.helpItem}>• Both devices should be on the same WiFi</Text>
        <Text style={styles.helpItem}>• Try scanning the QR code from the desktop app</Text>
      </View>

      {/* Manual Entry Modal */}
      <Modal
        visible={showManualModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowManualModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Server Address</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowManualModal(false);
                  setConnectionError(null);
                  setManualURL('');
                }}
              >
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              value={manualURL}
              onChangeText={(text) => {
                setManualURL(text);
                setConnectionError(null);
              }}
              placeholder="192.168.1.100 or hostname.local"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isConnecting}
            />

            {connectionError && (
              <Text style={styles.errorText}>{connectionError}</Text>
            )}

            <TouchableOpacity
              style={[
                styles.connectButton,
                (!manualURL || isConnecting) && styles.connectButtonDisabled,
              ]}
              onPress={handleManualConnect}
              disabled={!manualURL || isConnecting}
              activeOpacity={0.7}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.connectButtonText}>Connect</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal
        visible={showQRScanner}
        animationType="slide"
        onRequestClose={() => setShowQRScanner(false)}
      >
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  serverURL: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  disconnectButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
  },
  disconnectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  secondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  secondaryButtonText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  dividerVertical: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xl,
    gap: SPACING.md,
    width: '100%',
  },
  demoButtonTextContainer: {
    flex: 1,
  },
  demoButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  demoButtonSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  helpSection: {
    marginTop: 'auto',
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  helpItem: {
    fontSize: 13,
    color: COLORS.textSecondary,
    opacity: 0.7,
    marginBottom: SPACING.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: SPACING.md,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  connectButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  connectButtonDisabled: {
    opacity: 0.5,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ConnectionScreen;
