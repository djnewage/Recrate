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
import { generateBlendedBarPaths, BlendedBarPath } from '../utils/pathGeneration';

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
  /** Beat positions in seconds (Serato beat grid). Rendered as vertical grid lines. */
  beats?: number[];
  /** Show the beat grid overlay (default: true when beats provided) */
  showBeatGrid?: boolean;
  /** Beats per bar — every Nth beat is drawn as an emphasized downbeat line (default: 4) */
  beatsPerBar?: number;
  /** Waveform style: 'bars' (Serato-style colored bars) or 'filled' (mirror shape). Default 'bars'. */
  barStyle?: 'bars' | 'filled';
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
  beats = [],
  showBeatGrid = true,
  beatsPerBar = 4,
  barStyle = 'bars',
}) => {
  const colors = useMemo(() => mergeColors(customColors), [customColors]);

  // Layout math derived from props. The scroll is driven by React re-renders: the parent
  // polls playback position (~60fps via useProgress) and passes it as `position`, so each
  // new position recomputes scrollX and repaints the Canvas. (An earlier shared-value +
  // useFrameCallback approach animated on the UI thread without a re-render, but Skia 2.2
  // doesn't repaint the Canvas on shared-value changes under Reanimated 4 — the waveform
  // froze during playback. Driving the transform from props is what reliably repaints.)
  const pixelsPerSecond = width / visibleSeconds;
  const totalWaveformWidth = duration * pixelsPerSecond;
  const playheadX = width * playheadPosition;
  const scrollX = playheadX - position * pixelsPerSecond;

  // Plain-value transform → recomputed every render, so the Canvas repaints with the scroll.
  const scrollTransform = useMemo(() => [{ translateX: scrollX }], [scrollX]);

  // Current position as a shared value for gesture worklets (kept in sync with the prop).
  const currentPosition = useSharedValue(position);
  useEffect(() => {
    currentPosition.value = position;
  }, [position]);

  // Shared values for gesture calculations (accessible in worklets)
  const scrubStartPosition = useSharedValue(0);
  const pinchStartSecondsValue = useSharedValue(visibleSeconds);
  const currentPixelsPerSecond = useSharedValue(pixelsPerSecond);
  const currentDuration = useSharedValue(duration);
  const currentPlayheadX = useSharedValue(playheadX);
  const currentVisibleSeconds = useSharedValue(visibleSeconds);
  const currentMaxVisibleSeconds = useSharedValue(maxVisibleSeconds);
  const currentMinVisibleSeconds = useSharedValue(minVisibleSeconds);

  // Keep gesture shared values in sync with props/layout.
  useEffect(() => {
    currentPixelsPerSecond.value = pixelsPerSecond;
  }, [pixelsPerSecond]);

  useEffect(() => {
    currentDuration.value = duration;
  }, [duration]);

  useEffect(() => {
    currentPlayheadX.value = playheadX;
  }, [playheadX]);

  useEffect(() => {
    currentVisibleSeconds.value = visibleSeconds;
  }, [visibleSeconds]);

  useEffect(() => {
    currentMaxVisibleSeconds.value = maxVisibleSeconds;
  }, [maxVisibleSeconds]);

  useEffect(() => {
    currentMinVisibleSeconds.value = minVisibleSeconds;
  }, [minVisibleSeconds]);

  // Generate paths for the full waveform (memoized - only changes when data/size changes).
  // 'bars' = Serato-style colored bars, each slice a BLEND of all three bands (spanning the
  // full spectrum); 'filled' = the original per-band mirror shapes.
  const paths = useMemo(():
    | { kind: 'bars'; bars: BlendedBarPath[] }
    | { kind: 'filled'; bass: SkPath; mids: SkPath; highs: SkPath }
    | null => {
    if (!data || !data.bands || duration <= 0) return null;

    if (barStyle === 'bars') {
      return { kind: 'bars', bars: generateBlendedBarPaths(data, totalWaveformWidth, height, colors) };
    }
    return {
      kind: 'filled',
      bass: generateScrollingPath(data.bands.bass, totalWaveformWidth, height, mirror),
      mids: generateScrollingPath(data.bands.mids, totalWaveformWidth, height, mirror),
      highs: generateScrollingPath(data.bands.highs, totalWaveformWidth, height, mirror),
    };
  }, [data, totalWaveformWidth, height, mirror, duration, barStyle, colors]);

  // Render the waveform paths for one section (played/future). Opacity is applied by the
  // wrapping <Group>, so this only emits the fills. Blended bars → one <Path> per color
  // bucket; filled → the three band shapes.
  const renderWaveformPaths = () => {
    if (!paths) return null;
    if (paths.kind === 'bars') {
      return paths.bars.map((bar, i) => (
        <Path key={i} path={bar.path} color={bar.color} />
      ));
    }
    return (
      <>
        <Path path={paths.bass} color={colors.bass} />
        <Path path={paths.mids} color={colors.mids} />
        <Path path={paths.highs} color={colors.highs} />
      </>
    );
  };

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

  // Beat grid: two memoized paths (thin beat lines + emphasized downbeat/bar lines) so the
  // whole grid draws in 2 fills regardless of beat count. Positioned in scroll coordinates.
  const beatGridPaths = useMemo(() => {
    if (!showBeatGrid || !beats || beats.length === 0 || duration <= 0) return null;
    const beatLines = Skia.Path.Make();
    const barLines = Skia.Path.Make();
    for (let i = 0; i < beats.length; i++) {
      const x = beats[i] * pixelsPerSecond;
      const isDownbeat = i % beatsPerBar === 0;
      const w = isDownbeat ? 1.5 : 1;
      (isDownbeat ? barLines : beatLines).addRect({ x: x - w / 2, y: 0, width: w, height });
    }
    return { beatLines, barLines };
  }, [beats, pixelsPerSecond, height, beatsPerBar, showBeatGrid, duration]);

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
      const pixelDelta = event.x - currentPlayheadX.value;
      const secondsDelta = pixelDelta / currentPixelsPerSecond.value;
      const newPos = currentPosition.value + secondsDelta;
      const clamped = Math.max(0, Math.min(currentDuration.value, newPos));
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
      const clamped = Math.max(0, Math.min(currentDuration.value, newPos));
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
      pinchStartSecondsValue.value = currentVisibleSeconds.value;
    })
    .onUpdate((event) => {
      'worklet';
      // Pinch in (scale > 1) = zoom in = fewer visible seconds
      // Pinch out (scale < 1) = zoom out = more visible seconds
      const newSeconds = pinchStartSecondsValue.value / event.scale;
      // Allow zooming out to see the entire track (max of prop value or duration)
      const dur = currentDuration.value;
      const maxSec = currentMaxVisibleSeconds.value;
      const minSec = currentMinVisibleSeconds.value;
      const effectiveMax = dur > 0 ? Math.max(maxSec, dur) : maxSec;
      const clamped = Math.max(minSec, Math.min(effectiveMax, newSeconds));
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
              {renderWaveformPaths()}
            </Group>
          </Group>

          {/* Future portion (bright) - clipped to right of playhead */}
          <Group clip={futureClip}>
            <Group transform={scrollTransform} opacity={futureOpacity}>
              {renderWaveformPaths()}
            </Group>
          </Group>

          {/* Beat grid (Serato) — thin beat lines + brighter downbeat/bar lines */}
          {beatGridPaths && (
            <Group transform={scrollTransform}>
              <Path path={beatGridPaths.beatLines} color={colors.playhead} opacity={0.15} />
              <Path path={beatGridPaths.barLines} color={colors.playhead} opacity={0.45} />
            </Group>
          )}

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

          {/* Fixed playhead indicator (NOT in scrolling group): soft glow + crisp line */}
          {showPlayhead && (
            <Group>
              <Rect
                x={playheadX - 4}
                y={0}
                width={8}
                height={height}
                color={colors.playhead}
                opacity={0.18}
              />
              <Rect
                x={playheadX - 1}
                y={0}
                width={2}
                height={height}
                color={colors.playhead}
              />
            </Group>
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
