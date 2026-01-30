import { Skia, SkPath } from '@shopify/react-native-skia';
import { SpectralWaveformData } from '../types';

/**
 * Generate a Skia path for a frequency band
 * Creates a mirror waveform (symmetric top/bottom)
 */
export function generateBandPath(
  values: number[],
  width: number,
  height: number,
  mirror: boolean = true
): SkPath {
  const path = Skia.Path.Make();

  if (!values || values.length === 0) {
    return path;
  }

  const centerY = height / 2;
  const maxAmplitude = mirror ? height / 2 * 0.9 : height * 0.9; // 90% of available height
  const barWidth = width / values.length;

  // Start from left edge at center
  path.moveTo(0, centerY);

  // Draw top half (left to right)
  for (let i = 0; i < values.length; i++) {
    const x = i * barWidth + barWidth / 2;
    const amplitude = Math.max(0.02, values[i]); // Minimum for visibility
    const y = centerY - amplitude * maxAmplitude;
    path.lineTo(x, y);
  }

  // End at right edge at center
  path.lineTo(width, centerY);

  if (mirror) {
    // Draw bottom half (right to left, mirrored)
    for (let i = values.length - 1; i >= 0; i--) {
      const x = i * barWidth + barWidth / 2;
      const amplitude = Math.max(0.02, values[i]);
      const y = centerY + amplitude * maxAmplitude;
      path.lineTo(x, y);
    }
  }

  // Close the path
  path.close();

  return path;
}

/**
 * Generate stacked paths for all three frequency bands
 * Bass at bottom, mids in middle, highs at top
 */
export function generateStackedPaths(
  data: SpectralWaveformData,
  width: number,
  height: number
): { bass: SkPath; mids: SkPath; highs: SkPath } {
  const { bands } = data;

  return {
    bass: generateBandPath(bands.bass, width, height, true),
    mids: generateBandPath(bands.mids, width, height, true),
    highs: generateBandPath(bands.highs, width, height, true),
  };
}

/**
 * Generate a clip rect for the played portion
 */
export function generatePlayedClipRect(
  progress: number,
  width: number,
  height: number
): SkPath {
  const path = Skia.Path.Make();
  const clipWidth = Math.max(0, Math.min(1, progress)) * width;

  path.addRect({
    x: 0,
    y: 0,
    width: clipWidth,
    height: height,
  });

  return path;
}

/**
 * Generate vertical bars instead of smooth waveform
 * More like traditional Serato visualization
 */
export function generateBarPaths(
  data: SpectralWaveformData,
  width: number,
  height: number,
  barSpacing: number = 0.2
): { bass: SkPath; mids: SkPath; highs: SkPath } {
  const { bands } = data;
  const sampleCount = bands.bass.length;
  const barWidth = (width / sampleCount) * (1 - barSpacing);
  const gap = (width / sampleCount) * barSpacing;
  const centerY = height / 2;
  const maxAmplitude = height / 2 * 0.9;

  const createBarPath = (values: number[]): SkPath => {
    const path = Skia.Path.Make();

    for (let i = 0; i < values.length; i++) {
      const x = i * (barWidth + gap);
      const amplitude = Math.max(0.02, values[i]) * maxAmplitude;

      // Draw bar as rectangle (mirrored)
      path.addRect({
        x,
        y: centerY - amplitude,
        width: barWidth,
        height: amplitude * 2,
      });
    }

    return path;
  };

  return {
    bass: createBarPath(bands.bass),
    mids: createBarPath(bands.mids),
    highs: createBarPath(bands.highs),
  };
}
