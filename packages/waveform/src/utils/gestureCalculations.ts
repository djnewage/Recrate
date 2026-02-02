/**
 * Pure calculation functions for gesture handling
 *
 * These functions encapsulate the math used in the ScrollingWaveform
 * gesture worklets. Extracting them allows for easy unit testing
 * of the core seek/scrub/zoom logic.
 */

/**
 * Calculate new position when user taps on the waveform
 *
 * Converts the tap location relative to the playhead into a new
 * playback position in seconds.
 *
 * @param tapX - X coordinate of the tap in pixels
 * @param playheadX - X coordinate of the fixed playhead in pixels
 * @param currentPosition - Current playback position in seconds
 * @param pixelsPerSecond - Pixels per second (zoom level)
 * @param duration - Total track duration in seconds
 * @returns New position in seconds, clamped to [0, duration]
 */
export function calculateSeekPosition(
  tapX: number,
  playheadX: number,
  currentPosition: number,
  pixelsPerSecond: number,
  duration: number
): number {
  const pixelDelta = tapX - playheadX;
  const secondsDelta = pixelDelta / pixelsPerSecond;
  const newPos = currentPosition + secondsDelta;
  return Math.max(0, Math.min(duration, newPos));
}

/**
 * Calculate new position during pan/scrub gesture
 *
 * Converts the pan translation into a new playback position.
 * Dragging left (negative translationX) moves forward in time.
 *
 * @param translationX - Pan gesture translation in pixels (negative = drag left)
 * @param startPosition - Position in seconds when scrub started
 * @param pixelsPerSecond - Pixels per second (zoom level)
 * @param duration - Total track duration in seconds
 * @returns New position in seconds, clamped to [0, duration]
 */
export function calculateScrubPosition(
  translationX: number,
  startPosition: number,
  pixelsPerSecond: number,
  duration: number
): number {
  // Dragging left (negative translationX) = move forward in time
  const pixelDelta = -translationX;
  const secondsDelta = pixelDelta / pixelsPerSecond;
  const newPos = startPosition + secondsDelta;
  return Math.max(0, Math.min(duration, newPos));
}

/**
 * Calculate new visible seconds during pinch zoom gesture
 *
 * Pinch in (scale > 1) = zoom in = fewer visible seconds
 * Pinch out (scale < 1) = zoom out = more visible seconds
 *
 * @param scale - Pinch gesture scale factor
 * @param startSeconds - Visible seconds when pinch started
 * @param minSeconds - Minimum allowed visible seconds
 * @param maxSeconds - Maximum allowed visible seconds (may be exceeded by duration)
 * @param duration - Total track duration in seconds
 * @returns New visible seconds, clamped to [minSeconds, max(maxSeconds, duration)]
 */
export function calculatePinchZoom(
  scale: number,
  startSeconds: number,
  minSeconds: number,
  maxSeconds: number,
  duration: number
): number {
  const newSeconds = startSeconds / scale;
  // Allow zooming out to see the entire track
  const effectiveMax = duration > 0 ? Math.max(maxSeconds, duration) : maxSeconds;
  return Math.max(minSeconds, Math.min(effectiveMax, newSeconds));
}
