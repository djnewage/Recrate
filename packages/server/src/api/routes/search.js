const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create search routes
 */
function createSearchRoutes(parser) {
  const router = express.Router();

  /**
   * GET /api/search
   * Search tracks by query
   * Query params:
   *   - q (required): search query
   *   - field (optional): specific field to search (title, artist, album, all)
   *   - limit (optional): max results to return
   */
  router.get('/', async (req, res) => {
    try {
      const { q, field = 'all', limit = 100 } = req.query;

      // Validate query parameter
      if (!q) {
        return res.status(400).json({
          error: 'Query parameter "q" is required',
        });
      }

      // Validate field parameter
      const validFields = ['all', 'title', 'artist', 'album'];
      if (!validFields.includes(field)) {
        return res.status(400).json({
          error: `Invalid field. Must be one of: ${validFields.join(', ')}`,
        });
      }

      // Perform search
      const results = await parser.searchTracks(q, field);

      // Apply limit
      const limitedResults = results.slice(0, parseInt(limit, 10));

      res.json({
        query: q,
        field,
        results: limitedResults,
        total: results.length,
        returned: limitedResults.length,
      });
    } catch (error) {
      logger.error('Error searching tracks:', error);
      res.status(500).json({ error: 'Failed to search tracks' });
    }
  });

  return router;
}

module.exports = createSearchRoutes;
