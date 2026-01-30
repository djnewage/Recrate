const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create waveform routes
 * @param {WaveformGenerator} waveformGenerator - Basic peak waveform generator
 * @param {SpectralAnalyzer} spectralAnalyzer - FFT-based spectral analyzer (optional)
 */
function createWaveformRoutes(waveformGenerator, spectralAnalyzer = null) {
  const router = express.Router();

  /**
   * GET /api/waveform/:trackId
   * Get waveform peak data for visualization
   *
   * Query params:
   *   - peakCount: number of peaks to generate (default: 150)
   *
   * Response:
   *   {
   *     trackId: string,
   *     peaks: number[],  // Normalized 0-1 values
   *     duration: number, // Track duration in seconds
   *     peakCount: number
   *   }
   */
  router.get('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;
      const peakCount = parseInt(req.query.peakCount) || 150;

      // Validate peakCount
      if (peakCount < 10 || peakCount > 500) {
        return res.status(400).json({
          error: 'Invalid peakCount',
          message: 'peakCount must be between 10 and 500'
        });
      }

      // Check if FFmpeg is available
      const ffmpegAvailable = await waveformGenerator.checkFFmpeg();
      if (!ffmpegAvailable) {
        logger.error('FFmpeg not found - waveform generation unavailable');
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'FFmpeg is required for waveform generation. Please install FFmpeg.'
        });
      }

      const waveformData = await waveformGenerator.getWaveform(trackId, peakCount);

      if (!waveformData) {
        return res.status(404).json({ error: 'Track not found or waveform generation failed' });
      }

      // Set cache headers - waveforms rarely change
      res.set({
        'Cache-Control': 'public, max-age=86400, immutable', // 24 hours
        'ETag': `"waveform-${trackId}-${waveformData.peakCount}"`,
      });

      res.json(waveformData);
    } catch (error) {
      logger.error('Error in waveform route:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to get waveform' });
      }
    }
  });

  /**
   * DELETE /api/waveform/:trackId/cache
   * Clear cached waveform for a track
   */
  router.delete('/:trackId/cache', async (req, res) => {
    try {
      const { trackId } = req.params;
      const deleted = await waveformGenerator.clearCache(trackId);

      res.json({
        success: true,
        message: deleted ? 'Cache cleared' : 'No cache found'
      });
    } catch (error) {
      logger.error('Error clearing waveform cache:', error);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  /**
   * GET /api/waveform/:trackId/spectral
   * Get frequency-band spectral data for colored waveform visualization
   *
   * Query params:
   *   - samples: number of samples to generate (default: 800)
   *
   * Response:
   *   {
   *     trackId: string,
   *     duration: number,
   *     sampleCount: number,
   *     bands: {
   *       bass: number[],   // 20-250 Hz (Red)
   *       mids: number[],   // 250-4000 Hz (Green)
   *       highs: number[]   // 4000-20000 Hz (Blue)
   *     },
   *     peaks: number[]     // Combined amplitude
   *   }
   */
  router.get('/:trackId/spectral', async (req, res) => {
    try {
      // Check if spectral analyzer is available
      if (!spectralAnalyzer) {
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Spectral analysis is not enabled on this server'
        });
      }

      const { trackId } = req.params;
      const sampleCount = parseInt(req.query.samples) || 800;

      // Validate sampleCount
      if (sampleCount < 100 || sampleCount > 2000) {
        return res.status(400).json({
          error: 'Invalid samples',
          message: 'samples must be between 100 and 2000'
        });
      }

      // Check if FFmpeg is available
      const ffmpegAvailable = await spectralAnalyzer.checkFFmpeg();
      if (!ffmpegAvailable) {
        logger.error('FFmpeg not found - spectral analysis unavailable');
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'FFmpeg is required for spectral analysis. Please install FFmpeg.'
        });
      }

      logger.debug(`Getting spectral data for track ${trackId} with ${sampleCount} samples`);
      const spectralData = await spectralAnalyzer.getSpectralData(trackId, sampleCount);

      if (!spectralData) {
        return res.status(404).json({
          error: 'Track not found or spectral analysis failed'
        });
      }

      // Set cache headers - spectral data rarely changes
      res.set({
        'Cache-Control': 'public, max-age=86400, immutable', // 24 hours
        'ETag': `"spectral-${trackId}-${spectralData.sampleCount}"`,
      });

      res.json(spectralData);
    } catch (error) {
      logger.error('Error in spectral route:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to get spectral data' });
      }
    }
  });

  return router;
}

module.exports = { createWaveformRoutes };
