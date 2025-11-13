import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';

const TrackItem = ({ track, onPress, onLongPress, isSelected }) => {
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.selected]}
      onPress={() => onPress(track)}
      onLongPress={() => onLongPress && onLongPress(track)}
      activeOpacity={0.7}
    >
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
        <View style={styles.metadata}>
          {track.bpm && (
            <Text style={styles.metadataText}>{track.bpm} BPM</Text>
          )}
          {track.key && (
            <Text style={styles.metadataText}>{track.key}</Text>
          )}
          {track.duration > 0 && (
            <Text style={styles.metadataText}>
              {formatDuration(track.duration)}
            </Text>
          )}
        </View>
      </View>
      {isSelected ? (
        <View style={styles.checkmark} />
      ) : (
        <Text style={styles.arrow}>›</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}20`,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs / 2,
  },
  artist: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  metadata: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  metadataText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    marginLeft: SPACING.md,
  },
  arrow: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.textSecondary,
    marginLeft: SPACING.md,
    opacity: 0.5,
  },
});

export default TrackItem;
