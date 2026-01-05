const express = require('express');
const logger = require('../../utils/logger');
const config = require('../../utils/config');
const volumeDiscovery = require('../../utils/volumeDiscovery');
const fs = require('fs');
const path = require('path');

/**
 * Create config routes
 * @param {Object} parser - The parser instance
 * @param {Function} switchLibraryFn - Optional function to switch libraries dynamically
 */
function createConfigRoutes(parser, switchLibraryFn = null) {
  const router = express.Router();

  /**
   * GET /api/config
   * Get current configuration
   */
  router.get('/', async (req, res) => {
    try {
      res.json({
        config: {
          // New format
          libraryType: config.library.type,
          libraryPath: config.library.path,
          musicPath: config.library.musicPaths ? config.library.musicPaths[0] : null,
          musicPaths: config.library.musicPaths || [],
          // Legacy format (for backward compatibility)
          seratoPath: config.library.path,
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
   * Supports hot-switching libraries without server restart
   */
  router.post('/', async (req, res) => {
    try {
      const { musicPath, musicPaths, libraryPath, libraryType, seratoPath } = req.body;

      logger.info(`[CONFIG] Received update request:`);
      logger.info(`[CONFIG]   libraryType: ${libraryType}`);
      logger.info(`[CONFIG]   libraryPath: ${libraryPath}`);
      logger.info(`[CONFIG]   seratoPath: ${seratoPath}`);
      logger.info(`[CONFIG]   Current type: ${config.library.type}`);
      logger.info(`[CONFIG]   Current path: ${config.library.path}`);
      logger.info(`[CONFIG]   switchLibraryFn available: ${!!switchLibraryFn}`);

      // Validate music paths
      const newMusicPaths = musicPaths || (musicPath ? [musicPath] : null);
      if (newMusicPaths) {
        for (const mp of newMusicPaths) {
          if (!fs.existsSync(mp)) {
            return res.status(400).json({ error: `Music path does not exist: ${mp}` });
          }
        }
      }

      // Handle library path (new format or legacy seratoPath)
      const newLibraryPath = libraryPath || seratoPath;
      if (newLibraryPath && !fs.existsSync(newLibraryPath)) {
        return res.status(400).json({ error: 'Library path does not exist' });
      }

      // Determine the new library type
      const newLibraryType = libraryType || config.library.type;
      const finalLibraryPath = newLibraryPath || config.library.path;
      const finalMusicPaths = newMusicPaths || config.library.musicPaths;

      // Check if we need to switch libraries
      const needsSwitch = switchLibraryFn && (
        newLibraryType !== config.library.type ||
        finalLibraryPath !== config.library.path
      );

      if (needsSwitch) {
        // Hot-switch to new library
        logger.info(`Hot-switching library: ${config.library.type} -> ${newLibraryType}`);
        try {
          const result = await switchLibraryFn(newLibraryType, finalLibraryPath, finalMusicPaths);

          res.json({
            success: true,
            message: `Switched to ${newLibraryType} library successfully`,
            requiresRestart: false,
            config: {
              libraryType: newLibraryType,
              libraryPath: finalLibraryPath,
              musicPaths: finalMusicPaths,
              hasWriter: result.hasWriter,
              // Legacy
              seratoPath: finalLibraryPath,
            },
          });
        } catch (switchError) {
          logger.error('Failed to switch library:', switchError);
          return res.status(500).json({
            error: `Failed to switch library: ${switchError.message}`,
            details: switchError.message
          });
        }
      } else {
        // Just update music paths or clear cache
        if (newMusicPaths) {
          config.library.musicPaths = newMusicPaths;
          logger.info(`Music paths updated to: ${newMusicPaths.join(', ')}`);
        }

        // Clear cache to force reload
        parser.cache.clear();
        logger.success('Library cache cleared');

        res.json({
          success: true,
          message: 'Configuration updated successfully',
          requiresRestart: false,
          config: {
            libraryType: config.library.type,
            libraryPath: config.library.path,
            musicPaths: config.library.musicPaths,
            // Legacy
            seratoPath: config.library.path,
          },
        });
      }
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
   * GET /api/config/dj-installations
   * Find all DJ software installations across all volumes
   */
  router.get('/dj-installations', async (req, res) => {
    try {
      logger.info('Scanning for DJ software installations...');
      const installations = await volumeDiscovery.findDJInstallations();

      // Mark current installation as active
      const currentLibraryPath = config.library.path;
      const currentLibraryType = config.library.type;
      const installationsWithStatus = installations.map(inst => ({
        ...inst,
        // Include both new and legacy path keys
        libraryPath: inst.libraryPath || inst.seratoPath,
        isActive: (inst.libraryPath || inst.seratoPath) === currentLibraryPath,
        lastUsed: (inst.libraryPath || inst.seratoPath) === currentLibraryPath ? new Date().toISOString() : inst.lastModified?.toISOString(),
      }));

      res.json({
        installations: installationsWithStatus,
        currentLibraryPath,
        currentLibraryType,
        // Legacy
        currentSeratoPath: currentLibraryPath,
      });
    } catch (error) {
      logger.error('Error finding DJ installations:', error);
      res.status(500).json({ error: 'Failed to find DJ installations' });
    }
  });

  /**
   * GET /api/config/serato-installations
   * Find all Serato installations across all volumes
   * @deprecated Use /api/config/dj-installations instead
   */
  router.get('/serato-installations', async (req, res) => {
    try {
      logger.info('Scanning for DJ software installations (legacy endpoint)...');
      const installations = await volumeDiscovery.findDJInstallations();

      // Mark current installation as active
      const currentSeratoPath = config.library.path;
      const installationsWithStatus = installations.map(inst => ({
        ...inst,
        // Ensure legacy key is present
        seratoPath: inst.libraryPath || inst.seratoPath,
        isActive: (inst.libraryPath || inst.seratoPath) === currentSeratoPath,
        lastUsed: (inst.libraryPath || inst.seratoPath) === currentSeratoPath ? new Date().toISOString() : inst.lastModified?.toISOString(),
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
   * Validate a library path
   */
  router.post('/validate-path', async (req, res) => {
    try {
      const libraryPath = req.body.libraryPath || req.body.seratoPath;

      if (!libraryPath) {
        return res.status(400).json({ error: 'libraryPath is required' });
      }

      const validation = await volumeDiscovery.validateLibraryPath(libraryPath);

      res.json({
        valid: validation.valid,
        libraryPath,
        // Legacy
        seratoPath: libraryPath,
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
