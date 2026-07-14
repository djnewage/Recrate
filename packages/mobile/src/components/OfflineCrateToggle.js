import React from 'react';
import { View, Text, Switch, Alert, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useDownloadStore, { useDownloadProgressStore } from '../store/downloadStore';
import useOfflineStore from '../store/offlineStore';
import { useSubscriptionStore } from '../store/subscriptionStore';
import DownloadService from '../services/DownloadService';
import { formatBytes } from '../utils/format';

/**
 * "Available offline" switch for a crate, with download progress/status line.
 * Pro-gated: non-Pro users see the switch disabled and get the paywall prompt.
 */
const OfflineCrateToggle = ({ crateId, navigation }) => {
  // Subscribe to the slices that drive the status line so it live-updates
  const isOffline = useDownloadStore((s) => s.offlineCrateIds.includes(crateId));
  const trackFiles = useDownloadStore((s) => s.trackFiles);
  const serverCrateTracks = useOfflineStore((s) => s.serverCrateTracks);
  const canUseOfflineDownloads = useSubscriptionStore((s) => s.canUseOfflineDownloads);
  // Selector returns a primitive so per-chunk progress updates don't re-render
  // this row unless the number of this crate's in-flight downloads changes.
  const downloadingCount = useDownloadProgressStore((s) => {
    if (!isOffline) return 0;
    const trackIds = useOfflineStore.getState().getCachedCrateTracks(crateId);
    return trackIds.filter((id) => s.activeDownloads[id]).length;
  });

  const entitled = canUseOfflineDownloads();

  // Recompute when the cached crate membership changes (serverCrateTracks subscription)
  const trackIds = React.useMemo(
    () => useOfflineStore.getState().getCachedCrateTracks(crateId),
    [crateId, serverCrateTracks]
  );
  // trackFiles is the reactive source; the store helpers do the counting
  const { downloadedCount, crateBytes } = React.useMemo(() => {
    const store = useDownloadStore.getState();
    return {
      downloadedCount: store.getCrateDownloadProgress(crateId).downloaded,
      crateBytes: store.getCrateBytes(crateId),
    };
  }, [crateId, trackFiles, serverCrateTracks]);

  const showPaywallPrompt = () => {
    Alert.alert(
      'Pro Feature',
      'Download crates to your phone and play them anywhere — no laptop or connection needed. Subscribe to Pro to unlock offline crates.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Subscribe', onPress: () => navigation.navigate('Paywall') },
      ]
    );
  };

  const handleToggle = (value) => {
    // Gate turning ON only — a downgraded user must still be able to turn a
    // crate off and free up storage.
    if (!entitled && value) {
      showPaywallPrompt();
      return;
    }

    if (value) {
      const store = useDownloadStore.getState();
      store.setCrateOffline(crateId, true);
      // Toggling a crate on is the retry affordance for previously failed tracks
      store.clearFailedTracks();
      DownloadService.reconcile();
    } else {
      Alert.alert(
        'Remove Downloads',
        'Turn off offline access for this crate? Downloaded files not used by another offline crate will be deleted.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => DownloadService.removeCrateDownloads(crateId),
          },
        ]
      );
    }
  };

  let statusText = null;
  if (isOffline && trackIds.length > 0) {
    if (downloadedCount === trackIds.length) {
      statusText = `${downloadedCount} tracks · ${formatBytes(crateBytes)}`;
    } else if (downloadingCount > 0) {
      statusText = `Downloading ${downloadedCount} of ${trackIds.length}…`;
    } else {
      statusText = `${downloadedCount} of ${trackIds.length} downloaded — connect to continue`;
    }
  }

  const content = (
    <View style={styles.container}>
      <Ionicons
        name={isOffline && downloadedCount === trackIds.length && trackIds.length > 0
          ? 'cloud-done-outline'
          : 'cloud-download-outline'}
        size={20}
        color={entitled ? COLORS.primary : COLORS.textSecondary}
      />
      <View style={styles.labels}>
        <Text style={[styles.label, !entitled && styles.labelDisabled]}>Available offline</Text>
        {statusText && <Text style={styles.status}>{statusText}</Text>}
        {!entitled && <Text style={styles.status}>Pro feature</Text>}
      </View>
      <Switch
        value={isOffline}
        onValueChange={handleToggle}
        disabled={!entitled && !isOffline}
        trackColor={{ false: COLORS.border, true: COLORS.primary }}
        thumbColor={COLORS.text}
      />
    </View>
  );

  // Non-entitled: the switch is disabled, so wrap the row to catch the tap
  if (!entitled) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={showPaywallPrompt}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  labels: {
    flex: 1,
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  labelDisabled: {
    color: COLORS.textSecondary,
  },
  status: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});

export default OfflineCrateToggle;
