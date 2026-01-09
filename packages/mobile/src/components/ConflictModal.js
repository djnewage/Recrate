import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useOfflineStore from '../store/offlineStore';
import { applyConflictResolution } from '../services/SyncService';

const ConflictModal = () => {
  const { activeConflict, conflicts } = useOfflineStore();
  const [isResolving, setIsResolving] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState(null);

  if (!activeConflict) {
    return null;
  }

  const handleResolve = async (resolution) => {
    setSelectedResolution(resolution);
    setIsResolving(true);

    try {
      await applyConflictResolution(activeConflict.id, resolution);
    } catch (error) {
      console.error('Error resolving conflict:', error);
    } finally {
      setIsResolving(false);
      setSelectedResolution(null);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getConflictMessage = () => {
    switch (activeConflict.conflictType) {
      case 'CRATE_DELETED':
        return `The crate "${activeConflict.crateName}" was deleted on the server while you had pending changes.`;
      case 'CRATE_MODIFIED':
        return `The crate "${activeConflict.crateName}" was modified both locally and on the server.`;
      case 'TRACK_MISMATCH':
        return `The tracks in "${activeConflict.crateName}" have changed on the server since your last sync.`;
      default:
        return `There's a conflict with "${activeConflict.crateName}".`;
    }
  };

  const showMergeOption =
    activeConflict.conflictType !== 'CRATE_DELETED' &&
    activeConflict.serverVersion;

  const remainingConflicts = conflicts.length - 1;

  return (
    <Modal
      visible={!!activeConflict}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning" size={32} color={COLORS.warning} />
            </View>
            <Text style={styles.title}>Sync Conflict</Text>
          </View>

          {/* Description */}
          <Text style={styles.description}>{getConflictMessage()}</Text>

          {/* Version Comparison */}
          {activeConflict.serverVersion && (
            <View style={styles.comparison}>
              <View style={styles.versionBox}>
                <Text style={styles.versionLabel}>Your Version</Text>
                {activeConflict.localVersion?.trackCount !== undefined && (
                  <Text style={styles.versionDetail}>
                    {activeConflict.localVersion.trackCount} tracks
                  </Text>
                )}
                <Text style={styles.versionTime}>
                  {formatDate(activeConflict.localVersion?.lastModified)}
                </Text>
              </View>

              <View style={styles.versionDivider}>
                <Ionicons name="swap-horizontal" size={20} color={COLORS.textSecondary} />
              </View>

              <View style={styles.versionBox}>
                <Text style={styles.versionLabel}>Server Version</Text>
                {activeConflict.serverVersion?.trackCount !== undefined && (
                  <Text style={styles.versionDetail}>
                    {activeConflict.serverVersion.trackCount} tracks
                  </Text>
                )}
                <Text style={styles.versionTime}>
                  {formatDate(activeConflict.serverVersion?.lastModified)}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.localButton]}
              onPress={() => handleResolve('LOCAL')}
              disabled={isResolving}
            >
              {isResolving && selectedResolution === 'LOCAL' ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <>
                  <Ionicons name="phone-portrait-outline" size={18} color={COLORS.text} />
                  <Text style={styles.actionButtonText}>Keep Mine</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.serverButton]}
              onPress={() => handleResolve('SERVER')}
              disabled={isResolving}
            >
              {isResolving && selectedResolution === 'SERVER' ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <>
                  <Ionicons name="cloud-outline" size={18} color={COLORS.text} />
                  <Text style={styles.actionButtonText}>Use Server</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Merge Option (for track conflicts) */}
          {showMergeOption && (
            <TouchableOpacity
              style={[styles.actionButton, styles.mergeButton]}
              onPress={() => handleResolve('MERGE')}
              disabled={isResolving}
            >
              {isResolving && selectedResolution === 'MERGE' ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <>
                  <Ionicons name="git-merge-outline" size={18} color={COLORS.text} />
                  <Text style={styles.actionButtonText}>Merge Both</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Remaining conflicts hint */}
          {remainingConflicts > 0 && (
            <Text style={styles.hint}>
              {remainingConflicts} more conflict{remainingConflicts > 1 ? 's' : ''} to resolve
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 400,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  comparison: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  versionBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  versionDetail: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  versionTime: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  versionDivider: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    minHeight: 48,
  },
  localButton: {
    backgroundColor: COLORS.primary,
  },
  serverButton: {
    backgroundColor: COLORS.sync,
  },
  mergeButton: {
    backgroundColor: COLORS.success,
    marginBottom: SPACING.md,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
  hint: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default ConflictModal;
