import {
  mergeColors,
  hexToRgba,
  getDominantColor,
  blendColors,
} from '../colorMapping';
import { DEFAULT_COLORS, WaveformColors } from '../../types';

describe('colorMapping utilities', () => {
  describe('mergeColors', () => {
    it('returns default colors when no custom colors provided', () => {
      const result = mergeColors();
      expect(result).toEqual(DEFAULT_COLORS);
    });

    it('returns default colors when undefined is passed', () => {
      const result = mergeColors(undefined);
      expect(result).toEqual(DEFAULT_COLORS);
    });

    it('returns default colors when empty object is passed', () => {
      const result = mergeColors({});
      expect(result).toEqual(DEFAULT_COLORS);
    });

    it('overrides only specified colors', () => {
      const customColors = { bass: '#FF0000' };
      const result = mergeColors(customColors);

      expect(result.bass).toBe('#FF0000');
      expect(result.mids).toBe(DEFAULT_COLORS.mids);
      expect(result.highs).toBe(DEFAULT_COLORS.highs);
      expect(result.playhead).toBe(DEFAULT_COLORS.playhead);
    });

    it('handles partial override of multiple colors', () => {
      const customColors = {
        bass: '#111111',
        highs: '#222222',
      };
      const result = mergeColors(customColors);

      expect(result.bass).toBe('#111111');
      expect(result.mids).toBe(DEFAULT_COLORS.mids);
      expect(result.highs).toBe('#222222');
      expect(result.playhead).toBe(DEFAULT_COLORS.playhead);
    });

    it('handles full override of all colors', () => {
      const customColors: WaveformColors = {
        bass: '#111111',
        mids: '#222222',
        highs: '#333333',
        playhead: '#444444',
      };
      const result = mergeColors(customColors);

      expect(result).toEqual(customColors);
    });
  });

  describe('hexToRgba', () => {
    it('converts 6-digit hex to rgba with full opacity', () => {
      const result = hexToRgba('#FF0000', 1);
      expect(result).toBe('rgba(255, 0, 0, 1)');
    });

    it('converts 6-digit hex to rgba with partial opacity', () => {
      const result = hexToRgba('#00FF00', 0.5);
      expect(result).toBe('rgba(0, 255, 0, 0.5)');
    });

    it('converts hex without hash prefix', () => {
      const result = hexToRgba('0000FF', 1);
      expect(result).toBe('rgba(0, 0, 255, 1)');
    });

    it('handles mixed case hex values', () => {
      const result = hexToRgba('#AbCdEf', 1);
      expect(result).toBe('rgba(171, 205, 239, 1)');
    });

    it('handles zero opacity', () => {
      const result = hexToRgba('#FFFFFF', 0);
      expect(result).toBe('rgba(255, 255, 255, 0)');
    });

    it('returns original value for invalid hex (3-digit)', () => {
      // The current implementation only handles 6-digit hex
      const result = hexToRgba('#F00', 1);
      expect(result).toBe('#F00');
    });

    it('returns original value for invalid format', () => {
      const result = hexToRgba('not-a-color', 1);
      expect(result).toBe('not-a-color');
    });

    it('returns original value for rgb() format', () => {
      const result = hexToRgba('rgb(255, 0, 0)', 1);
      expect(result).toBe('rgb(255, 0, 0)');
    });
  });

  describe('getDominantColor', () => {
    const colors: WaveformColors = {
      bass: '#FF0000',
      mids: '#00FF00',
      highs: '#0000FF',
      playhead: '#FFFFFF',
    };

    it('returns bass color when bass is dominant', () => {
      const result = getDominantColor(0.8, 0.3, 0.2, colors);
      expect(result).toBe(colors.bass);
    });

    it('returns mids color when mids is dominant', () => {
      const result = getDominantColor(0.2, 0.8, 0.3, colors);
      expect(result).toBe(colors.mids);
    });

    it('returns highs color when highs is dominant', () => {
      const result = getDominantColor(0.2, 0.3, 0.8, colors);
      expect(result).toBe(colors.highs);
    });

    it('returns mids color when all values are zero (silent)', () => {
      const result = getDominantColor(0, 0, 0, colors);
      expect(result).toBe(colors.mids);
    });

    it('returns bass color when bass ties with mids (bass checked first)', () => {
      const result = getDominantColor(0.5, 0.5, 0.2, colors);
      expect(result).toBe(colors.bass);
    });

    it('returns bass color when bass ties with highs', () => {
      const result = getDominantColor(0.5, 0.2, 0.5, colors);
      expect(result).toBe(colors.bass);
    });

    it('returns highs color when mids ties with highs (highs checked before mids fallback)', () => {
      const result = getDominantColor(0.2, 0.5, 0.5, colors);
      expect(result).toBe(colors.highs);
    });

    it('returns bass color when all values are equal', () => {
      const result = getDominantColor(0.5, 0.5, 0.5, colors);
      expect(result).toBe(colors.bass);
    });

    it('handles very small values', () => {
      const result = getDominantColor(0.001, 0.0001, 0.00001, colors);
      expect(result).toBe(colors.bass);
    });

    it('handles values at maximum (1.0)', () => {
      const result = getDominantColor(0.9, 1.0, 0.8, colors);
      expect(result).toBe(colors.mids);
    });
  });

  describe('blendColors', () => {
    const colors: WaveformColors = {
      bass: '#FF0000',   // Pure red (255, 0, 0)
      mids: '#00FF00',   // Pure green (0, 255, 0)
      highs: '#0000FF',  // Pure blue (0, 0, 255)
      playhead: '#FFFFFF',
    };

    it('returns mids color when all weights are zero', () => {
      const result = blendColors(0, 0, 0, colors);
      expect(result).toBe(colors.mids);
    });

    it('returns pure bass color when only bass has weight', () => {
      const result = blendColors(1, 0, 0, colors);
      expect(result).toBe('rgb(255, 0, 0)');
    });

    it('returns pure mids color when only mids has weight', () => {
      const result = blendColors(0, 1, 0, colors);
      expect(result).toBe('rgb(0, 255, 0)');
    });

    it('returns pure highs color when only highs has weight', () => {
      const result = blendColors(0, 0, 1, colors);
      expect(result).toBe('rgb(0, 0, 255)');
    });

    it('blends colors equally when weights are equal', () => {
      const result = blendColors(1, 1, 1, colors);
      // Equal blend of red, green, blue: (255/3, 255/3, 255/3) ≈ (85, 85, 85)
      expect(result).toBe('rgb(85, 85, 85)');
    });

    it('blends bass and mids equally', () => {
      const result = blendColors(1, 1, 0, colors);
      // Equal blend of red and green: (127.5, 127.5, 0) → (128, 128, 0)
      expect(result).toBe('rgb(128, 128, 0)');
    });

    it('blends with 2:1 ratio bass to mids', () => {
      const result = blendColors(2, 1, 0, colors);
      // 2/3 red + 1/3 green: (170, 85, 0)
      expect(result).toBe('rgb(170, 85, 0)');
    });

    it('handles non-integer weights', () => {
      const result = blendColors(0.5, 0.3, 0.2, colors);
      // Normalized: 0.5, 0.3, 0.2 (already sums to 1.0)
      // r = 255 * 0.5 = 127.5 → 128
      // g = 255 * 0.3 = 76.5 → 77
      // b = 255 * 0.2 = 51 → 51
      expect(result).toBe('rgb(128, 77, 51)');
    });

    it('handles very small weights', () => {
      const result = blendColors(0.001, 0.001, 0.001, colors);
      // Should still blend correctly
      expect(result).toBe('rgb(85, 85, 85)');
    });

    it('handles invalid hex colors gracefully (uses 0,0,0 as fallback)', () => {
      const invalidColors: WaveformColors = {
        bass: 'invalid',
        mids: 'also-invalid',
        highs: '#0000FF', // This one is valid
        playhead: '#FFFFFF',
      };
      const result = blendColors(1, 1, 1, invalidColors);
      // invalid hex parses to (0,0,0), so:
      // bass (0,0,0) + mids (0,0,0) + highs (0,0,255) = (0,0,85)
      expect(result).toBe('rgb(0, 0, 85)');
    });
  });
});
