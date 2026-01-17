const express = require('express');
const db = require('../../utils/db');
const logger = require('../../utils/logger');
const { SeratoFileWriter } = require('../../audio/serato-file-writer');
const { hexToRgb } = require('../../audio/serato-markers');

/**
 * Cue point colors (Serato-inspired, fixed per bank)
 */
const CUE_COLORS = {
  1: '#EF4444', // Red
  2: '#F97316', // Orange
  3: '#EAB308', // Yellow
  4: '#22C55E', // Green
  5: '#06B6D4', // Cyan
  6: '#3B82F6', // Blue
  7: '#A855F7', // Purple
  8: '#EC4899', // Pink
};

/**
 * Create cue points routes
 * @param {Object} parser - Serato parser instance for accessing track data
 * @returns {express.Router}
 */
function createCuePointsRoutes(parser = null) {
  const router = express.Router();
  const seratoWriter = new SeratoFileWriter();

  /**
   * GET /api/cuepoints/debug/stats
   * Get statistics about cue points in the database
   * Useful for debugging cue point import issues
   */
  router.get('/debug/stats', (req, res) => {
    try {
      const stats = db.get(`
        SELECT
          COUNT(DISTINCT track_id) as tracks_with_cues,
          COUNT(*) as total_cue_points
        FROM cue_points
      `);

      // Get breakdown by bank number
      const byBank = db.all(`
        SELECT bank_number, COUNT(*) as count
        FROM cue_points
        GROUP BY bank_number
        ORDER BY bank_number
      `);

      res.json({
        tracksWithCues: stats?.tracks_with_cues || 0,
        totalCuePoints: stats?.total_cue_points || 0,
        byBank: byBank || [],
      });
    } catch (error) {
      logger.error('[CUE POINTS] Error getting stats:', error);
      res.status(500).json({ error: 'Failed to get cue point stats' });
    }
  });

  /**
   * GET /api/cuepoints/:trackId
   * Get all cue points for a track
   * Always re-extracts from audio file to ensure fresh data (handles external Serato changes)
   */
  router.get('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;

      // Always re-extract from audio file for fresh data
      // This ensures we pick up any changes made in Serato DJ
      if (parser) {
        const track = await parser.getTrackById(trackId);
        if (track && track.filePath) {
          // Clear old database entries and re-import from audio file
          db.run('DELETE FROM cue_points WHERE track_id = ?', [trackId]);
          const imported = await parser.importSeratoCuePoints(track);
          if (imported > 0) {
            logger.debug(`[CUE POINTS] Fresh import: ${imported} cue points for: ${track.title}`);
          }
        }
      }

      // Return freshly imported data from database
      const cuePoints = db.all(
        `SELECT bank_number, position, color, label, created_at, updated_at
         FROM cue_points
         WHERE track_id = ?
         ORDER BY bank_number`,
        [trackId]
      );

      // Convert to object keyed by bank number for easier client-side usage
      const cuePointsMap = {};
      cuePoints.forEach((cp) => {
        cuePointsMap[cp.bank_number] = {
          position: cp.position,
          color: cp.color || CUE_COLORS[cp.bank_number],
          label: cp.label,
          createdAt: cp.created_at,
          updatedAt: cp.updated_at,
        };
      });

      res.json({
        trackId,
        cuePoints: cuePointsMap,
      });
    } catch (error) {
      logger.error('[CUE POINTS] Error getting cue points:', error);
      res.status(500).json({ error: 'Failed to get cue points' });
    }
  });

  /**
   * POST /api/cuepoints/:trackId
   * Set or update a cue point
   * Body: { bankNumber: 1-8, position: float (seconds), label?: string, syncToSerato?: boolean }
   */
  router.post('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;
      const { bankNumber, position, label, syncToSerato = false } = req.body;

      // Validate bank number
      if (!bankNumber || bankNumber < 1 || bankNumber > 8) {
        return res.status(400).json({
          error: 'Invalid bank number. Must be between 1 and 8.',
        });
      }

      // Validate position
      if (typeof position !== 'number' || position < 0) {
        return res.status(400).json({
          error: 'Invalid position. Must be a non-negative number.',
        });
      }

      // Get default color for this bank
      const color = CUE_COLORS[bankNumber];

      // Upsert (INSERT OR REPLACE) the cue point
      db.run(
        `INSERT INTO cue_points (track_id, bank_number, position, color, label, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(track_id, bank_number)
         DO UPDATE SET position = excluded.position,
                       label = excluded.label,
                       updated_at = datetime('now')`,
        [trackId, bankNumber, position, color, label || null]
      );

      logger.info(`[CUE POINTS] Set cue point ${bankNumber} for track ${trackId} at ${position}s`);

      // Response object
      const response = {
        success: true,
        trackId,
        bankNumber,
        position,
        color,
        label: label || null,
      };

      // Optionally sync to Serato file
      if (syncToSerato && parser) {
        try {
          const track = await parser.getTrackById(trackId);
          if (track && track.filePath) {
            // Convert hex color to RGB
            const rgb = hexToRgb(color) || { r: 0xCC, g: 0x00, b: 0x00 };

            // DEBUG: Log index conversion
            const index = bankNumber - 1;
            logger.info(`[DEBUG] [CUEPOINTS API] bankNumber received: ${bankNumber}`);
            logger.info(`[DEBUG] [CUEPOINTS API] Converted to index: ${index}`);
            logger.info(`[DEBUG] [CUEPOINTS API] position (seconds): ${position}`);
            logger.info(`[DEBUG] [CUEPOINTS API] positionMs: ${Math.round(position * 1000)}`);

            // Write cue point to audio file
            const writeResult = await seratoWriter.writeCuePoints(track.filePath, [{
              index: index,
              positionMs: Math.round(position * 1000),
              r: rgb.r,
              g: rgb.g,
              b: rgb.b,
              label: label || '',
            }]);

            if (writeResult.success) {
              logger.info(`[CUE POINTS] Synced cue ${bankNumber} to Serato file: ${track.filePath}`);
              response.seratoSync = { success: true, backup: writeResult.backup };
            } else {
              logger.warn(`[CUE POINTS] Serato sync failed (saved to DB only): ${writeResult.error}`);
              response.seratoSync = { success: false, error: writeResult.error };
            }
          } else {
            logger.warn(`[CUE POINTS] Cannot sync to Serato: track not found or no file path`);
            response.seratoSync = { success: false, error: 'Track not found' };
          }
        } catch (syncError) {
          logger.warn(`[CUE POINTS] Serato sync error: ${syncError.message}`);
          response.seratoSync = { success: false, error: syncError.message };
        }
      }

      res.json(response);
    } catch (error) {
      logger.error('[CUE POINTS] Error setting cue point:', error);
      res.status(500).json({ error: 'Failed to set cue point' });
    }
  });

  /**
   * DELETE /api/cuepoints/:trackId/:bankNumber
   * Delete a specific cue point
   * Query params: ?syncToSerato=true to also remove from audio file
   */
  router.delete('/:trackId/:bankNumber', async (req, res) => {
    try {
      const { trackId, bankNumber } = req.params;
      const syncToSerato = req.query.syncToSerato === 'true';
      const bank = parseInt(bankNumber, 10);

      // Validate bank number
      if (isNaN(bank) || bank < 1 || bank > 8) {
        return res.status(400).json({
          error: 'Invalid bank number. Must be between 1 and 8.',
        });
      }

      db.run(
        `DELETE FROM cue_points WHERE track_id = ? AND bank_number = ?`,
        [trackId, bank]
      );

      logger.info(`[CUE POINTS] Deleted cue point ${bank} for track ${trackId}`);

      const response = {
        success: true,
        trackId,
        bankNumber: bank,
      };

      // Optionally sync deletion to Serato file
      if (syncToSerato && parser) {
        try {
          const track = await parser.getTrackById(trackId);
          if (track && track.filePath) {
            const deleteResult = await seratoWriter.deleteCuePoint(
              track.filePath,
              bank - 1 // Convert to 0-indexed
            );

            if (deleteResult.success) {
              logger.info(`[CUE POINTS] Removed cue ${bank} from Serato file: ${track.filePath}`);
              response.seratoSync = { success: true, backup: deleteResult.backup };
            } else {
              logger.warn(`[CUE POINTS] Serato sync failed: ${deleteResult.error}`);
              response.seratoSync = { success: false, error: deleteResult.error };
            }
          } else {
            response.seratoSync = { success: false, error: 'Track not found' };
          }
        } catch (syncError) {
          logger.warn(`[CUE POINTS] Serato sync error: ${syncError.message}`);
          response.seratoSync = { success: false, error: syncError.message };
        }
      }

      res.json(response);
    } catch (error) {
      logger.error('[CUE POINTS] Error deleting cue point:', error);
      res.status(500).json({ error: 'Failed to delete cue point' });
    }
  });

  /**
   * DELETE /api/cuepoints/:trackId
   * Delete all cue points for a track
   */
  router.delete('/:trackId', (req, res) => {
    try {
      const { trackId } = req.params;

      const result = db.run(
        `DELETE FROM cue_points WHERE track_id = ?`,
        [trackId]
      );

      logger.info(`[CUE POINTS] Deleted all cue points for track ${trackId}`);

      res.json({
        success: true,
        trackId,
      });
    } catch (error) {
      logger.error('[CUE POINTS] Error deleting all cue points:', error);
      res.status(500).json({ error: 'Failed to delete cue points' });
    }
  });

  return router;
}

module.exports = createCuePointsRoutes;
