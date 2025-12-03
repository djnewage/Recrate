const express = require('express');
const logger = require('../../utils/logger');

/**
 * Create crate routes
 */
function createCrateRoutes(parser, writer = null) {
  const router = express.Router();

  /**
   * POST /api/crates/refresh
   * Force refresh crate cache (useful when Serato modifies crates externally)
   */
  router.post('/refresh', async (req, res) => {
    try {
      logger.info('[CRATE REFRESH] Invalidating crate cache...');
      parser.invalidateCache('crates-list');

      // Also invalidate individual crate caches
      const crates = await parser.getAllCrates();
      for (const crate of crates) {
        parser.invalidateCache(`crate-${crate.id}`);
      }

      logger.info(`[CRATE REFRESH] Cache invalidated for ${crates.length} crates`);

      res.json({
        message: 'Crate cache refreshed successfully',
        cratesRefreshed: crates.length,
      });
    } catch (error) {
      logger.error('Error refreshing crate cache:', error);
      res.status(500).json({ error: 'Failed to refresh crate cache' });
    }
  });

  /**
   * GET /api/crates
   * List all crates (metadata only)
   */
  router.get('/', async (req, res) => {
    try {
      const crates = await parser.getAllCrates();

      res.json({
        crates,
        total: crates.length,
      });
    } catch (error) {
      logger.error('Error fetching crates:', error);
      res.status(500).json({ error: 'Failed to fetch crates' });
    }
  });

  /**
   * GET /api/crates/:crateId
   * Get crate details with tracks
   */
  router.get('/:crateId', async (req, res) => {
    try {
      const { crateId } = req.params;

      const crate = await parser.parseCrate(crateId);

      res.json({ crate });
    } catch (error) {
      if (error.name === 'CrateNotFoundError') {
        return res.status(404).json({ error: 'Crate not found' });
      }

      logger.error('Error fetching crate:', error);
      res.status(500).json({ error: 'Failed to fetch crate' });
    }
  });

  /**
   * POST /api/crates
   * Create a new crate
   */
  router.post('/', async (req, res) => {
    try {
      if (!writer) {
        return res.status(501).json({
          error: 'Crate creation not supported (read-only mode)',
        });
      }

      const { name, color = '#FF0000' } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Crate name is required' });
      }

      const crate = await writer.createCrate(name, color);
      parser.invalidateCache(); // Clear cache

      res.status(201).json({
        message: 'Crate created successfully',
        crate,
      });
    } catch (error) {
      if (error.name === 'CrateExistsError') {
        return res.status(409).json({ error: 'Crate already exists' });
      }

      logger.error('Error creating crate:', error);
      res.status(500).json({ error: 'Failed to create crate' });
    }
  });

  /**
   * POST /api/crates/:crateId/tracks
   * Add tracks to a crate
   */
  router.post('/:crateId/tracks', async (req, res) => {
    try {
      if (!writer) {
        return res.status(501).json({
          error: 'Crate modification not supported (read-only mode)',
        });
      }

      const { crateId } = req.params;
      const { trackIds } = req.body;

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        return res.status(400).json({ error: 'trackIds array is required' });
      }

      await writer.addTracksToCrate(crateId, trackIds);
      parser.invalidateCache(`crate-${crateId}`);

      res.json({
        message: 'Tracks added successfully',
        crateId,
        tracksAdded: trackIds.length,
      });
    } catch (error) {
      if (error.name === 'CrateNotFoundError') {
        return res.status(404).json({ error: 'Crate not found' });
      }

      logger.error('Error adding tracks to crate:', error);
      res.status(500).json({ error: 'Failed to add tracks' });
    }
  });

  /**
   * DELETE /api/crates/:crateId/tracks/:trackId
   * Remove a track from a crate
   */
  router.delete('/:crateId/tracks/:trackId', async (req, res) => {
    try {
      if (!writer) {
        return res.status(501).json({
          error: 'Crate modification not supported (read-only mode)',
        });
      }

      const { crateId, trackId } = req.params;

      await writer.removeTrackFromCrate(crateId, trackId);
      parser.invalidateCache(`crate-${crateId}`);

      res.json({
        message: 'Track removed successfully',
        crateId,
        trackId,
      });
    } catch (error) {
      if (error.name === 'CrateNotFoundError') {
        return res.status(404).json({ error: 'Crate not found' });
      }

      logger.error('Error removing track from crate:', error);
      res.status(500).json({ error: 'Failed to remove track' });
    }
  });

  /**
   * DELETE /api/crates/:crateId
   * Delete a crate
   */
  router.delete('/:crateId', async (req, res) => {
    try {
      if (!writer) {
        return res.status(501).json({
          error: 'Crate deletion not supported (read-only mode)',
        });
      }

      const { crateId } = req.params;

      await writer.deleteCrate(crateId);
      parser.invalidateCache(); // Clear all cache

      res.json({
        message: 'Crate deleted successfully',
        crateId,
      });
    } catch (error) {
      if (error.name === 'CrateNotFoundError') {
        return res.status(404).json({ error: 'Crate not found' });
      }

      logger.error('Error deleting crate:', error);
      res.status(500).json({ error: 'Failed to delete crate' });
    }
  });

  return router;
}

module.exports = createCrateRoutes;
