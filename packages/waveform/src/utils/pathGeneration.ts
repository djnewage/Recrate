import { Skia, SkPath } from '@shopify/react-native-skia';
import { SpectralWaveformData, WaveformColors } from '../types';
import { blendColors } from './colorMapping';

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

/** A colored bar path: one Skia path fill, all bars sharing one quantized blend color. */
export interface BlendedBarPath {
  path: SkPath;
  color: string; // "rgb(r, g, b)"
}

/**
 * Generate Serato-style colored bars where each vertical slice is a BLEND of all three
 * frequency bands (not just its single dominant band). Bar height comes from the loudest
 * band at that slice; the color is `blendColors(bass, mids, highs)`, so slices span the
 * full spectrum (reds → oranges → yellows → greens → blues) like Serato's overview,
 * instead of snapping to one of three fixed band colors.
 *
 * To keep draw calls low, bars are grouped into a small number of QUANTIZED color buckets
 * (each RGB channel rounded to the nearest `quant`), so the whole waveform paints in a few
 * dozen path fills rather than one component per sample. Works at any width (pass
 * totalWaveformWidth for the scrolling waveform).
 */
export function generateBlendedBarPaths(
  data: SpectralWaveformData,
  width: number,
  height: number,
  colors: WaveformColors,
  barSpacing: number = 0.2
): BlendedBarPath[] {
  const { bands } = data;
  const n = Math.min(bands.bass.length, bands.mids.length, bands.highs.length);
  const slot = width / Math.max(1, n);
  const barWidth = slot * (1 - barSpacing);
  const gap = slot * barSpacing;
  const centerY = height / 2;
  const maxAmplitude = (height / 2) * 0.9;
  const quant = 24; // round each RGB channel to nearest 24 → at most a few dozen buckets

  // One reusable path per quantized color bucket keeps the total number of fills small.
  const buckets = new Map<string, SkPath>();

  for (let i = 0; i < n; i++) {
    const b = bands.bass[i] || 0;
    const m = bands.mids[i] || 0;
    const h = bands.highs[i] || 0;
    const peak = Math.max(0.02, b, m, h); // loudest band drives bar height
    const color = quantizeRgb(blendColors(b, m, h, colors), quant);

    let path = buckets.get(color);
    if (!path) {
      path = Skia.Path.Make();
      buckets.set(color, path);
    }
    const amplitude = peak * maxAmplitude;
    const x = i * (barWidth + gap);
    path.addRect({ x, y: centerY - amplitude, width: barWidth, height: amplitude * 2 });
  }

  return Array.from(buckets.entries()).map(([color, path]) => ({ path, color }));
}

/** Round each channel of an "rgb(r, g, b)" string to the nearest `step` (for color bucketing). */
function quantizeRgb(rgb: string, step: number): string {
  const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
  if (!match) return rgb;
  const q = (v: string) => Math.min(255, Math.round(parseInt(v, 10) / step) * step);
  return `rgb(${q(match[1])}, ${q(match[2])}, ${q(match[3])})`;
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
