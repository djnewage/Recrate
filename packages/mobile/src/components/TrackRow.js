import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BPMBadge from './BPMBadge';

const TrackRow = ({ track, onPress, onLongPress, onMenuPress, isSelected }) => {
  // Format duration from seconds to MM:SS
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity
      style={[styles.row, isSelected && styles.rowSelected]}
      onPress={() => onPress(track)}
      onLongPress={() => onLongPress && onLongPress(track)}
      activeOpacity={0.6}
    >
      {/* BPM Badge */}
      <BPMBadge bpm={track.bpm} />

      {/* Track Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {track.artist || 'Unknown Artist'} · {formatDuration(track.duration)}
        </Text>
        {(track.key || track.playCount > 0) && (
          <Text style={styles.metadata}>
            {track.key && `Key: ${track.key}`}
            {track.key && track.playCount > 0 && ' · '}
            {track.playCount > 0 && `Plays: ${track.playCount}`}
          </Text>
        )}
      </View>

      {/* Selection Checkmark or Menu Button */}
      {isSelected ? (
        <View style={styles.checkmark}>
          <Ionicons name="checkmark-circle" size={28} color="#8B5CF6" />
        </View>
      ) : (
        onMenuPress && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onMenuPress(track);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.menuButton}
          >
            <Text style={styles.menuIcon}>⋮</Text>
          </TouchableOpacity>
        )
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  rowSelected: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)', // Brand purple with transparency
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#999999',
    marginBottom: 2,
  },
  metadata: {
    fontSize: 12,
    fontWeight: '400',
    color: '#667eea',
  },
  menuButton: {
    paddingLeft: 12,
  },
  menuIcon: {
    fontSize: 20,
    color: '#999999',
  },
  checkmark: {
    paddingLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default TrackRow;
