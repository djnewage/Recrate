import React, { useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useProgress } from 'react-native-track-player';
import Waveform from './Waveform';
import useStore from '../store/useStore';
import { COLORS } from '../constants/theme';

/**
 * WaveformContainer Component
 *
 * Handles waveform data fetching, caching, and progress synchronization.
 * Falls back to a simple progress bar if waveform is unavailable.
 *
 * Props:
 * - trackId: string - Track ID to display waveform for
 * - duration: number - Track duration in seconds
 * - onSeek: (position: number) => void - Callback when user seeks
 * - width: number - Component width
 * - height: number - Component height
 */
const WaveformContainer = ({
  trackId,
  duration = 0,
  onSeek,
  width = 300,
  height = 60,
}) => {
  const { position } = useProgress(200); // Update every 200ms for smooth animation

  // Get waveform state and actions from store
  const waveformCache = useStore((state) => state.waveformCache);
  const isLoadingWaveform = useStore((state) => state.isLoadingWaveform);
  const loadWaveform = useStore((state) => state.loadWaveform);

  // Get cached waveform data
  const waveformData = trackId ? waveformCache[trackId] : null;
  const peaks = waveformData?.peaks || null;

  // Load waveform when track changes
  useEffect(() => {
    if (trackId && !waveformData && !isLoadingWaveform) {
      loadWaveform(trackId);
    }
  }, [trackId, waveformData, isLoadingWaveform, loadWaveform]);

  // Calculate progress (0-1)
  const progress = duration > 0 ? position / duration : 0;

  // Handle seek
  const handleSeek = useCallback(
    (seekPosition) => {
      if (onSeek) {
        onSeek(seekPosition);
      }
    },
    [onSeek]
  );

  // Show loading indicator while fetching waveform
  if (isLoadingWaveform && !peaks) {
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

  // Fall back to simple progress bar if no waveform
  if (!peaks) {
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

  return (
    <View style={[styles.container, { width, height }]}>
      <Waveform
        peaks={peaks}
        progress={progress}
        duration={duration}
        onSeek={handleSeek}
        width={width}
        height={height}
        interactive={true}
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

export default React.memo(WaveformContainer);
