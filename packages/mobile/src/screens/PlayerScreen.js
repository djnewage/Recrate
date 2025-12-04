import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import TextTicker from 'react-native-text-ticker';
import { useProgress } from 'react-native-track-player';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import useStore from '../store/useStore';
import { apiService } from '../services/api';

const { width } = Dimensions.get('window');

const PlayerScreen = ({ route, navigation }) => {
  const { track: initialTrack } = route.params;
  const [showCratesModal, setShowCratesModal] = useState(false);
  const [selectedCrates, setSelectedCrates] = useState([]);
  const [isAddingToCrates, setIsAddingToCrates] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

  // Get real playback progress from TrackPlayer
  const { position, duration } = useProgress();

  const {
    crates,
    crateTree,
    expandedCrates,
    toggleCrateExpanded,
    loadCrates,
    addTracksToCrate,
    isPlaying,
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
  } = useStore();

  // Use currentTrack from store if available, otherwise use initial track from params
  const track = currentTrack || initialTrack;

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

  const handleSliderChange = (value) => {
    setIsSeeking(true);
    setSeekPosition(value);
  };

  const handleSliderComplete = async (value) => {
    await seekTo(value);
    setIsSeeking(false);
  };

  const handlePrevious = () => {
    playPrevious();
  };

  const handleNext = () => {
    playNext();
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

  // Recursive component for rendering crate tree with selection
  const CrateSelectTreeItem = ({ crate, depth }) => {
    const isSelected = selectedCrates.includes(crate.id);
    const hasChildren = crate.children && crate.children.length > 0;
    const isExpanded = expandedCrates[crate.id];

    return (
      <View>
        <TouchableOpacity
          style={[
            styles.crateSelectItem,
            isSelected && styles.crateSelectItemActive,
            { paddingLeft: SPACING.md + depth * 20 },
          ]}
          onPress={() => toggleCrateSelection(crate.id)}
        >
          {/* Expand/Collapse button for parent crates */}
          {hasChildren ? (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={(e) => {
                e.stopPropagation();
                toggleCrateExpanded(crate.id);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.expandPlaceholder} />
          )}

          <View style={styles.crateSelectInfo}>
            <Text style={styles.crateSelectName}>{crate.name}</Text>
            <Text style={styles.crateSelectCount}>
              {crate.trackCount || 0} tracks
              {hasChildren ? ` · ${crate.children.length} subcrate${crate.children.length > 1 ? 's' : ''}` : ''}
            </Text>
          </View>

          <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
            {isSelected && (
              <Ionicons name="checkmark" size={16} color={COLORS.text} />
            )}
          </View>
        </TouchableOpacity>

        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <View>
            {crate.children.map(child => (
              <CrateSelectTreeItem
                key={child.id}
                crate={child}
                depth={depth + 1}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  // Get artwork URL if available
  const artworkUrl = track.hasArtwork
    ? apiService.getArtworkUrl(track.id)
    : null;

  return (
    <LinearGradient
      colors={['#1E1B4B', '#312E81', '#1F2937']}
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
            {track.title}
          </TextTicker>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track.artist}
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

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={duration || 1}
          value={isSeeking ? seekPosition : position}
          onValueChange={handleSliderChange}
          onSlidingComplete={handleSliderComplete}
          minimumTrackTintColor="#8B5CF6"
          maximumTrackTintColor="rgba(139, 92, 246, 0.3)"
          thumbTintColor="#EC4899"
        />
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(isSeeking ? seekPosition : position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration || 0)}</Text>
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
            color={shuffleEnabled ? "#8B5CF6" : "rgba(255, 255, 255, 0.6)"}
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
            name={repeatMode === 'track' ? "repeat-outline" : "repeat"}
            size={24}
            color={repeatMode !== 'off' ? "#8B5CF6" : "rgba(255, 255, 255, 0.6)"}
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
              {crateTree.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="folder-open-outline" size={48} color={COLORS.textSecondary} />
                  <Text style={styles.emptyStateText}>No crates available</Text>
                  <Text style={styles.emptyStateSubtext}>Create a crate in the Crates tab first</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.cratesList}
                  contentContainerStyle={styles.cratesListContent}
                  showsVerticalScrollIndicator={false}
                >
                  {crateTree.map(crate => (
                    <CrateSelectTreeItem
                      key={crate.id}
                      crate={crate}
                      depth={0}
                    />
                  ))}
                </ScrollView>
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
    width: width * 0.75,
    height: width * 0.75,
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
    color: 'rgba(139, 92, 246, 0.8)',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalContent: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.xl,
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
    flex: 1,
  },
  cratesList: {
    flex: 1,
  },
  cratesListContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    paddingTop: SPACING.sm,
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
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.background,
    marginVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  crateSelectItemActive: {
    borderColor: COLORS.primary,
  },
  expandButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.xs,
  },
  expandPlaceholder: {
    width: 24,
    marginRight: SPACING.xs,
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
