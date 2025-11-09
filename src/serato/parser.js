const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const LRUCache = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * Custom error classes
 */
class SeratoNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeratoNotFoundError';
  }
}

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

class CrateNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrateNotFoundError';
  }
}

/**
 * Serato Parser - Reads Serato database and crate files
 * Uses a simplified approach: directory scanning + metadata extraction
 */
class SeratoParser {
  constructor(seratoPath, cacheConfig = {}) {
    this.seratoPath = seratoPath;
    this.cratesDir = path.join(seratoPath, 'Subcrates');

    // Initialize cache
    this.cache = new LRUCache(
      cacheConfig.maxSize || 1000,
      cacheConfig.ttl || 3600000
    );

    // Supported audio formats
    this.audioExtensions = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.aiff'];
  }

  /**
   * Verify Serato directory exists
   */
  async verifySeratoPath() {
    try {
      const stats = await fs.stat(this.seratoPath);
      if (!stats.isDirectory()) {
        throw new SeratoNotFoundError(`Serato path is not a directory: ${this.seratoPath}`);
      }
      return true;
    } catch (error) {
      throw new SeratoNotFoundError(`Serato directory not found: ${this.seratoPath}`);
    }
  }

  /**
   * Parse library - Scan music directory and extract metadata
   * Returns array of track objects
   */
  async parseLibrary(musicPath = null) {
    const cacheKey = 'library';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Returning cached library');
      return cached;
    }

    logger.info('Parsing library...');

    // Use parent directory of _Serato_ as music root
    const defaultMusicPath = path.dirname(this.seratoPath);
    const scanPath = musicPath || defaultMusicPath;

