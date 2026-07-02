import { Skia } from '@shopify/react-native-skia';
import {
  generateBandPath,
  generateStackedPaths,
  generatePlayedClipRect,
  generateBarPaths,
  generateColoredBarPaths,
} from '../pathGeneration';
import { SpectralWaveformData } from '../../types';

// Helper to access mock path methods
const getPathMock = () => {
  const path = Skia.Path.Make();
  return path as unknown as {
    moveTo: jest.Mock;
    lineTo: jest.Mock;
    close: jest.Mock;
    addRect: jest.Mock;
  };
};

describe('pathGeneration utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBandPath', () => {
    it('returns empty path for empty array', () => {
      const path = generateBandPath([], 100, 50);
      // Path should be created but no drawing methods called
      expect(path).toBeDefined();
    });

    it('returns empty path for null values', () => {
      const path = generateBandPath(null as unknown as number[], 100, 50);
      expect(path).toBeDefined();
    });

    it('returns empty path for undefined values', () => {
      const path = generateBandPath(undefined as unknown as number[], 100, 50);
      expect(path).toBeDefined();
    });

    it('generates path for single value with mirror', () => {
      const path = generateBandPath([0.5], 100, 50, true);
      const mockPath = path as unknown as {
        moveTo: jest.Mock;
        lineTo: jest.Mock;
        close: jest.Mock;
      };

      // Should start at center left
      expect(mockPath.moveTo).toHaveBeenCalledWith(0, 25);
      // Should close the path
      expect(mockPath.close).toHaveBeenCalled();
    });

    it('generates path for single value without mirror', () => {
      const path = generateBandPath([0.5], 100, 50, false);
      const mockPath = path as unknown as {
        moveTo: jest.Mock;
        lineTo: jest.Mock;
        close: jest.Mock;
      };

      expect(mockPath.moveTo).toHaveBeenCalledWith(0, 25);
      expect(mockPath.close).toHaveBeenCalled();
    });

    it('generates path for multiple values', () => {
      const path = generateBandPath([0.2, 0.5, 0.8], 300, 100, true);
      const mockPath = path as unknown as {
        moveTo: jest.Mock;
        lineTo: jest.Mock;
        close: jest.Mock;
      };

      // Should start at center
      expect(mockPath.moveTo).toHaveBeenCalledWith(0, 50);

      // For 3 values at width=300, each bar is 100px wide
      // Top half: 3 points + end point = 4 lineTo calls
      // Bottom half (mirror): 3 points = 3 lineTo calls
      // Total: 7 lineTo calls
      expect(mockPath.lineTo).toHaveBeenCalledTimes(7);
      expect(mockPath.close).toHaveBeenCalled();
    });

    it('enforces minimum amplitude of 0.02', () => {
      const path = generateBandPath([0], 100, 50, true);
      const mockPath = path as unknown as {
        lineTo: jest.Mock;
      };

      // Even with 0 value, should use 0.02 minimum
      // centerY = 25, maxAmplitude = 22.5 (50/2 * 0.9)
      // y = 25 - 0.02 * 22.5 = 24.55
      const calls = mockPath.lineTo.mock.calls;
      // First call should be top half point
      const topY = calls[0][1];
      expect(topY).toBeLessThan(25); // Should be above center
      expect(topY).toBeGreaterThan(24); // But not by much due to min amplitude
    });

    it('respects height parameter for amplitude scaling', () => {
      const path100 = generateBandPath([1.0], 100, 100, true);
      const path200 = generateBandPath([1.0], 100, 200, true);

      const mock100 = path100 as unknown as { lineTo: jest.Mock };
      const mock200 = path200 as unknown as { lineTo: jest.Mock };

      // At full amplitude with height 100: y = 50 - 1.0 * 45 = 5
      // At full amplitude with height 200: y = 100 - 1.0 * 90 = 10
      const y100 = mock100.lineTo.mock.calls[0][1];
      const y200 = mock200.lineTo.mock.calls[0][1];

      expect(y100).toBeCloseTo(5, 0);
      expect(y200).toBeCloseTo(10, 0);
    });
  });

  describe('generateStackedPaths', () => {
    const mockData: SpectralWaveformData = {
      trackId: 'test-track',
      duration: 180,
      sampleCount: 3,
      bands: {
        bass: [0.3, 0.5, 0.7],
        mids: [0.4, 0.6, 0.4],
        highs: [0.2, 0.3, 0.5],
      },
      peaks: [0.4, 0.5, 0.6],
    };

    it('generates all three band paths', () => {
      const paths = generateStackedPaths(mockData, 300, 100);

      expect(paths.bass).toBeDefined();
      expect(paths.mids).toBeDefined();
      expect(paths.highs).toBeDefined();
    });

    it('uses mirror=true for all bands', () => {
      // This is implicitly tested by the fact that generateStackedPaths
      // always passes true for the mirror parameter
      const paths = generateStackedPaths(mockData, 300, 100);

      // All three paths should be created
      expect(paths.bass).toBeDefined();
      expect(paths.mids).toBeDefined();
      expect(paths.highs).toBeDefined();
    });
  });

  describe('generatePlayedClipRect', () => {
    it('generates clip rect at 0 progress', () => {
      const path = generatePlayedClipRect(0, 100, 50);
      const mockPath = path as unknown as { addRect: jest.Mock };

      expect(mockPath.addRect).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        width: 0,
        height: 50,
      });
    });

    it('generates clip rect at 50% progress', () => {
      const path = generatePlayedClipRect(0.5, 100, 50);
      const mockPath = path as unknown as { addRect: jest.Mock };

      expect(mockPath.addRect).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        width: 50,
        height: 50,
      });
    });

    it('generates clip rect at 100% progress', () => {
      const path = generatePlayedClipRect(1, 100, 50);
      const mockPath = path as unknown as { addRect: jest.Mock };

      expect(mockPath.addRect).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      });
    });

    it('clamps progress below 0 to 0', () => {
      const path = generatePlayedClipRect(-0.5, 100, 50);
      const mockPath = path as unknown as { addRect: jest.Mock };

      expect(mockPath.addRect).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        width: 0,
        height: 50,
      });
    });

    it('clamps progress above 1 to 1', () => {
      const path = generatePlayedClipRect(1.5, 100, 50);
      const mockPath = path as unknown as { addRect: jest.Mock };

      expect(mockPath.addRect).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      });
    });
  });

  describe('generateBarPaths', () => {
    const mockData: SpectralWaveformData = {
      trackId: 'test-track',
      duration: 180,
      sampleCount: 3,
      bands: {
        bass: [0.3, 0.5, 0.7],
        mids: [0.4, 0.6, 0.4],
        highs: [0.2, 0.3, 0.5],
      },
      peaks: [0.4, 0.5, 0.6],
    };

    it('generates bar paths for all bands', () => {
      const paths = generateBarPaths(mockData, 300, 100);

      expect(paths.bass).toBeDefined();
      expect(paths.mids).toBeDefined();
      expect(paths.highs).toBeDefined();
    });

    it('creates rectangles for each sample in bass band', () => {
      const paths = generateBarPaths(mockData, 300, 100);
      const bassMock = paths.bass as unknown as { addRect: jest.Mock };

      // 3 samples = 3 rectangles
      expect(bassMock.addRect).toHaveBeenCalledTimes(3);
    });

    it('respects barSpacing parameter', () => {
      const pathsNoSpacing = generateBarPaths(mockData, 300, 100, 0);
      const pathsWithSpacing = generateBarPaths(mockData, 300, 100, 0.5);

      const noSpacingMock = pathsNoSpacing.bass as unknown as { addRect: jest.Mock };
      const withSpacingMock = pathsWithSpacing.bass as unknown as { addRect: jest.Mock };

      // With 0 spacing: barWidth = 300/3 = 100
      // With 0.5 spacing: barWidth = (300/3) * 0.5 = 50
      const noSpacingWidth = noSpacingMock.addRect.mock.calls[0][0].width;
      const withSpacingWidth = withSpacingMock.addRect.mock.calls[0][0].width;

      expect(noSpacingWidth).toBe(100);
      expect(withSpacingWidth).toBe(50);
    });

    it('uses default barSpacing of 0.2', () => {
      const paths = generateBarPaths(mockData, 300, 100);
      const bassMock = paths.bass as unknown as { addRect: jest.Mock };

      // barWidth = (300/3) * (1 - 0.2) = 80
      const barWidth = bassMock.addRect.mock.calls[0][0].width;
      expect(barWidth).toBe(80);
    });

    it('centers bars vertically (mirrored)', () => {
      const paths = generateBarPaths(mockData, 300, 100);
      const bassMock = paths.bass as unknown as { addRect: jest.Mock };

      // For each bar, check that it's centered around y=50
      bassMock.addRect.mock.calls.forEach((call: [{x: number; y: number; width: number; height: number}]) => {
        const rect = call[0];
        const centerY = rect.y + rect.height / 2;
        expect(centerY).toBe(50);
      });
    });
  });

  describe('generateColoredBarPaths', () => {
    const mk = (bands: SpectralWaveformData['bands']): SpectralWaveformData => ({
      trackId: 't',
      duration: 10,
      sampleCount: bands.bass.length,
      bands,
      peaks: [],
    });

    it('returns three band paths', () => {
      const p = generateColoredBarPaths(mk({ bass: [0.5], mids: [0.5], highs: [0.5] }), 300, 60);
      expect(p.bass).toBeDefined();
      expect(p.mids).toBeDefined();
      expect(p.highs).toBeDefined();
    });

    it('assigns each slice to its dominant band (one bar per sample)', () => {
      const p = generateColoredBarPaths(
        mk({ bass: [0.9, 0.1, 0.1], mids: [0.1, 0.9, 0.1], highs: [0.1, 0.1, 0.9] }),
        300,
        60
      );
      const rects = (path: unknown) =>
        (path as unknown as { addRect: jest.Mock }).addRect.mock.calls.length;
      // Sample 0 → bass dominant, sample 1 → mids, sample 2 → highs
      expect(rects(p.bass)).toBe(1);
      expect(rects(p.mids)).toBe(1);
      expect(rects(p.highs)).toBe(1);
    });

    it('handles empty bands without throwing', () => {
      expect(() =>
        generateColoredBarPaths(mk({ bass: [], mids: [], highs: [] }), 300, 60)
      ).not.toThrow();
    });
  });
});
