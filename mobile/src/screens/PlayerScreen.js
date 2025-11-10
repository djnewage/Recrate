import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';

const { width } = Dimensions.get('window');

const PlayerScreen = ({ route, navigation }) => {
  const { track } = route.params;
  const [showCratesModal, setShowCratesModal] = useState(false);
  const [selectedCrates, setSelectedCrates] = useState([]);
  const [isAddingToCrates, setIsAddingToCrates] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off'); // off, all, one
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration || 192); // Default 3:12

  const {
    crates,
    loadCrates,
    addTracksToCrate,
    isPlaying,
    currentTrack,
    playTrack,
    pauseTrack,
    resumeTrack,
  } = useStore();

  // Check if this is the currently playing track
  const isCurrentTrack = currentTrack?.id === track.id;

  useEffect(() => {
    loadCrates();
  }, []);

  // Reload crates when modal opens
  useEffect(() => {
    if (showCratesModal) {
      loadCrates();
    }
  }, [showCratesModal]);

  // Simulate playback progress
  useEffect(() => {
    let interval;
    if (isCurrentTrack && isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCurrentTrack, isPlaying, duration]);

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

  const toggleShuffle = () => {
    setIsShuffleOn(!isShuffleOn);
  };

  const toggleRepeat = () => {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(repeatMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setRepeatMode(modes[nextIndex]);
  };

  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
  };

  const handleSliderChange = (value) => {
    setCurrentTime(value);
  };

  const handlePrevious = () => {
    // TODO: Implement previous track functionality
    console.log('Previous track');
  };

  const handleNext = () => {
    // TODO: Implement next track functionality
    console.log('Next track');
  };

  const handleAddToCrates = async () => {
    if (selectedCrates.length === 0) {
      return;
    }

    setIsAddingToCrates(true);

    for (const crateId of selectedCrates) {
      await addTracksToCrate(crateId, [track.id]);
    }

    setIsAddingToCrates(false);
    setShowCratesModal(false);
    setSelectedCrates([]);
  };

  const toggleCrateSelection = (crateId) => {
    if (selectedCrates.includes(crateId)) {
      setSelectedCrates(selectedCrates.filter(id => id !== crateId));
    } else {
      setSelectedCrates([...selectedCrates, crateId]);
    }
  };

  const renderCrateItem = ({ item }) => {
    const isSelected = selectedCrates.includes(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.crateSelectItem,
          isSelected && styles.crateSelectItemActive,
        ]}
        onPress={() => toggleCrateSelection(item.id)}
      >
        <View style={styles.crateSelectInfo}>
          <Text style={styles.crateSelectName}>{item.name}</Text>
          <Text style={styles.crateSelectCount}>
            {item.trackCount || 0} tracks
          </Text>
        </View>
        <View
          style={[
            styles.checkbox,
            isSelected && styles.checkboxActive,
          ]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={COLORS.text} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Get artwork URL if available
  const artworkUrl = track.hasArtwork
    ? `http://localhost:3000/api/artwork/${track.id}`
    : null;

  return (
    <LinearGradient
      colors={['#2d1b1e', '#1a0f10', '#0a0506']}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-down" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Now Playing</Text>
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
              <Ionicons name="musical-notes" size={80} color="rgba(255, 255, 255, 0.3)" />
            </View>
          )}
        </View>
      </View>

      {/* Track Info with Actions */}
      <View style={styles.trackInfoContainer}>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={2}>
            {track.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track.artist}
          </Text>
          {/* Metadata: BPM and Key */}
          <View style={styles.metadata}>
            {track.bpm && (
              <View style={styles.metadataItem}>
                <Text style={styles.metadataValue}>
                  {Math.round(track.bpm)} BPM
                </Text>
              </View>
            )}
            {track.bpm && track.key && (
              <Text style={styles.metadataSeparator}>•</Text>
            )}
            {track.key && (
              <View style={styles.metadataItem}>
                <Text style={styles.metadataValue}>
                  {track.key}
                </Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={toggleFavorite}
        >
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={32}
            color={isFavorite ? "#FF6B9D" : "#FFFFFF"}
          />
        </TouchableOpacity>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration}
          value={currentTime}
          onValueChange={handleSliderChange}
          minimumTrackTintColor="#FFFFFF"
          maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
          thumbTintColor="#FFFFFF"
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Playback Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleShuffle}
        >
          <Ionicons
            name="shuffle"
            size={24}
            color={isShuffleOn ? "#FFFFFF" : "rgba(255, 255, 255, 0.6)"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={handlePrevious}
        >
          <Ionicons name="play-skip-back" size={32} color="rgba(255, 255, 255, 0.9)" />
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
          <Ionicons name="play-skip-forward" size={32} color="rgba(255, 255, 255, 0.9)" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleRepeat}
        >
          <Ionicons
            name={repeatMode === 'one' ? "repeat-outline" : "repeat"}
            size={24}
            color={repeatMode !== 'off' ? "#FFFFFF" : "rgba(255, 255, 255, 0.6)"}
          />
        </TouchableOpacity>
      </View>

      {/* Crates Selection Modal */}
      <Modal
        visible={showCratesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCratesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Crates</Text>
              <TouchableOpacity
                onPress={() => setShowCratesModal(false)}
              >
                <Ionicons name="close" size={28} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select one or more crates
            </Text>

            <View style={styles.cratesListContainer}>
              {crates.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="folder-open-outline" size={48} color={COLORS.textSecondary} />
                  <Text style={styles.emptyStateText}>No crates available</Text>
                  <Text style={styles.emptyStateSubtext}>Create a crate in the Crates tab first</Text>
                </View>
              ) : (
                <FlatList
                  data={crates}
                  keyExtractor={(item) => item.id}
                  renderItem={renderCrateItem}
                  style={styles.cratesList}
                  contentContainerStyle={styles.cratesListContent}
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalActionButton}
                onPress={() => setShowCratesModal(false)}
              >
                <Text style={styles.modalActionButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalActionButton,
                  styles.modalActionButtonPrimary,
                  selectedCrates.length === 0 && styles.modalActionButtonDisabled,
                ]}
                onPress={handleAddToCrates}
                disabled={selectedCrates.length === 0 || isAddingToCrates}
              >
                {isAddingToCrates ? (
                  <ActivityIndicator size="small" color={COLORS.text} />
                ) : (
                  <Text style={styles.modalActionButtonTextPrimary}>
                    Add to {selectedCrates.length} Crate{selectedCrates.length !== 1 ? 's' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  artworkContainer: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  artworkShadow: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: (width * 0.7) / 2,
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
    borderRadius: (width * 0.7) / 2,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artworkPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: (width * 0.7) / 2,
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
  },
  trackInfo: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  trackTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
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
  actionButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xs,
  },
  timeText: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    gap: SPACING.lg,
  },
  controlButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.lg,
    borderTopRightRadius: BORDER_RADIUS.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  cratesListContainer: {
    minHeight: 200,
    maxHeight: 400,
  },
  cratesList: {
    flex: 1,
  },
  cratesListContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyStateText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  emptyStateSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  crateSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    marginVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  crateSelectItemActive: {
    borderColor: COLORS.primary,
  },
  crateSelectInfo: {
    flex: 1,
  },
  crateSelectName: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.xs / 2,
  },
  crateSelectCount: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  modalActionButtonPrimary: {
    backgroundColor: COLORS.primary,
  },
  modalActionButtonDisabled: {
    opacity: 0.5,
  },
  modalActionButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalActionButtonTextPrimary: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.text,
  },
});

export default PlayerScreen;
