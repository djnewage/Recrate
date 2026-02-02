/**
 * Tests for gesture calculation logic extracted from ScrollingWaveform
 *
 * These pure functions encapsulate the math used in gesture worklets
 * for tap-to-seek, pan-to-scrub, and pinch-to-zoom interactions.
 */

import {
  calculateSeekPosition,
  calculateScrubPosition,
  calculatePinchZoom,
} from '../gestureCalculations';

describe('gestureCalculations', () => {
  describe('calculateSeekPosition', () => {
    // Common test parameters
    const playheadX = 100; // Playhead at x=100
    const pixelsPerSecond = 10; // 10 pixels per second
    const duration = 180; // 3 minute track

    it('seeks forward when tapping to the right of playhead', () => {
      const currentPosition = 30; // 30 seconds in
      const tapX = 150; // 50 pixels to the right

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = 150 - 100 = 50
      // secondsDelta = 50 / 10 = 5 seconds
      // newPos = 30 + 5 = 35
      expect(result).toBe(35);
    });

    it('seeks backward when tapping to the left of playhead', () => {
      const currentPosition = 30;
      const tapX = 50; // 50 pixels to the left

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = 50 - 100 = -50
      // secondsDelta = -50 / 10 = -5 seconds
      // newPos = 30 - 5 = 25
      expect(result).toBe(25);
    });

    it('stays at same position when tapping exactly at playhead', () => {
      const currentPosition = 30;
      const tapX = 100; // Exactly at playhead

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        pixelsPerSecond,
        duration
      );

      expect(result).toBe(30);
    });

    it('clamps to 0 when seeking before start', () => {
      const currentPosition = 5;
      const tapX = 0; // Way to the left

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = 0 - 100 = -100
      // secondsDelta = -100 / 10 = -10 seconds
      // newPos = 5 - 10 = -5 → clamped to 0
      expect(result).toBe(0);
    });

    it('clamps to duration when seeking past end', () => {
      const currentPosition = 175;
      const tapX = 200; // 100 pixels to the right

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = 200 - 100 = 100
      // secondsDelta = 100 / 10 = 10 seconds
      // newPos = 175 + 10 = 185 → clamped to 180
      expect(result).toBe(180);
    });

    it('handles zero duration edge case', () => {
      const result = calculateSeekPosition(150, playheadX, 0, pixelsPerSecond, 0);
      expect(result).toBe(0);
    });

    it('handles high pixelsPerSecond (zoomed in)', () => {
      const currentPosition = 30;
      const tapX = 110; // 10 pixels to the right
      const highPixelsPerSecond = 100;

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        highPixelsPerSecond,
        duration
      );

      // secondsDelta = 10 / 100 = 0.1 seconds
      expect(result).toBe(30.1);
    });

    it('handles low pixelsPerSecond (zoomed out)', () => {
      const currentPosition = 30;
      const tapX = 110; // 10 pixels to the right
      const lowPixelsPerSecond = 2;

      const result = calculateSeekPosition(
        tapX,
        playheadX,
        currentPosition,
        lowPixelsPerSecond,
        duration
      );

      // secondsDelta = 10 / 2 = 5 seconds
      expect(result).toBe(35);
    });
  });

  describe('calculateScrubPosition', () => {
    const pixelsPerSecond = 10;
    const duration = 180;

    it('moves forward when dragging left (negative translationX)', () => {
      const startPosition = 30;
      const translationX = -50; // Drag left 50 pixels

      const result = calculateScrubPosition(
        translationX,
        startPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = -(-50) = 50
      // secondsDelta = 50 / 10 = 5
      // newPos = 30 + 5 = 35
      expect(result).toBe(35);
    });

    it('moves backward when dragging right (positive translationX)', () => {
      const startPosition = 30;
      const translationX = 50; // Drag right 50 pixels

      const result = calculateScrubPosition(
        translationX,
        startPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = -(50) = -50
      // secondsDelta = -50 / 10 = -5
      // newPos = 30 - 5 = 25
      expect(result).toBe(25);
    });

    it('stays at same position when not dragging', () => {
      const startPosition = 30;
      const translationX = 0;

      const result = calculateScrubPosition(
        translationX,
        startPosition,
        pixelsPerSecond,
        duration
      );

      expect(result).toBe(30);
    });

    it('clamps to 0 when scrubbing past start', () => {
      const startPosition = 5;
      const translationX = 100; // Drag right 100 pixels

      const result = calculateScrubPosition(
        translationX,
        startPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = -100, secondsDelta = -10, newPos = 5 - 10 = -5 → 0
      expect(result).toBe(0);
    });

    it('clamps to duration when scrubbing past end', () => {
      const startPosition = 175;
      const translationX = -100; // Drag left 100 pixels

      const result = calculateScrubPosition(
        translationX,
        startPosition,
        pixelsPerSecond,
        duration
      );

      // pixelDelta = 100, secondsDelta = 10, newPos = 175 + 10 = 185 → 180
      expect(result).toBe(180);
    });

    it('handles fractional movements', () => {
      const startPosition = 30;
      const translationX = -5; // Small drag left

      const result = calculateScrubPosition(
        translationX,
        startPosition,
        pixelsPerSecond,
        duration
      );

      expect(result).toBe(30.5);
    });
  });

  describe('calculatePinchZoom', () => {
    const minSeconds = 5;
    const maxSeconds = 60;

    it('zooms in (fewer visible seconds) when scale > 1', () => {
      const startSeconds = 20;
      const scale = 2; // Pinch in (zoom in)
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 20 / 2 = 10
      expect(result).toBe(10);
    });

    it('zooms out (more visible seconds) when scale < 1', () => {
      const startSeconds = 20;
      const scale = 0.5; // Pinch out (zoom out)
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 20 / 0.5 = 40
      expect(result).toBe(40);
    });

    it('stays at same zoom when scale is 1', () => {
      const startSeconds = 20;
      const scale = 1;
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      expect(result).toBe(20);
    });

    it('clamps to minSeconds when zooming in too far', () => {
      const startSeconds = 10;
      const scale = 5; // Zoom in 5x
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 10 / 5 = 2 → clamped to 5
      expect(result).toBe(5);
    });

    it('clamps to maxSeconds when zooming out too far', () => {
      const startSeconds = 30;
      const scale = 0.1; // Zoom out 10x
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 30 / 0.1 = 300 → clamped to max(60, 180) = 180
      expect(result).toBe(180);
    });

    it('uses duration as max when duration > maxSeconds', () => {
      const startSeconds = 50;
      const scale = 0.3;
      const duration = 300; // 5 minute track

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 50 / 0.3 = 166.67 → clamped to max(60, 300) = 300
      // But 166.67 < 300, so result is 166.67
      expect(result).toBeCloseTo(166.67, 1);
    });

    it('allows zooming out to see entire short track', () => {
      const startSeconds = 10;
      const scale = 0.2;
      const duration = 30; // 30 second track

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 10 / 0.2 = 50 → effectiveMax = max(60, 30) = 60
      // 50 < 60, so result is 50
      expect(result).toBe(50);
    });

    it('handles zero duration gracefully', () => {
      const startSeconds = 20;
      const scale = 0.5;
      const duration = 0;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // effectiveMax = max(60, 0) = 60
      // newSeconds = 20 / 0.5 = 40, clamped to 60
      expect(result).toBe(40);
    });

    it('handles very small scale values', () => {
      const startSeconds = 20;
      const scale = 0.01;
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 20 / 0.01 = 2000 → clamped to max(60, 180) = 180
      expect(result).toBe(180);
    });

    it('handles very large scale values', () => {
      const startSeconds = 20;
      const scale = 100;
      const duration = 180;

      const result = calculatePinchZoom(
        scale,
        startSeconds,
        minSeconds,
        maxSeconds,
        duration
      );

      // newSeconds = 20 / 100 = 0.2 → clamped to 5
      expect(result).toBe(5);
    });
  });
});
