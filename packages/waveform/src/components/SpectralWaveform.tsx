import React, { useMemo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Path,
  Group,
  Rect,
  vec,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import {
  SpectralWaveformProps,
  SpectralWaveformData,
  WaveformColors,
  DEFAULT_COLORS,
} from '../types';
import { mergeColors } from '../utils/colorMapping';
import { generateBandPath, generatePlayedClipRect } from '../utils/pathGeneration';

/**
 * SpectralWaveform - Serato-style colored waveform visualization
 *
 * Renders frequency bands as layered paths:
 * - Bass (20-250 Hz) in red
 * - Mids (250-4000 Hz) in green
 * - Highs (4000-20000 Hz) in blue
 *
 * Features:
 * - Mirror waveform (symmetric top/bottom)
 * - Progress indicator with played/unplayed sections
 * - Tap-to-seek and drag scrubbing
 * - 60fps GPU-accelerated rendering via Skia
 */
export const SpectralWaveform: React.FC<SpectralWaveformProps> = ({
  data,
  progress,
  duration,
  width,
  height,
  colors: customColors,
  onSeek,
  onScrubStart,
  onScrubEnd,
  interactive = true,
  showPlayhead = true,
  mirror = true,
  playedOpacity = 1,
  unplayedOpacity = 0.4,
  cuePoints = [],
}) => {
  const colors = useMemo(() => mergeColors(customColors), [customColors]);

  // Generate paths for each frequency band
  const paths = useMemo(() => {
    if (!data || !data.bands) return null;

    return {
      bass: generateBandPath(data.bands.bass, width, height, mirror),
      mids: generateBandPath(data.bands.mids, width, height, mirror),
      highs: generateBandPath(data.bands.highs, width, height, mirror),
    };
  }, [data, width, height, mirror]);

  // Calculate playhead position
  const playheadX = useMemo(() => {
    return Math.max(0, Math.min(1, progress)) * width;
  }, [progress, width]);

  // Clip path for played portion
  const playedClip = useMemo(() => {
    return generatePlayedClipRect(progress, width, height);
  }, [progress, width, height]);

  // Handle seek gestures
  const handleSeek = useCallback(
    (x: number) => {
      if (!onSeek || !interactive || duration <= 0) return;

      const normalizedX = Math.max(0, Math.min(1, x / width));
      const seekTime = normalizedX * duration;
      onSeek(seekTime);
    },
    [onSeek, interactive, duration, width]
  );

  // Tap gesture for quick seek
  const tapGesture = Gesture.Tap()
    .enabled(interactive)
    .onEnd((event) => {
      runOnJS(handleSeek)(event.x);
    });

  // Pan gesture for scrubbing
  const panGesture = Gesture.Pan()
    .enabled(interactive)
    .onStart(() => {
      if (onScrubStart) {
        runOnJS(onScrubStart)();
      }
    })
    .onUpdate((event) => {
      runOnJS(handleSeek)(event.x);
    })
    .onEnd(() => {
      if (onScrubEnd) {
        runOnJS(onScrubEnd)();
      }
    });

  // Combine gestures
  const composedGesture = Gesture.Race(tapGesture, panGesture);

  // If no data, show placeholder
  if (!paths) {
    return (
      <View style={[styles.container, { width, height }]}>
        <View style={[styles.placeholder, { backgroundColor: colors.mids + '33' }]} />
      </View>
    );
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={[styles.container, { width, height }]}>
        <Canvas style={{ width, height }}>
          {/* Unplayed waveform (full width, dimmed) */}
          <Group opacity={unplayedOpacity}>
            <Path path={paths.bass} color={colors.bass} />
            <Path path={paths.mids} color={colors.mids} />
            <Path path={paths.highs} color={colors.highs} />
          </Group>

          {/* Played waveform (clipped to progress, full opacity) */}
          <Group clip={playedClip} opacity={playedOpacity}>
            <Path path={paths.bass} color={colors.bass} />
            <Path path={paths.mids} color={colors.mids} />
            <Path path={paths.highs} color={colors.highs} />
          </Group>

          {/* Playhead indicator */}
          {showPlayhead && (
            <Rect
              x={playheadX - 1}
              y={0}
              width={2}
              height={height}
              color={colors.playhead}
            />
          )}

          {/* Cue point markers */}
          {cuePoints.map((cuePoint) => {
            if (!cuePoint?.position || duration <= 0) return null;
            const markerX = (cuePoint.position / duration) * width;
            const markerColor = cuePoint.color || '#FFFFFF';

            return (
              <Group key={cuePoint.id}>
                {/* Vertical line */}
                <Rect
                  x={markerX - 1}
                  y={0}
                  width={2}
                  height={height}
                  color={markerColor}
                  opacity={0.9}
                />
                {/* Triangle indicator at top */}
                <Path
                  path={`M ${markerX - 5} 0 L ${markerX + 5} 0 L ${markerX} 8 Z`}
                  color={markerColor}
                />
              </Group>
            );
          })}
        </Canvas>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    borderRadius: 4,
  },
});

export default SpectralWaveform;
