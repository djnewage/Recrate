const express = require('express');
const db = require('../../utils/db');
const logger = require('../../utils/logger');

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
 * @returns {express.Router}
 */
function createCuePointsRoutes() {
  const router = express.Router();

  /**
   * GET /api/cuepoints/:trackId
   * Get all cue points for a track
   */
  router.get('/:trackId', (req, res) => {
    try {
      const { trackId } = req.params;

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
   * Body: { bankNumber: 1-8, position: float (seconds), label?: string }
   */
  router.post('/:trackId', (req, res) => {
    try {
      const { trackId } = req.params;
      const { bankNumber, position, label } = req.body;

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

      res.json({
        success: true,
        trackId,
        bankNumber,
        position,
        color,
        label: label || null,
      });
    } catch (error) {
      logger.error('[CUE POINTS] Error setting cue point:', error);
      res.status(500).json({ error: 'Failed to set cue point' });
    }
  });

  /**
   * DELETE /api/cuepoints/:trackId/:bankNumber
   * Delete a specific cue point
   */
  router.delete('/:trackId/:bankNumber', (req, res) => {
    try {
      const { trackId, bankNumber } = req.params;
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

      res.json({
        success: true,
        trackId,
        bankNumber: bank,
      });
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