    try {
      const tracks = await this._scanDirectory(scanPath);
      logger.success(`Found ${tracks.length} tracks`);

      this.cache.set(cacheKey, tracks);
      return tracks;
    } catch (error) {
      logger.error('Error parsing library:', error.message);
      throw new ParseError(`Failed to parse library: ${error.message}`);
    }
  }

  /**
   * Get all crates (metadata only, no track details)
   */
  async getAllCrates() {
    const cacheKey = 'crates-list';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    logger.info('Reading crates...');

    try {
      await this.verifySeratoPath();

      // Check if crates directory exists
      try {
        await fs.stat(this.cratesDir);
      } catch {
        logger.warn('Subcrates directory not found, returning empty crates list');
        return [];
      }

      const files = await fs.readdir(this.cratesDir);
      const crateFiles = files.filter(f => f.endsWith('.crate'));

      const crates = crateFiles.map(file => {
        const name = path.basename(file, '.crate');
        return {
          id: this.slugify(name),
          name: name,
          trackCount: 0, // Will be populated when crate is parsed
          filePath: path.join(this.cratesDir, file),
        };
      });

      logger.success(`Found ${crates.length} crates`);
      this.cache.set(cacheKey, crates);
      return crates;
    } catch (error) {
      logger.error('Error reading crates:', error.message);
      throw new ParseError(`Failed to read crates: ${error.message}`);
    }
  }

  /**
   * Parse a specific crate and return its tracks
   */
  async parseCrate(crateId) {
    const cacheKey = `crate-${crateId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    logger.info(`Parsing crate: ${crateId}`);

    try {
      const crates = await this.getAllCrates();
      const crate = crates.find(c => c.id === crateId);

      if (!crate) {
        throw new CrateNotFoundError(`Crate not found: ${crateId}`);
      }

      // Read crate file
      const fileContent = await fs.readFile(crate.filePath);
      const trackPaths = this._parseCrateFile(fileContent);

      // Get all library tracks
      const library = await this.parseLibrary();

      // Match tracks by file path
      const tracks = trackPaths
        .map(trackPath => {
          return library.find(t => t.filePath === trackPath);
        })
        .filter(Boolean); // Remove undefined matches

      const result = {
        id: crate.id,
        name: crate.name,
        trackCount: tracks.length,
        tracks: tracks,
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof CrateNotFoundError) {
        throw error;
      }
      logger.error('Error parsing crate:', error.message);
      throw new ParseError(`Failed to parse crate: ${error.message}`);
    }
  }

  /**
   * Get a single track by ID
   */
  async getTrackById(trackId) {
    const library = await this.parseLibrary();
    const track = library.find(t => t.id === trackId);

    if (!track) {
      return null;
    }

    return track;
  }

  /**
   * Search tracks by query
   */
  async searchTracks(query, field = 'all') {
    const library = await this.parseLibrary();
    const lowerQuery = query.toLowerCase();

    return library.filter(track => {
      if (field === 'all') {
        return (
          track.title?.toLowerCase().includes(lowerQuery) ||
          track.artist?.toLowerCase().includes(lowerQuery) ||
          track.album?.toLowerCase().includes(lowerQuery)
        );
      }

      if (field === 'title') {
        return track.title?.toLowerCase().includes(lowerQuery);
      }

      if (field === 'artist') {
        return track.artist?.toLowerCase().includes(lowerQuery);
      }

      if (field === 'album') {
        return track.album?.toLowerCase().includes(lowerQuery);
      }

      return false;
    });
  }

  /**
   * Invalidate cache for specific item or all
   */
  invalidateCache(item = null) {
    if (item) {
      this.cache.delete(item);
      logger.debug(`Cache invalidated for: ${item}`);
    } else {
      this.cache.clear();
      logger.debug('All cache cleared');
    }
  }

  /**
   * Generate consistent track ID from file path
   */
  generateTrackId(filePath) {
    return crypto
      .createHash('md5')
      .update(filePath)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Convert name to URL-friendly slug
   */
  slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Scan directory recursively for audio files
   * @private
   */
  async _scanDirectory(dirPath, tracks = []) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip _Serato_ directory to avoid recursion
        if (entry.name === '_Serato_') {
          continue;
        }

        if (entry.isDirectory()) {
          await this._scanDirectory(fullPath, tracks);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.audioExtensions.includes(ext)) {
            const track = await this._createTrackObject(fullPath);
            tracks.push(track);
          }
        }
      }

      return tracks;
    } catch (error) {
      logger.warn(`Error scanning directory ${dirPath}:`, error.message);
      return tracks;
    }
  }

  /**
   * Create track object from file path
   * @private
   */
  async _createTrackObject(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);
      const ext = path.extname(filename);

      return {
        id: this.generateTrackId(filePath),
        filePath: filePath,
        filename: filename,
        title: path.basename(filename, ext),
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        genre: '',
        year: null,
        duration: 0,
        bpm: null,
        key: null,
        fileSize: stats.size,
        format: ext.substring(1).toUpperCase(),
        addedAt: stats.birthtime,
      };
    } catch (error) {
      logger.warn(`Error creating track object for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Parse .crate file to extract track paths
   * Simplified: looks for file path patterns in binary data
   * @private
   */
  _parseCrateFile(buffer) {
    const trackPaths = [];

    // Convert buffer to string and look for file path patterns
    const content = buffer.toString('latin1');

    // Look for common path patterns (this is a simplified approach)
    // Serato stores full file paths in crate files
    const pathRegex = /([A-Za-z]:\\[^\\]+\\[^\x00]+|\/[^\/\x00]+\/[^\x00]+)\.(mp3|flac|wav|aac|m4a|ogg|aiff)/gi;
    const matches = content.match(pathRegex);

    if (matches) {
      matches.forEach(match => {
        // Clean up the path
        const cleanPath = match.replace(/\x00/g, '').trim();
        if (cleanPath) {
          trackPaths.push(cleanPath);
        }
      });
    }

    return trackPaths;
  }
}

module.exports = {
  SeratoParser,
  SeratoNotFoundError,
  ParseError,
  CrateNotFoundError,
};
