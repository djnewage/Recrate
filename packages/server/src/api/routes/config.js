const express = require('express');
const logger = require('../../utils/logger');
const config = require('../../utils/config');
const fs = require('fs');
const path = require('path');

/**
 * Create config routes
 */
function createConfigRoutes(parser) {
  const router = express.Router();

  /**
   * GET /api/config
   * Get current configuration
   */
  router.get('/', async (req, res) => {
    try {
      res.json({
        config: {
          musicPath: config.musicPath,
          seratoPath: config.seratoPath,
          port: config.server.port,
          host: config.server.host,
        },
      });
    } catch (error) {
      logger.error('Error fetching config:', error);
      res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  });

  /**
   * POST /api/config
   * Update configuration and reload library
   */
  router.post('/', async (req, res) => {
    try {
      const { musicPath, seratoPath } = req.body;

      // Validate paths exist
      if (musicPath) {
        if (!fs.existsSync(musicPath)) {
          return res.status(400).json({ error: 'Music path does not exist' });
        }
        config.musicPath = musicPath;
        logger.info(`Music path updated to: ${musicPath}`);
      }

      if (seratoPath) {
        if (!fs.existsSync(seratoPath)) {
          return res.status(400).json({ error: 'Serato path does not exist' });
        }
        config.seratoPath = seratoPath;
        logger.info(`Serato path updated to: ${seratoPath}`);
      }

      // Clear cache to force reload
      parser.cache.clear();
      logger.success('Library cache cleared - will reload on next request');

      res.json({
        success: true,
        message: 'Configuration updated successfully',
        config: {
          musicPath: config.musicPath,
          seratoPath: config.seratoPath,
        },
      });
    } catch (error) {
      logger.error('Error updating config:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  return router;
}

module.exports = createConfigRoutes;
