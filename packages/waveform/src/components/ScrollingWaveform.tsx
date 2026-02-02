import React, { useMemo, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Canvas,
  Path,
  Group,
  Rect,
  Skia,
  SkPath,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import {
  SpectralWaveformData,
  WaveformColors,
  CuePoint,
  DEFAULT_COLORS,
} from '../types';
import { mergeColors } from '../utils/colorMapping';

export interface ScrollingWaveformProps {
  /** Spectral waveform data with frequency bands */
  data: SpectralWaveformData | null;
  /** Current playback position in SECONDS (not 0-1) */
  position: number;
  /** Total track duration in seconds */
  duration: number;
  /** Whether audio is currently playing (unused in simple mode, kept for API compatibility) */
  isPlaying: boolean;
  /** Container width in pixels */
  width: number;
  /** Container height in pixels */
  height: number;
  /** How many seconds of audio are visible (default: 20) */
  visibleSeconds?: number;
  /** Playhead position as ratio from left (default: 0.33 = 1/3 from left) */
  playheadPosition?: number;
  /** Custom colors for frequency bands */
  colors?: Partial<WaveformColors>;
  /** Callback when user seeks to a new position */
  onSeek?: (positionSeconds: number) => void;
  /** Callback when scrubbing starts */
  onScrubStart?: () => void;
  /** Callback when scrubbing ends */
  onScrubEnd?: () => void;
  /** Enable tap/drag interaction (default: true) */
  interactive?: boolean;
  /** Show playhead line (default: true) */
  showPlayhead?: boolean;
  /** Mirror waveform top/bottom (default: true) */
  mirror?: boolean;
  /** Opacity for played (past) section (default: 0.4) */
  playedOpacity?: number;
  /** Opacity for future section (default: 1.0) */
  futureOpacity?: number;
  /** Cue point markers to display */
  cuePoints?: CuePoint[];
  /** Callback when pinch zoom changes visible seconds */
  onVisibleSecondsChange?: (seconds: number) => void;
  /** Minimum visible seconds for pinch zoom (default: 5) */
  minVisibleSeconds?: number;
  /** Maximum visible seconds for pinch zoom (default: 60) */
  maxVisibleSeconds?: number;
}

/**
 * Generate a Skia path for a frequency band at the total waveform width
 */
function generateScrollingPath(
  values: number[],
  totalWidth: number,
  height: number,
  mirror: boolean = true
): SkPath {
  const path = Skia.Path.Make();

  if (!values || values.length === 0) {
    return path;
  }

  const centerY = height / 2;
  const maxAmplitude = mirror ? (height / 2) * 0.9 : height * 0.9;
  const barWidth = totalWidth / values.length;

  // Start from left edge at center
  path.moveTo(0, centerY);

  // Draw top half (left to right)
  for (let i = 0; i < values.length; i++) {
    const x = i * barWidth + barWidth / 2;
    const amplitude = Math.max(0.02, values[i]);
    const y = centerY - amplitude * maxAmplitude;
    path.lineTo(x, y);
  }

  // End at right edge at center
  path.lineTo(totalWidth, centerY);

  if (mirror) {
    // Draw bottom half (right to left, mirrored)
    for (let i = values.length - 1; i >= 0; i--) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = Math.max(0.02, values[i]);
      const y = centerY + amplitude * maxAmplitude;
      path.lineTo(x, y);
    }
  }

  path.close();
  return path;
}

/**
 * ScrollingWaveform - Serato-style scrolling waveform visualization
 *
 * The waveform scrolls past a fixed playhead as audio plays.
 * Features:
 * - Fixed playhead at 1/3 from left (configurable)
 * - Color-coded frequency bands (bass, mids, highs)
 * - Tap-to-seek and drag-to-scrub
 */
