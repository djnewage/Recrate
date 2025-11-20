const express = require('express');
const logger = require('../../utils/logger');
const config = require('../../utils/config');
const volumeDiscovery = require('../../utils/volumeDiscovery');
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
          musicPath: config.serato.musicPaths ? config.serato.musicPaths[0] : null,
          musicPaths: config.serato.musicPaths || [],
          seratoPath: config.serato.path,
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
   * Note: Requires server restart to fully apply changes
   */
  router.post('/', async (req, res) => {
    try {
      const { musicPath, musicPaths, seratoPath } = req.body;

      // Validate and update music paths
      if (musicPaths) {
        // Validate all paths exist
        for (const mp of musicPaths) {
          if (!fs.existsSync(mp)) {
            return res.status(400).json({ error: `Music path does not exist: ${mp}` });
          }
        }
        config.serato.musicPaths = musicPaths;
        logger.info(`Music paths updated to: ${musicPaths.join(', ')}`);
      } else if (musicPath) {
        // Backwards compatibility: single musicPath
        if (!fs.existsSync(musicPath)) {
          return res.status(400).json({ error: 'Music path does not exist' });
        }
        config.serato.musicPaths = [musicPath];
        logger.info(`Music path updated to: ${musicPath}`);
      }

      if (seratoPath) {
        if (!fs.existsSync(seratoPath)) {
          return res.status(400).json({ error: 'Serato path does not exist' });
        }
        config.serato.path = seratoPath;
        logger.info(`Serato path updated to: ${seratoPath}`);
      }

      // Clear cache to force reload
      parser.cache.clear();
      logger.success('Library cache cleared - will reload on next request');
      logger.warn('Note: Server restart required for music paths to fully apply');

      res.json({
        success: true,
        message: 'Configuration updated successfully. Restart server to apply changes.',
        requiresRestart: true,
        config: {
          musicPaths: config.serato.musicPaths,
          seratoPath: config.serato.path,
        },
      });
    } catch (error) {
      logger.error('Error updating config:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  /**
   * GET /api/config/volumes
   * Get all mounted volumes
   */
  router.get('/volumes', async (req, res) => {
    try {
      const volumes = await volumeDiscovery.getMountedVolumes();
      res.json({ volumes });
    } catch (error) {
      logger.error('Error getting volumes:', error);
      res.status(500).json({ error: 'Failed to get mounted volumes' });
    }
  });

  /**
   * GET /api/config/serato-installations
   * Find all Serato installations across all volumes
   */
  router.get('/serato-installations', async (req, res) => {
    try {
      logger.info('Scanning for Serato installations...');
      const installations = await volumeDiscovery.findSeratoInstallations();

      // Mark current installation as active
      const currentSeratoPath = config.serato.path;
      const installationsWithStatus = installations.map(inst => ({
        ...inst,
        isActive: inst.seratoPath === currentSeratoPath,
        lastUsed: inst.seratoPath === currentSeratoPath ? new Date().toISOString() : inst.lastModified?.toISOString(),
      }));

      res.json({
        installations: installationsWithStatus,
        currentSeratoPath,
      });
    } catch (error) {
      logger.error('Error finding Serato installations:', error);
      res.status(500).json({ error: 'Failed to find Serato installations' });
    }
  });

  /**
   * POST /api/config/validate-path
   * Validate a Serato path
   */
  router.post('/validate-path', async (req, res) => {
    try {
      const { seratoPath } = req.body;

      if (!seratoPath) {
        return res.status(400).json({ error: 'seratoPath is required' });
      }

      const validation = await volumeDiscovery.validateSeratoPath(seratoPath);

      res.json({
        valid: validation.valid,
        seratoPath,
        ...validation,
      });
    } catch (error) {
      logger.error('Error validating path:', error);
      res.status(500).json({ error: 'Failed to validate path' });
    }
  });

  return router;
}

module.exports = createConfigRoutes;
