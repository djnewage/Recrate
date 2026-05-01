import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import TextTicker from 'react-native-text-ticker';
import { useProgress } from 'react-native-track-player';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import { apiService } from '../services/api';
import SpectralWaveformContainer from '../components/SpectralWaveformContainer';
import CuePointBank from '../components/CuePointBank';
import AddToCratesModal from '../components/AddToCratesModal';

const { width } = Dimensions.get('window');

// Waveform width (full width minus padding)
const WAVEFORM_WIDTH = width - SPACING.xl * 2;

const PREV_RESTART_THRESHOLD = 3; // seconds — restart if past this point
const SEEK_STEP = 10; // seconds — used by ±10s buttons

const PlayerScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { track: initialTrack } = route.params || {};
  const [showCratesModal, setShowCratesModal] = useState(false);

  // Get real playback progress from TrackPlayer (50ms updates for smooth UI)
  const { position, duration } = useProgress(50);

  const {
    isPlaying,
    isLoadingTrack,
    currentTrack,
    playTrack,
    pauseTrack,
    resumeTrack,
    seekTo,
    playNext,
    playPrevious,
    toggleRepeat,
    toggleShuffle,
    repeatMode,
    shuffleEnabled,
    cuePointsCache,
  } = useStore();

  // Use currentTrack from store if available, otherwise use initial track from params
  const track = currentTrack || initialTrack;

  // Check if this is the currently playing track
  const isCurrentTrack = currentTrack?.id === track.id;

  // Auto-play when navigating to player with a track
  useEffect(() => {
    if (initialTrack && currentTrack?.id !== initialTrack.id) {
      playTrack(initialTrack);
    }
  }, [initialTrack?.id]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (isCurrentTrack && isPlaying) {
      pauseTrack();
    } else if (isCurrentTrack && !isPlaying) {
      resumeTrack();
    } else {
      playTrack(track);
    }
  };

  const handleWaveformSeek = async (seekPosition) => {
    await seekTo(seekPosition);
  };

  const handlePrevious = async () => {
    // Restart current track if we're past the threshold; otherwise go to prev track.
    if (position > PREV_RESTART_THRESHOLD) {
      await seekTo(0);
    } else {
      await playPrevious();
    }
  };

  const handleNext = () => {
    playNext();
  };

  const handleSeekBackward = async () => {
    const target = Math.max(0, position - SEEK_STEP);
    await seekTo(target);
  };

  const handleSeekForward = async () => {
    const max = duration || track?.duration || 0;
    const target = max > 0 ? Math.min(max, position + SEEK_STEP) : position + SEEK_STEP;
    await seekTo(target);
  };

  // Get artwork URL if available
  const artworkUrl = track.hasArtwork
    ? apiService.getArtworkUrl(track.id)
    : null;

  const displayTitle = isLoadingTrack ? 'Loading…' : track.title;
  const displayArtist = isLoadingTrack ? '' : track.artist;

  return (
    <LinearGradient
      colors={['#1E1B4B', '#312E81', '#1F2937']}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top > 20 ? insets.top - 20 : insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setShowCratesModal(true)}
        >
          <Ionicons name="add-circle-outline" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Artwork */}
      <View style={styles.artworkContainer}>
        <View style={styles.artworkShadow}>
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              style={styles.artwork}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.artworkPlaceholder}>
              <Ionicons name="musical-notes" size={60} color="rgba(255, 255, 255, 0.3)" />
            </View>
          )}
        </View>
      </View>

      {/* Track Info with Actions */}
      <View style={styles.trackInfoContainer}>
        <View style={styles.trackInfo}>
          <TextTicker
            style={styles.trackTitle}
            duration={20000}
            loop
            bounce={false}
            repeatSpacer={50}
            marqueeDelay={3000}
            useNativeDriver
            animationType="scroll"
            shouldAnimateTreshold={20}
          >
            {displayTitle}
          </TextTicker>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {displayArtist}
          </Text>
          {/* Metadata: BPM and Key */}
          <View style={styles.metadata}>
            {track.bpm && (
              <View style={styles.metadataItem}>
                <Text style={[styles.metadataValue, { color: '#06B6D4' }]}>
                  {Math.round(track.bpm)} BPM
                </Text>
              </View>
            )}
            {track.bpm && track.key && (
              <Text style={styles.metadataSeparator}>•</Text>
            )}
            {track.key && (
              <View style={styles.metadataItem}>
                <Text style={[styles.metadataValue, { color: '#EC4899' }]}>
                  {track.key}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Spectral Waveform Progress */}
      <View style={styles.progressContainer}>
        <SpectralWaveformContainer
          trackId={track.id}
          duration={duration || track.duration || 0}
          onSeek={handleWaveformSeek}
          width={WAVEFORM_WIDTH}
          height={60}
          cuePoints={cuePointsCache[track?.id] || {}}
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration || 0)}</Text>
        </View>
      </View>

      {/* Cue Point Bank */}
      <CuePointBank
        trackId={track.id}
        currentPosition={typeof position === 'number' && !isNaN(position) ? position : 0}
        duration={duration || track.duration || 0}
        onSeek={handleWaveformSeek}
      />

      {/* Playback Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleShuffle}
        >
          <Ionicons
            name="shuffle"
            size={22}
            color={shuffleEnabled ? "#8B5CF6" : "rgba(255, 255, 255, 0.6)"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleSeekBackward}
        >
          <View style={styles.seekIconWrap}>
            <Ionicons name="play-back" size={24} color="rgba(255, 255, 255, 0.9)" />
            <Text style={styles.seekLabel}>10</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handlePrevious}
        >
          <Ionicons name="play-skip-back" size={28} color="rgba(255, 255, 255, 0.9)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPause}
        >
          <Ionicons
            name={isCurrentTrack && isPlaying ? "pause" : "play"}
            size={36}
            color="#FFFFFF"
            style={{ marginLeft: isCurrentTrack && isPlaying ? 0 : 3 }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleNext}
        >
          <Ionicons name="play-skip-forward" size={28} color="rgba(255, 255, 255, 0.9)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleSeekForward}
        >
          <View style={styles.seekIconWrap}>
            <Ionicons name="play-forward" size={24} color="rgba(255, 255, 255, 0.9)" />
            <Text style={styles.seekLabel}>10</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleRepeat}
        >
          <Ionicons
            name={repeatMode === 'track' ? "repeat-outline" : "repeat"}
            size={22}
            color={repeatMode !== 'off' ? "#8B5CF6" : "rgba(255, 255, 255, 0.6)"}
          />
        </TouchableOpacity>
      </View>

      <AddToCratesModal
        visible={showCratesModal}
        onClose={() => setShowCratesModal(false)}
        tracks={track ? [track] : []}
      />
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkContainer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  artworkShadow: {
    width: width * 0.60,
    height: width * 0.60,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 16,
  },
  artwork: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  trackInfoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.lg,
    minHeight: 80,
  },
  trackInfo: {
    flex: 1,
    paddingRight: SPACING.md,
    overflow: 'visible',
  },
  trackTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
    height: 28,
  },
  trackArtist: {
    fontSize: FONT_SIZES.md,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: SPACING.xs,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metadataValue: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  metadataSeparator: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: SPACING.xs,
  },
  progressContainer: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
    marginTop: SPACING.sm,
  },
  timeText: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(139, 92, 246, 0.8)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  controlButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '700',
    marginTop: -4,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});

export default PlayerScreen;