export const ScrollingWaveform: React.FC<ScrollingWaveformProps> = ({
  data,
  position,
  duration,
  isPlaying,
  width,
  height,
  visibleSeconds = 20,
  playheadPosition = 0.33,
  colors: customColors,
  onSeek,
  onScrubStart,
  onScrubEnd,
  interactive = true,
  showPlayhead = true,
  mirror = true,
  playedOpacity = 0.4,
  futureOpacity = 1.0,
  cuePoints = [],
  onVisibleSecondsChange,
  minVisibleSeconds = 5,
  maxVisibleSeconds = 60,
}) => {
  const colors = useMemo(() => mergeColors(customColors), [customColors]);

  // Calculate layout values directly from props
  const pixelsPerSecond = width / visibleSeconds;
  const totalWaveformWidth = duration * pixelsPerSecond;
  const playheadX = width * playheadPosition;

  // Calculate scroll offset: playhead stays fixed, waveform moves
  // At position=0, waveform start should be at playheadX
  // As position increases, waveform moves left (negative translateX)
  const scrollX = playheadX - position * pixelsPerSecond;

  // Shared values for gesture calculations (accessible in worklets)
  const currentPosition = useSharedValue(position);
  const scrubStartPosition = useSharedValue(0);
  const pinchStartSecondsValue = useSharedValue(visibleSeconds);
  const currentPixelsPerSecond = useSharedValue(pixelsPerSecond);

  // Keep shared values in sync with props
  useEffect(() => {
    currentPosition.value = position;
  }, [position]);

  useEffect(() => {
    currentPixelsPerSecond.value = pixelsPerSecond;
  }, [pixelsPerSecond]);

  // Memoize transform to avoid object recreation
  const scrollTransform = useMemo(
    () => [{ translateX: scrollX }],
    [scrollX]
  );

  // Generate paths for the full waveform (memoized - only changes when data changes)
  const paths = useMemo(() => {
    if (!data || !data.bands || duration <= 0) return null;

    return {
      bass: generateScrollingPath(data.bands.bass, totalWaveformWidth, height, mirror),
      mids: generateScrollingPath(data.bands.mids, totalWaveformWidth, height, mirror),
      highs: generateScrollingPath(data.bands.highs, totalWaveformWidth, height, mirror),
    };
  }, [data, totalWaveformWidth, height, mirror, duration]);

  // Clip rects for played/future sections (in container coordinates)
  const playedClip = useMemo(() => {
    const path = Skia.Path.Make();
    path.addRect({ x: 0, y: 0, width: playheadX, height });
    return path;
  }, [playheadX, height]);

  const futureClip = useMemo(() => {
    const path = Skia.Path.Make();
    path.addRect({ x: playheadX, y: 0, width: width - playheadX, height });
    return path;
  }, [playheadX, width, height]);

  // Unified seek handler for both tap and scrub
  const handleSeek = useCallback(
    (newPosition: number) => {
      if (onSeek && interactive && duration > 0) {
        onSeek(newPosition);
      }
    },
    [onSeek, interactive, duration]
  );

  // Tap gesture for quick seek
  const tapGesture = Gesture.Tap()
    .enabled(interactive)
    .onEnd((event) => {
      'worklet';
      const pixelDelta = event.x - playheadX;
      const secondsDelta = pixelDelta / currentPixelsPerSecond.value;
      const newPos = currentPosition.value + secondsDelta;
      const clamped = Math.max(0, Math.min(duration, newPos));
      runOnJS(handleSeek)(clamped);
    });

  // Pan gesture for scrubbing
  const panGesture = Gesture.Pan()
    .enabled(interactive)
    .onStart(() => {
      'worklet';
      scrubStartPosition.value = currentPosition.value;
      if (onScrubStart) {
        runOnJS(onScrubStart)();
      }
    })
    .onUpdate((event) => {
      'worklet';
      // Dragging left (negative translationX) = move forward in time
      const pixelDelta = -event.translationX;
      const secondsDelta = pixelDelta / currentPixelsPerSecond.value;
      const newPos = scrubStartPosition.value + secondsDelta;
      const clamped = Math.max(0, Math.min(duration, newPos));
      runOnJS(handleSeek)(clamped);
    })
    .onEnd(() => {
      'worklet';
      if (onScrubEnd) {
        runOnJS(onScrubEnd)();
      }
    });

  // Pinch gesture for zooming visible seconds
  const pinchGesture = Gesture.Pinch()
    .enabled(interactive && !!onVisibleSecondsChange)
    .onStart(() => {
      'worklet';
      pinchStartSecondsValue.value = visibleSeconds;
    })
    .onUpdate((event) => {
      'worklet';
      // Pinch in (scale > 1) = zoom in = fewer visible seconds
      // Pinch out (scale < 1) = zoom out = more visible seconds
      const newSeconds = pinchStartSecondsValue.value / event.scale;
      // Allow zooming out to see the entire track (max of prop value or duration)
      const effectiveMax = duration > 0 ? Math.max(maxVisibleSeconds, duration) : maxVisibleSeconds;
      const clamped = Math.max(minVisibleSeconds, Math.min(effectiveMax, newSeconds));
      if (onVisibleSecondsChange) {
        runOnJS(onVisibleSecondsChange)(clamped);
      }
    });

  // Combine gestures (tap, pan, or pinch)
  const composedGesture = Gesture.Race(tapGesture, panGesture, pinchGesture);

  // Placeholder when no data
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
          {/* Played portion (dimmed) - clipped to left of playhead */}
          <Group clip={playedClip}>
            <Group transform={scrollTransform} opacity={playedOpacity}>
              <Path path={paths.bass} color={colors.bass} />
              <Path path={paths.mids} color={colors.mids} />
              <Path path={paths.highs} color={colors.highs} />
            </Group>
          </Group>

          {/* Future portion (bright) - clipped to right of playhead */}
          <Group clip={futureClip}>
            <Group transform={scrollTransform} opacity={futureOpacity}>
              <Path path={paths.bass} color={colors.bass} />
              <Path path={paths.mids} color={colors.mids} />
              <Path path={paths.highs} color={colors.highs} />
            </Group>
          </Group>

          {/* Cue point markers (in scrolling coordinate system) */}
          <Group transform={scrollTransform}>
            {cuePoints.map((cuePoint) => {
              if (!cuePoint?.position || duration <= 0) return null;
              const markerX = cuePoint.position * pixelsPerSecond;
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
          </Group>

          {/* Fixed playhead indicator (NOT in scrolling group) */}
          {showPlayhead && (
            <Rect
              x={playheadX - 1}
              y={0}
              width={2}
              height={height}
              color={colors.playhead}
            />
          )}
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

export default ScrollingWaveform;
