import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import { useConnectionStore } from '../store/connectionStore';
import useOfflineStore, { OPERATION_STATUS } from '../store/offlineStore';
import { syncQueue } from '../services/SyncService';

const ConnectionStatusBar = () => {
  const { isConnected } = useConnectionStore();
  const {
    operationQueue,
    isSyncing,
    syncProgress,
    conflicts,
    setActiveConflict,
    retryFailedOperations,
    clearQueue,
  } = useOfflineStore();

  const pendingCount = operationQueue.filter(
    (op) => op.status === OPERATION_STATUS.PENDING
  ).length;
  const failedCount = operationQueue.filter(
    (op) => op.status === OPERATION_STATUS.FAILED
  ).length;
  const hasConflicts = conflicts.length > 0;

  // Handle sync button press
  const handleSync = async () => {
    if (isSyncing) return;
    await syncQueue();
  };

  // Handle conflict badge press
  const handleConflictPress = () => {
    if (conflicts.length > 0) {
      setActiveConflict(conflicts[0]);
    }
  };

  // Handle failed operations press - show options
  const handleFailedPress = () => {
    Alert.alert(
      'Failed Operations',
      `${failedCount} operation${failedCount > 1 ? 's' : ''} failed to sync. What would you like to do?`,
      [
        {
          text: 'Retry All',
          onPress: async () => {
            retryFailedOperations();
            // Trigger sync after marking as pending
            if (isConnected) {
              await syncQueue();
            }
          },
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            // Clear only failed operations
            const failedIds = operationQueue
              .filter((op) => op.status === OPERATION_STATUS.FAILED)
              .map((op) => op.id);
            failedIds.forEach((id) => useOfflineStore.getState().dequeueOperation(id));
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // Don't show if connected with no pending operations and no issues
  if (isConnected && pendingCount === 0 && failedCount === 0 && !hasConflicts && !isSyncing) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Connection Status */}
      <View style={styles.statusSection}>
        <View
          style={[
            styles.statusDot,
            isConnected ? styles.connected : styles.disconnected,
          ]}
        />
        <Text style={styles.statusText}>
          {isConnected ? 'Connected' : 'Offline'}
        </Text>
      </View>

      {/* Pending Operations */}
      {pendingCount > 0 && !isSyncing && (
        <View style={styles.pendingSection}>
          <Ionicons name="cloud-upload-outline" size={14} color={COLORS.warning} />
          <Text style={styles.pendingText}>{pendingCount} pending</Text>
        </View>
      )}

      {/* Failed Operations - Tappable to retry or clear */}
      {failedCount > 0 && !isSyncing && (
        <TouchableOpacity style={styles.failedSection} onPress={handleFailedPress}>
          <Ionicons name="alert-circle-outline" size={14} color={COLORS.error} />
          <Text style={styles.failedText}>{failedCount} failed</Text>
        </TouchableOpacity>
      )}

      {/* Conflicts Warning */}
      {hasConflicts && (
        <TouchableOpacity
          style={styles.conflictSection}
          onPress={handleConflictPress}
        >
          <Ionicons name="warning" size={14} color={COLORS.error} />
          <Text style={styles.conflictText}>
            {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Sync Button / Progress */}
      {isConnected && (pendingCount > 0 || failedCount > 0) && (
        <TouchableOpacity
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <ActivityIndicator size="small" color={COLORS.text} />
              <Text style={styles.syncText}>
                {syncProgress.current}/{syncProgress.total}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="sync" size={14} color={COLORS.text} />
              <Text style={styles.syncText}>Sync</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 40,
    gap: SPACING.md,
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connected: {
    backgroundColor: COLORS.success,
  },
  disconnected: {
    backgroundColor: COLORS.error,
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  pendingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  pendingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.warning,
  },
  failedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  failedText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
  },
  conflictSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: BORDER_RADIUS.sm,
  },
  conflictText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.error,
    fontWeight: '600',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    marginLeft: 'auto',
  },
  syncButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  syncText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '600',
  },
});

export default ConnectionStatusBar;
