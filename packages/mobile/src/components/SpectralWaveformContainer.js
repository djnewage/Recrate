import React, { useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useProgress } from 'react-native-track-player';
import { SpectralWaveform } from '@recrate/waveform';
import useStore from '../store/useStore';
import { COLORS } from '../constants/theme';

/**
 * SpectralWaveformContainer Component
 *
 * Handles spectral waveform data fetching, caching, and progress synchronization.
 * Displays a Serato-style colored waveform with frequency bands:
 * - Bass (red)
 * - Mids (green)
 * - Highs (blue)
 *
 * Falls back to a simple progress bar if spectral data is unavailable.
 */
const SpectralWaveformContainer = ({
  trackId,
  duration = 0,
  onSeek,
  width = 300,
  height = 60,
  cuePoints = {},
}) => {
  const { position } = useProgress(200); // Update every 200ms for smooth animation

  // Get spectral waveform state and actions from store
  const spectralWaveformCache = useStore((state) => state.spectralWaveformCache);
  const isLoadingSpectralWaveform = useStore((state) => state.isLoadingSpectralWaveform);
  const loadSpectralWaveform = useStore((state) => state.loadSpectralWaveform);

  // Get cached spectral data
  const spectralData = trackId ? spectralWaveformCache[trackId] : null;

  // Load spectral waveform when track changes
  useEffect(() => {
    if (trackId && !spectralData && !isLoadingSpectralWaveform) {
      loadSpectralWaveform(trackId);
    }
  }, [trackId, spectralData, isLoadingSpectralWaveform, loadSpectralWaveform]);

  // Calculate progress (0-1)
  const progress = duration > 0 ? position / duration : 0;

  // Transform cue points object to array for SpectralWaveform
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
      <SpectralWaveform
        data={waveformData}
        progress={progress}
        duration={duration}
        onSeek={handleSeek}
        width={width}
        height={height}
        interactive={true}
        showPlayhead={true}
        mirror={true}
        cuePoints={cuePointsArray}
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
