const express = require('express');
const logger = require('../../utils/logger');

/**
 * Stats Routes - Provide library statistics for the desktop app
 */
function createStatsRoutes(parser) {
  const router = express.Router();

  // Cache stats to avoid recalculating on every request
  let cachedStats = {
    trackCount: 0,
    crateCount: 0,
    lastUpdate: Date.now()
  };

  /**
   * GET /api/stats
   * Get library statistics (track count, crate count, last update)
   */
  router.get('/', async (req, res) => {
    try {
      // Get current library data
      const library = await parser.getLibrary();
      const crates = await parser.getCrates();

      // Update cache
      cachedStats = {
        trackCount: library.length,
        crateCount: crates.length,
        lastUpdate: Date.now()
      };

      res.json(cachedStats);
    } catch (error) {
      logger.error('Failed to get stats:', error);

      // Return cached stats on error
      res.json(cachedStats);
    }
  });

  return router;
}

module.exports = createStatsRoutes;
