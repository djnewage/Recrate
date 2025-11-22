const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const MetadataExtractor = require('./metadata');
const pathResolver = require('../utils/pathResolver');

/**
 * Audio streamer with HTTP range request support
 */
class AudioStreamer {
  constructor(parser) {
    this.parser = parser;
    this.metadataExtractor = new MetadataExtractor();
    this.chunkSize = 256 * 1024; // 256KB chunks
  }

  /**
   * Stream audio track with range support
   */
  async streamTrack(trackId, req, res) {
    try {
      // Get track from parser
      const track = await this.parser.getTrackById(trackId);

      if (!track) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      // Use verified path if available (set during indexing), otherwise fall back to filePath
      let filePath = track.verifiedPath || track.filePath;

      // Check if file exists (async to avoid blocking event loop)
      try {
        await fsPromises.access(filePath, fs.constants.R_OK);
        // File exists and is readable
      } catch (error) {
        // File doesn't exist or isn't readable - try path resolution
        logger.debug(`Track file not found at ${filePath}, attempting path resolution...`);
        const resolvedPath = await pathResolver.resolvePath(track.filePath, track);

        if (resolvedPath) {
          try {
            await fsPromises.access(resolvedPath, fs.constants.R_OK);
            filePath = resolvedPath;
            logger.debug(`Resolved track path: ${filePath}`);
          } catch {
            logger.warn(`Resolved path not accessible for track ${trackId}: ${resolvedPath}`);
            res.status(404).json({ error: 'Audio file not found' });
            return;
          }
        } else {
          logger.warn(`Could not resolve path for track ${trackId}: ${track.filePath}`);
          res.status(404).json({ error: 'Audio file not found' });
          return;
        }
      }

      // Get file stats (async to avoid blocking event loop)
      const stats = await fsPromises.stat(filePath);
      const fileSize = stats.size;
      const mimeType = this.getMimeType(filePath);

      // Parse range header
      const range = req.headers.range;

      if (range) {
        // Handle range request with validation
        let start, end;
        try {
          const parsed = this.parseRange(range, fileSize);
          start = parsed.start;
          end = parsed.end;
        } catch (error) {
          logger.warn(`Invalid range header: ${range}`, error.message);
          res.status(416).json({ error: 'Range not satisfiable', details: error.message });
          return;
        }

        if (start >= fileSize || end >= fileSize) {
          res.status(416).json({ error: 'Range not satisfiable' });
          return;
        }

        const contentLength = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength,
          'Content-Type': mimeType,
          // Cache headers for better performance
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'ETag': `"${trackId}-${stats.mtime.getTime()}"`, // ETag based on modification time
          'Last-Modified': stats.mtime.toUTCString(),
        });

        this.streamFile(filePath, start, end, res);
      } else {
        // Stream entire file
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          // Cache headers for better performance
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'ETag': `"${trackId}-${stats.mtime.getTime()}"`, // ETag based on modification time
          'Last-Modified': stats.mtime.toUTCString(),
        });

        this.streamFile(filePath, 0, fileSize - 1, res);
      }
    } catch (error) {
      logger.error('Error streaming track:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream track' });
      }
    }
  }

  /**
   * Get artwork for a track
   */
  async getArtwork(trackId, res) {
    try {
      const track = await this.parser.getTrackById(trackId);

      if (!track) {
        res.status(404).json({ error: 'Track not found' });
        return;
      }

      const artwork = await this.metadataExtractor.getArtwork(track.filePath);

      if (!artwork) {
        res.status(404).json({ error: 'Artwork not found' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': artwork.format,
        'Content-Length': artwork.data.length,
        // Cache artwork aggressively (rarely changes)
        'Cache-Control': 'public, max-age=86400, immutable', // Cache for 24 hours
        'ETag': `"${trackId}-artwork"`,
      });

      res.end(artwork.data);
    } catch (error) {
      logger.error('Error getting artwork:', error);
      res.status(500).json({ error: 'Failed to get artwork' });
    }
  }

  /**
   * Get MIME type from file extension
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.aiff': 'audio/aiff',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Parse HTTP range header with validation
   */
  parseRange(rangeHeader, fileSize) {
    // Validate range header format
    if (!rangeHeader || typeof rangeHeader !== 'string') {
      throw new Error('Invalid range header');
    }

    if (!rangeHeader.startsWith('bytes=')) {
      throw new Error('Range header must start with "bytes="');
    }

    const parts = rangeHeader.replace(/bytes=/, '').split('-');

    if (parts.length !== 2) {
      throw new Error('Invalid range format');
    }

    const start = parts[0] ? parseInt(parts[0], 10) : 0;
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    // Validate parsed values
    if (isNaN(start) || isNaN(end)) {
      throw new Error('Range values must be valid numbers');
    }

    if (start < 0 || end < 0) {
      throw new Error('Range values cannot be negative');
    }

    if (start > end) {
      throw new Error('Range start must be less than or equal to end');
    }

    // Cap at file size
    return {
      start: Math.min(start, fileSize - 1),
      end: Math.min(end, fileSize - 1)
    };
  }

  /**
   * Stream file with range support and proper cleanup
   */
  streamFile(filePath, start, end, res) {
    const stream = fs.createReadStream(filePath, { start, end });

    // Cleanup on client disconnect to prevent resource leaks
    res.on('close', () => {
      if (!stream.destroyed) {
        stream.destroy();
        logger.debug(`Stream closed by client: ${filePath}`);
      }
    });

    // Handle stream errors
    stream.on('error', (error) => {
      logger.error('Stream error:', error);
      if (!stream.destroyed) {
        stream.destroy();
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });

    stream.pipe(res);
  }
}

module.exports = AudioStreamer;
