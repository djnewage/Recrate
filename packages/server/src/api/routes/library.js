const express = require('express');
const logger = require('../../utils/logger');
const MetadataExtractor = require('../../audio/metadata');

/**
 * Create library routes
 */
function createLibraryRoutes(parser) {
  const router = express.Router();
  const metadataExtractor = new MetadataExtractor();

  /**
   * GET /api/library/status
   * Get indexing status
   */
  router.get('/status', (req, res) => {
    try {
      const status = parser.getIndexingStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting indexing status:', error);
      res.status(500).json({ error: 'Failed to get indexing status' });
    }
  });

  /**
   * GET /api/library
   * List all tracks with optional search, sorting, and pagination
   */
  router.get('/', async (req, res) => {
    try {
      // Check if indexing is in progress
      const status = parser.getIndexingStatus();
      if (status.isIndexing && !status.isComplete) {
        // Parse limit from query params (default to 2000 if not provided, 0 means "all")
        const requestedLimit = parseInt(req.query.limit, 10);
        const effectiveLimit = requestedLimit === 0 ? 0 : (requestedLimit || 2000);

        // Return indexing status instead of empty library
        return res.json({
          indexing: true,
          status: status,
          tracks: [],
          pagination: {
            total: 0,
            limit: effectiveLimit,
            offset: 0,
            hasMore: false
          },
          message: 'Library is currently being indexed. This may take a few minutes for large libraries.'
        });
      }

      const { search, sortBy = 'title', limit = 2000, offset = 0 } = req.query;

      let tracks = await parser.parseLibrary();

      // Apply search filter if provided
      if (search) {
        tracks = await parser.searchTracks(search);
      }

      // Apply sorting
      tracks = sortTracks(tracks, sortBy);

      // Get total count before pagination
      const total = tracks.length;

      // Parse limit - treat 0 as "return all tracks"
      const parsedLimit = parseInt(limit, 10);
      const parsedOffset = parseInt(offset, 10);
      const returnAll = parsedLimit === 0;

      // Apply pagination (skip if limit=0 means "return all")
      const paginatedTracks = returnAll
        ? tracks
        : tracks.slice(parsedOffset, parsedOffset + parsedLimit);

      // Enhance tracks with metadata (for first batch only to avoid slowdown)
      const enhancedTracks = await enhanceTracksWithMetadata(
        paginatedTracks.slice(0, 20),
        metadataExtractor
      );

      // For remaining tracks, return as-is
      const remainingTracks = paginatedTracks.slice(20);

      res.json({
        tracks: [...enhancedTracks, ...remainingTracks],
        pagination: {
          total,
          limit: returnAll ? total : parsedLimit,
          offset: returnAll ? 0 : parsedOffset,
          hasMore: returnAll ? false : (parsedOffset + parsedLimit < total),
        },
      });
    } catch (error) {
      logger.error('Error fetching library:', error);
      res.status(500).json({ error: 'Failed to fetch library' });
    }
  });

  /**
   * GET /api/library/:trackId
   * Get details for a specific track
   */
  router.get('/:trackId', async (req, res) => {
    try {
      const { trackId } = req.params;

      const track = await parser.getTrackById(trackId);

      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      // Enhance with full metadata
      const metadata = await metadataExtractor.extractMetadata(track.filePath);
      const enhancedTrack = { ...track, ...metadata };

      res.json({ track: enhancedTrack });
    } catch (error) {
      logger.error('Error fetching track:', error);
      res.status(500).json({ error: 'Failed to fetch track' });
    }
  });

  return router;
}

/**
 * Sort tracks by field
 */
function sortTracks(tracks, sortBy) {
  const sortFunctions = {
    title: (a, b) => (a.title || '').localeCompare(b.title || ''),
    artist: (a, b) => (a.artist || '').localeCompare(b.artist || ''),
    album: (a, b) => (a.album || '').localeCompare(b.album || ''),
    addedAt: (a, b) => new Date(b.addedAt) - new Date(a.addedAt),
    duration: (a, b) => (b.duration || 0) - (a.duration || 0),
  };

  const sortFn = sortFunctions[sortBy] || sortFunctions.title;
  return [...tracks].sort(sortFn);
}

/**
 * Enhance tracks with full metadata
 */
async function enhanceTracksWithMetadata(tracks, metadataExtractor) {
  const enhanced = await Promise.all(
    tracks.map(async (track) => {
      try {
        const metadata = await metadataExtractor.extractMetadata(track.filePath);
        return { ...track, ...metadata };
      } catch (error) {
        logger.warn(`Failed to enhance track ${track.id}:`, error.message);
        return track;
      }
    })
  );

  return enhanced;
}

module.exports = createLibraryRoutes;
