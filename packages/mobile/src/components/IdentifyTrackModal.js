import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../constants/theme';
import AudioRecordingService from '../services/AudioRecordingService';
import ACRCloudService from '../services/ACRCloudService';
import TrackMatchingService from '../services/TrackMatchingService';
import useStore from '../store/useStore';
import TrackRow from './TrackRow';

const RECORDING_DURATION = 5;

const IdentifyTrackModal = ({ visible, onClose, navigation }) => {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [recognizedTrack, setRecognizedTrack] = useState(null);
  const [matches, setMatches] = useState([]);
  const [matchedCrates, setMatchedCrates] = useState([]);
  const [variations, setVariations] = useState([]);

  const timerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;
  const ringAnim3 = useRef(new Animated.Value(0)).current;

  const { tracks, crates, crateTree, loadCrates } = useStore();

  // Ripple animation
  useEffect(() => {
    if (state === 'recording') {
      const createRipple = (anim, delay) => Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
      const r1 = createRipple(ringAnim1, 0);
      const r2 = createRipple(ringAnim2, 666);
      const r3 = createRipple(ringAnim3, 1333);
      r1.start(); r2.start(); r3.start();
      return () => { r1.stop(); r2.stop(); r3.stop(); ringAnim1.setValue(0); ringAnim2.setValue(0); ringAnim3.setValue(0); };
    }
  }, [state]);

  // Pulse animation
  useEffect(() => {
    if (state === 'recording') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      AudioRecordingService.cancelRecording();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setState('idle');
      setError(null);
      setRecognizedTrack(null);
      setMatches([]);
      setMatchedCrates([]);
      setVariations([]);
      isRecordingRef.current = false;
    } else {
      isRecordingRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      AudioRecordingService.cancelRecording();
    }
  }, [visible]);

  const startRecording = async () => {
    try {
      setError(null);
      isRecordingRef.current = true;
      setState('recording');
      await AudioRecordingService.startRecording();
      timerRef.current = setTimeout(async () => {
        if (isRecordingRef.current) await doStopRecording();
      }, RECORDING_DURATION * 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      isRecordingRef.current = false;
      setError(err.message || 'Failed to start recording');
      setState('idle');
    }
  };

  const doStopRecording = async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setState('identifying');
    try {
      const audioUri = await AudioRecordingService.stopRecording();
      await identifyTrack(audioUri);
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setError(err.message || 'Failed to process recording');
      setState('idle');
    }
  };

  const stopRecording = () => doStopRecording();

  const identifyTrack = async (audioUri) => {
    try {
      const result = await ACRCloudService.identify(audioUri);
      if (!result.success) {
        setError(result.error);
        setState('result');
        setRecognizedTrack(null);
        return;
      }

      setRecognizedTrack(result.track);
      console.log('ACRCloud:', result.track.title, 'by', result.track.artist);

      // Find matches
      const libraryMatches = TrackMatchingService.findMatches(result.track, tracks);
      setMatches(libraryMatches);

      // Find variations (remixes, edits, etc.)
      const bestMatch = TrackMatchingService.getBestMatch(libraryMatches);
      const trackVariations = TrackMatchingService.findVariations(
        result.track,
        tracks,
        bestMatch?.track?.id
      );
      setVariations(trackVariations);

      // Find crates
      if (bestMatch) {
        const cratesWithTrack = await findTrackCrates(bestMatch.track.id);
        setMatchedCrates(cratesWithTrack);
      }

      setState('result');
    } catch (err) {
      console.error('Identification failed:', err);
      setError(err.message || 'Failed to identify track');
      setState('result');
    }
  };

  const findTrackCrates = async (trackId) => {
    const cratesWithTrack = [];
    const trackIdStr = String(trackId);

    // Load crates if not already loaded
    let cratesToSearch = crateTree?.length > 0 ? crateTree : crates;
    if (!cratesToSearch || cratesToSearch.length === 0) {
      await loadCrates();
      const freshState = useStore.getState();
      cratesToSearch = freshState.crateTree?.length > 0 ? freshState.crateTree : freshState.crates;
    }

    // Recursive function to search crates and subcrates
    const searchCrate = async (crate, parentPath = '') => {
      const currentPath = parentPath ? `${parentPath} › ${crate.name}` : crate.name;

      try {
        await useStore.getState().loadCrate(crate.id);
        const selectedCrate = useStore.getState().selectedCrate;

        if (selectedCrate?.tracks?.length > 0) {
          const found = selectedCrate.tracks.some(t => String(t.id) === trackIdStr);
          if (found) {
            cratesWithTrack.push({
              id: crate.id,
              name: crate.name,
              fullPath: currentPath
            });
          }
        }
      } catch (e) {
        // Silently handle crate loading errors
      }

      // Recursively search children (subcrates)
      if (crate.children?.length > 0) {
        for (const child of crate.children) {
          await searchCrate(child, currentPath);
        }
      }
    };

    // Search all top-level crates
    for (const crate of cratesToSearch) {
      await searchCrate(crate);
    }

    return cratesWithTrack;
  };

  const handlePlayTrack = (track) => {
    onClose();
    navigation.navigate('Player', { track });
  };

  const handleTryAgain = () => {
    setState('idle');
    setError(null);
    setRecognizedTrack(null);
    setMatches([]);
    setMatchedCrates([]);
    setVariations([]);
  };

  const renderRipple = (anim) => {
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] });
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
    return <Animated.View style={[styles.ripple, { transform: [{ scale }], opacity }]} />;
  };

  const renderIdleState = () => (
    <View style={styles.centerContent}>
      <TouchableOpacity style={styles.mainButton} onPress={startRecording} activeOpacity={0.8}>
        <View style={styles.buttonInner}>
          <Ionicons name="mic" size={56} color="#fff" />
        </View>
      </TouchableOpacity>
      <Text style={styles.mainText}>Tap to identify</Text>
      <Text style={styles.subText}>Make sure the music is playing clearly</Text>
    </View>
  );

  const renderRecordingState = () => (
    <View style={styles.centerContent}>
      <View style={styles.rippleContainer}>
        {renderRipple(ringAnim1)}
        {renderRipple(ringAnim2)}
        {renderRipple(ringAnim3)}
        <Animated.View style={[styles.mainButton, { transform: [{ scale: pulseAnim }] }]}>
          <TouchableOpacity onPress={stopRecording} activeOpacity={0.8}>
            <View style={styles.buttonInner}>
              <Ionicons name="radio" size={56} color="#fff" />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
      <Text style={styles.mainText}>Listening...</Text>
      <Text style={styles.subText}>Tap to stop early</Text>
    </View>
  );

  const renderIdentifyingState = () => (
    <View style={styles.centerContent}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
      <Text style={styles.mainText}>Searching...</Text>
    </View>
  );

  // Format duration from seconds to mm:ss
  const formatDuration = (seconds) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Build metadata string from available data
  const getMetadataItems = (libraryTrack, acrTrack) => {
    const items = [];

    // BPM from library track
    if (libraryTrack?.bpm) {
      items.push(`${Math.round(libraryTrack.bpm)} BPM`);
    }

    // Key from library track
    if (libraryTrack?.key) {
      items.push(libraryTrack.key);
    }

    // Duration from ACR or library
    const duration = acrTrack?.duration || libraryTrack?.duration;
    if (duration) {
      items.push(formatDuration(duration));
    }

    // Album from ACR
    if (acrTrack?.album) {
      items.push(acrTrack.album);
    }

    return items;
  };

  const renderResultState = () => {
    const hasMatch = matches.length > 0;
    const bestMatch = TrackMatchingService.getBestMatch(matches);
    const metadataItems = getMetadataItems(bestMatch?.track, recognizedTrack);

    return (
      <ScrollView style={styles.resultScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.resultContent}>
          {/* Main Result Card */}
          <View style={styles.resultCard}>
            {/* Track Info with Status */}
            <View style={styles.trackHeader}>
              <View style={[styles.statusDot, hasMatch ? styles.statusGreen : styles.statusRed]} />
              <View style={styles.trackHeaderInfo}>
                {recognizedTrack ? (
                  <>
                    <Text style={styles.trackTitle} numberOfLines={2}>{recognizedTrack.title}</Text>
                    <Text style={styles.trackArtist}>{recognizedTrack.artist}</Text>

                    {/* Metadata Row */}
                    {metadataItems.length > 0 && (
                      <View style={styles.metadataRow}>
                        {metadataItems.map((item, idx) => (
                          <View key={idx} style={styles.metadataItem}>
                            {idx > 0 && <Text style={styles.metadataDot}>•</Text>}
                            <Text style={styles.metadataText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.trackTitle}>Couldn't identify track</Text>
                )}
              </View>
            </View>

            {/* Status Badge */}
            <View style={[styles.statusBadge, hasMatch ? styles.statusBadgeGreen : styles.statusBadgeRed]}>
              <Ionicons
                name={hasMatch ? 'checkmark-circle' : 'close-circle'}
                size={16}
                color={hasMatch ? COLORS.success : COLORS.error}
              />
              <Text style={[styles.statusText, hasMatch ? styles.statusTextGreen : styles.statusTextRed]}>
                {hasMatch ? 'In Your Library' : recognizedTrack ? 'Not in Your Library' : error || 'Try again'}
              </Text>
            </View>

            {/* Play Button if match found */}
            {hasMatch && bestMatch && (
              <TouchableOpacity style={styles.playButton} onPress={() => handlePlayTrack(bestMatch.track)}>
                <Ionicons name="play" size={20} color="#fff" />
                <Text style={styles.playButtonText}>Play Track</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Crates Section */}
          {matchedCrates.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>IN CRATES</Text>
              <View style={styles.sectionCard}>
                {matchedCrates.map((crate, idx) => (
                  <View
                    key={crate.id}
                    style={[
                      styles.listItem,
                      idx < matchedCrates.length - 1 && styles.listItemBorder
                    ]}
                  >
                    <Ionicons name="folder" size={18} color={COLORS.primary} />
                    <Text style={styles.listItemText} numberOfLines={1}>{crate.fullPath}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Variations Section */}
          {variations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>VARIATIONS IN LIBRARY</Text>
              {variations.map((v, idx) => (
                <TrackRow
                  key={idx}
                  track={v.track}
                  onPress={handlePlayTrack}
                />
              ))}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleTryAgain}>
              <Ionicons name="refresh" size={20} color={COLORS.text} />
              <Text style={styles.actionButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonPrimary]} onPress={onClose}>
              <Text style={styles.actionButtonTextPrimary}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color={COLORS.textSecondary} />
        </TouchableOpacity>

        {state === 'idle' && renderIdleState()}
        {state === 'recording' && renderRecordingState()}
        {state === 'identifying' && renderIdentifyingState()}
        {state === 'result' && renderResultState()}

        {state === 'idle' && error && (
          <View style={styles.errorToast}>
            <Text style={styles.errorToastText}>{error}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  closeButton: { position: 'absolute', top: SPACING.xl + 10, right: SPACING.lg, zIndex: 10, padding: SPACING.sm },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: SPACING.xl },
  rippleContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center' },
  ripple: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: COLORS.primary },
  mainButton: { width: 140, height: 140, borderRadius: 70, overflow: 'hidden', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 12 },
  buttonInner: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: 70 },
  mainText: { fontSize: 28, fontWeight: '700', color: COLORS.text, marginTop: SPACING.xl },
  subText: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary, marginTop: SPACING.sm },
  loadingContainer: { width: 140, height: 140, borderRadius: 70, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' },

  // Results
  resultScroll: { flex: 1 },
  resultContent: { padding: SPACING.lg, paddingTop: SPACING.xl * 2 },

  // Main Card
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
  },
  trackHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
    marginRight: SPACING.sm,
  },
  statusGreen: { backgroundColor: COLORS.success },
  statusRed: { backgroundColor: COLORS.error },
  trackHeaderInfo: { flex: 1 },
  trackTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 28,
  },
  trackArtist: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  // Metadata Row
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  metadataItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metadataText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  metadataDot: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginHorizontal: SPACING.xs,
  },

  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
    gap: SPACING.xs,
  },
  statusBadgeGreen: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  statusBadgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
  },
  statusTextGreen: { color: COLORS.success },
  statusTextRed: { color: COLORS.error },

  // Play Button
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  playButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#fff',
  },

  // Sections
  section: { marginTop: SPACING.xl },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  listItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
  },
  listItemText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text,
    fontWeight: '500',
  },
  listItemSubtext: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  variationInfo: {
    flex: 1,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    marginTop: SPACING.xl,
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
  },
  actionButtonText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  actionButtonPrimary: { backgroundColor: COLORS.primary },
  actionButtonTextPrimary: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#fff',
  },

  errorToast: {
    position: 'absolute',
    bottom: SPACING.xl * 2,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  errorToastText: {
    fontSize: FONT_SIZES.sm,
    color: '#fff',
    textAlign: 'center',
  },
});

export default IdentifyTrackModal;
