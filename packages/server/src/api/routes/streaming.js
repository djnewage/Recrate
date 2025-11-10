const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create streaming routes
 */
function createStreamingRoutes(streamer) {
  const router = express.Router();

  /**
   * GET /api/stream/:trackId
   * Stream audio file with range support
   */
  router.get('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;
      await streamer.streamTrack(trackId, req, res);
    } catch (error) {
      logger.error('Error in streaming route:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream track' });
      }
    }
  });

  return router;
}

/**
 * Create artwork routes
 */
function createArtworkRoutes(streamer) {
  const router = express.Router();

  /**
   * GET /api/artwork/:trackId
   * Get track artwork
   */
  router.get('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;
      await streamer.getArtwork(trackId, res);
    } catch (error) {
      logger.error('Error in artwork route:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to get artwork' });
      }
    }
  });

  return router;
}

module.exports = {
  createStreamingRoutes,
  createArtworkRoutes,
};
