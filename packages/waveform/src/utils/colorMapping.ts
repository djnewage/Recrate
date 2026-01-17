import { WaveformColors, DEFAULT_COLORS } from '../types';

/**
 * Merge user colors with defaults
 */
export function mergeColors(colors?: Partial<WaveformColors>): WaveformColors {
  return {
    ...DEFAULT_COLORS,
    ...colors,
  };
}

/**
 * Convert hex color to RGBA with opacity
 */
export function hexToRgba(hex: string, opacity: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;

  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get color based on dominant frequency band
 * Useful for per-sample coloring based on spectral content
 */
export function getDominantColor(
  bass: number,
  mids: number,
  highs: number,
  colors: WaveformColors
): string {
  // Find dominant frequency band
  const max = Math.max(bass, mids, highs);

  if (max === 0) return colors.mids; // Default to mids if silent

  // Blend colors based on relative energy
  if (bass === max) return colors.bass;
  if (highs === max) return colors.highs;
  return colors.mids;
}

/**
 * Blend RGB colors based on frequency weights
 */
export function blendColors(
  bass: number,
  mids: number,
  highs: number,
  colors: WaveformColors
): string {
  const total = bass + mids + highs;
  if (total === 0) return colors.mids;

  // Normalize weights
  const bWeight = bass / total;
  const mWeight = mids / total;
  const hWeight = highs / total;

  // Parse colors
  const bRgb = hexToRgb(colors.bass);
  const mRgb = hexToRgb(colors.mids);
  const hRgb = hexToRgb(colors.highs);

  // Blend
  const r = Math.round(bRgb.r * bWeight + mRgb.r * mWeight + hRgb.r * hWeight);
  const g = Math.round(bRgb.g * bWeight + mRgb.g * mWeight + hRgb.g * hWeight);
  const b = Math.round(bRgb.b * bWeight + mRgb.b * mWeight + hRgb.b * hWeight);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };

  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}
