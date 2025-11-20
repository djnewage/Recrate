const fs = require('fs');
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

      let filePath = track.filePath;

      // Check if file exists at current path
      if (!fs.existsSync(filePath)) {
        // Try to resolve moved file
        logger.debug(`Track file not found at ${filePath}, attempting path resolution...`);
        const resolvedPath = await pathResolver.resolvePath(filePath, track);

        if (resolvedPath && fs.existsSync(resolvedPath)) {
          filePath = resolvedPath;
          logger.debug(`Resolved track path: ${filePath}`);
        } else {
          logger.warn(`Could not resolve path for track ${trackId}: ${filePath}`);
          res.status(404).json({ error: 'Audio file not found' });
          return;
        }
      }

      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      const mimeType = this.getMimeType(filePath);

      // Parse range header
      const range = req.headers.range;

      if (range) {
        // Handle range request
        const { start, end } = this.parseRange(range, fileSize);

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
   * Parse HTTP range header
   */
  parseRange(rangeHeader, fileSize) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    return { start, end };
  }

  /**
   * Stream file with range support
   */
  streamFile(filePath, start, end, res) {
    const stream = fs.createReadStream(filePath, { start, end });

    stream.on('error', (error) => {
      logger.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
    });

    stream.pipe(res);
  }
}

module.exports = AudioStreamer;
