const express = require('express');
const logger = require('../../utils/logger');
const { readBeatGrid } = require('../../audio/serato-beatgrid');

/**
 * Create beat grid routes.
 * @param {Object} parser - Serato parser (provides getTrackById → filePath/duration)
 */
function createBeatgridRoutes(parser = null) {
  const router = express.Router();

  /**
   * GET /api/beatgrid/:trackId
   * Returns the track's Serato beat grid expanded to beat timestamps.
   * Response: { trackId, bpm: number|null, firstBeatSec: number|null, beats: number[] }
   * Tracks with no Serato beat grid (or unsupported formats) return { beats: [] }.
   */
  router.get('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;
      const empty = { trackId, bpm: null, firstBeatSec: null, beats: [] };

      if (!parser) return res.json(empty);
      const track = await parser.getTrackById(trackId);
      if (!track || !track.filePath) return res.json(empty);

      const duration = Number(track.duration) || 0;
      const grid = await readBeatGrid(track.filePath, duration);
      res.json({ trackId, ...grid });
    } catch (error) {
      logger.error('[BEATGRID] Error getting beat grid:', error);
      res.status(500).json({ error: 'Failed to read beat grid' });
    }
  });

  return router;
}

module.exports = createBeatgridRoutes;
