import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useProgress } from 'react-native-track-player';
import { ScrollingWaveform } from '@recrate/waveform';
import useStore from '../store/useStore';
import { COLORS } from '../constants/theme';

/**
 * SpectralWaveformContainer Component
 *
 * Handles spectral waveform data fetching, caching, and progress synchronization.
 * Displays a Serato-style scrolling waveform with frequency bands:
 * - Bass (red)
 * - Mids (purple)
 * - Highs (cyan)
 *
 * The waveform scrolls past a fixed playhead (1/3 from left) as the track plays.
 * Falls back to a simple progress bar if spectral data is unavailable.
 */
const SpectralWaveformContainer = ({
  trackId,
  duration = 0,
  onSeek,
  width = 300,
  height = 60,
  cuePoints = {},
  visibleSeconds: initialVisibleSeconds = 20,
}) => {
  // Local state for pinch-to-zoom
  const [visibleSeconds, setVisibleSeconds] = useState(initialVisibleSeconds);

  // Fast updates (50ms = ~20fps) for smooth scrolling animation
  const { position } = useProgress(50);

  // Get isPlaying state from store for animation sync
  const isPlaying = useStore((state) => state.isPlaying);

  // Get spectral waveform state and actions from store
  const spectralWaveformCache = useStore((state) => state.spectralWaveformCache);
  const isLoadingSpectralWaveform = useStore((state) => state.isLoadingSpectralWaveform);
  const loadSpectralWaveform = useStore((state) => state.loadSpectralWaveform);

  // Beat grid (Serato) state + loader
  const beatGridCache = useStore((state) => state.beatGridCache);
  const loadBeatGrid = useStore((state) => state.loadBeatGrid);

  // Get cached spectral data
  const spectralData = trackId ? spectralWaveformCache[trackId] : null;
  const beatGrid = trackId ? beatGridCache[trackId] : null;
  const beats = beatGrid?.beats || [];

  // Track IDs that failed to load to prevent infinite retry loops
  const failedTrackIds = useRef(new Set());
  const requestedBeats = useRef(new Set());

  // Load spectral waveform when track changes
  useEffect(() => {
    if (trackId && !spectralData && !isLoadingSpectralWaveform && !failedTrackIds.current.has(trackId)) {
      loadSpectralWaveform(trackId).then(result => {
        if (!result) {
          failedTrackIds.current.add(trackId);
        }
      });
    }
  }, [trackId, spectralData, isLoadingSpectralWaveform, loadSpectralWaveform]);

  // Load the beat grid when track changes (fetched once; empty grids are cached too)
  useEffect(() => {
    if (trackId && !beatGrid && !requestedBeats.current.has(trackId)) {
      requestedBeats.current.add(trackId);
      loadBeatGrid(trackId);
    }
  }, [trackId, beatGrid, loadBeatGrid]);

  // Calculate progress (0-1) for fallback progress bar
  const progress = duration > 0 ? position / duration : 0;

  // Transform cue points object to array for ScrollingWaveform
  // Input: { 1: {position, color, label}, 2: {...} }
  // Output: [{id, position, color, label, type}, ...]
  const cuePointsArray = useMemo(() => {
    return Object.entries(cuePoints).map(([bankNumber, cp]) => ({
      id: `${trackId}-cue-${bankNumber}`,
      position: cp.position,
      color: cp.color || '#FFFFFF',
      label: cp.label,
      type: 'hot_cue',
    }));
  }, [cuePoints, trackId]);

  // Handle seek
  const handleSeek = useCallback(
    (seekPosition) => {
      if (onSeek) {
        onSeek(seekPosition);
      }
    },
    [onSeek]
  );

  // Show loading indicator while fetching spectral data
  if (isLoadingSpectralWaveform && !spectralData) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
        {/* Show simple progress bar while loading */}
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
        </View>
      </View>
    );
  }

  // Fall back to simple progress bar if no spectral data
  if (!spectralData || !spectralData.bands) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={styles.fallbackContainer}>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>
    );
  }

  // Format data for SpectralWaveform component
  const waveformData = {
    trackId,
    duration: spectralData.duration || duration,
    sampleCount: spectralData.sampleCount || spectralData.bands.bass.length,
    bands: spectralData.bands,
    peaks: spectralData.peaks,
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <ScrollingWaveform
        data={waveformData}
        position={position}
        duration={duration}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        width={width}
        height={height}
        visibleSeconds={visibleSeconds}
        onVisibleSecondsChange={setVisibleSeconds}
        minVisibleSeconds={5}
        maxVisibleSeconds={60}
        playheadPosition={0.33}
        interactive={true}
        showPlayhead={true}
        mirror={true}
        barStyle="bars"
        cuePoints={cuePointsArray}
        beats={beats}
        showBeatGrid={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: `${COLORS.primary}33`, // 20% opacity
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});

export default React.memo(SpectralWaveformContainer);
