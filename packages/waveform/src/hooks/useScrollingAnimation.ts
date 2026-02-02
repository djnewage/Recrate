import { useEffect, useMemo } from 'react';
import {
  useSharedValue,
  useDerivedValue,
  useFrameCallback,
  SharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export interface UseScrollingAnimationParams {
  /** Current playback position in seconds */
  position: number;
  /** Total track duration in seconds */
  duration: number;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** How many seconds of audio are visible at once (default: 20) */
  visibleSeconds?: number;
  /** Playhead position as ratio from left (default: 0.33 = 1/3 from left) */
  playheadRatio?: number;
  /** Container width in pixels */
  containerWidth: number;
}

export interface UseScrollingAnimationResult {
  /** Shared value for translateX transform (use in Skia Group) */
  scrollX: SharedValue<number>;
  /** Current position shared value (for gesture calculations) */
  currentPosition: SharedValue<number>;
  /** Pixels per second (for converting tap position to time) */
  pixelsPerSecond: number;
  /** Total waveform width in pixels */
  totalWaveformWidth: number;
  /** Playhead X position in pixels from left edge */
  playheadX: number;
  /** Flag indicating if currently scrubbing (pauses prediction) */
  isScrubbing: SharedValue<boolean>;
  /** Set scrub position directly (bypasses prediction) */
  setScrubPosition: (positionSeconds: number) => void;
}

/**
 * Hook for smooth scrolling waveform animation with frame prediction
 *
 * Uses Reanimated's useFrameCallback to predict position between
 * progress updates (which only come every 100-200ms), enabling
 * smooth 60fps scrolling.
 */
export function useScrollingAnimation({
  position,
  duration,
  isPlaying,
  visibleSeconds = 20,
  playheadRatio = 0.33,
  containerWidth,
}: UseScrollingAnimationParams): UseScrollingAnimationResult {
  // Calculate static layout values
  const pixelsPerSecond = containerWidth / visibleSeconds;
  const totalWaveformWidth = duration * pixelsPerSecond;
  const playheadX = containerWidth * playheadRatio;

  // Shared values for animation
  const lastKnownPosition = useSharedValue(position);
  const lastUpdateTimestamp = useSharedValue(Date.now());
  const isPlayingValue = useSharedValue(isPlaying);
  const isScrubbing = useSharedValue(false);

  // Current predicted position (in seconds)
  const currentPosition = useSharedValue(position);

  // ScrollX value for translateX transform
  const scrollX = useSharedValue(playheadX - position * pixelsPerSecond);

  // Update shared values when props change
  useEffect(() => {
    isPlayingValue.value = isPlaying;
  }, [isPlaying, isPlayingValue]);

  // When external position updates, sync and correct any drift
  useEffect(() => {
    if (!isScrubbing.value) {
      lastKnownPosition.value = position;
      lastUpdateTimestamp.value = Date.now();
      currentPosition.value = position;

      // Smoothly animate to corrected position
      scrollX.value = withTiming(playheadX - position * pixelsPerSecond, {
        duration: 100,
        easing: Easing.linear,
      });
    }
  }, [
    position,
    playheadX,
    pixelsPerSecond,
    lastKnownPosition,
    lastUpdateTimestamp,
    currentPosition,
    scrollX,
    isScrubbing,
  ]);

  // Frame callback for smooth prediction during playback
  useFrameCallback((frameInfo) => {
    'worklet';

    // Skip prediction if paused or scrubbing
    if (!isPlayingValue.value || isScrubbing.value) {
      return;
    }

    // Calculate elapsed time since last known position
    const now = frameInfo.timestamp;
    const elapsed = (now - lastUpdateTimestamp.value) / 1000;

    // Predict current position (assuming 1x playback speed)
    const predicted = Math.min(lastKnownPosition.value + elapsed, duration);
    currentPosition.value = predicted;

    // Update scroll position
    scrollX.value = playheadX - predicted * pixelsPerSecond;
  });

  // Function to directly set position during scrubbing
  const setScrubPosition = useMemo(
    () => (positionSeconds: number) => {
      'worklet';
      const clamped = Math.max(0, Math.min(duration, positionSeconds));
      currentPosition.value = clamped;
      scrollX.value = playheadX - clamped * pixelsPerSecond;
    },
    [duration, playheadX, pixelsPerSecond, currentPosition, scrollX]
  );

  return {
    scrollX,
    currentPosition,
    pixelsPerSecond,
    totalWaveformWidth,
    playheadX,
    isScrubbing,
    setScrubPosition,
  };
}

export default useScrollingAnimation;
