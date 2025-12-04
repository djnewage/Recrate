import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from 'react-native-track-player';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const MiniPlayer = () => {
  const navigation = useNavigation();
  const { currentTrack, isPlaying, pauseTrack, resumeTrack, stopTrack, playNext } =
    useStore();

  // Get real playback progress from TrackPlayer
  const { position, duration } = useProgress();

  const togglePlayPause = () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      resumeTrack();
    }
  };

  const handleStop = () => {
    stopTrack();
  };

  const handleNext = () => {
    playNext();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOpenPlayer = () => {
    navigation.navigate('Player', { track: currentTrack });
  };

  if (!currentTrack) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progress,
            { width: `${(position / duration) * 100}%` },
          ]}
        />
      </View>
      <View style={styles.content}>
        {/* BPM Badge */}
        {currentTrack.bpm && (
          <View style={styles.bpmBadge}>
            <Text style={styles.bpmText}>{Math.round(currentTrack.bpm)}</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.info}
          onPress={handleOpenPlayer}
          activeOpacity={0.7}
        >
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.artist}
          </Text>
        </TouchableOpacity>
        <View style={styles.controls}>
          <Text style={styles.time}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={togglePlayPause}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color={COLORS.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={handleNext}
          >
            <Ionicons name="play-skip-forward" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleStop}
          >
            <Ionicons name="stop" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  progressBar: {
    height: 3,
    backgroundColor: COLORS.background,
  },
  progress: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
  },
  bpmBadge: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#06B6D4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  bpmText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  info: {
    flex: 1,
    marginRight: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs / 2,
  },
  artist: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  time: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginRight: SPACING.sm,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MiniPlayer;
