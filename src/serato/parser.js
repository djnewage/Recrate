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
   * Parse library - Extract tracks from Serato database or scan directory
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

    try {
      const tracksMap = new Map(); // Use Map to avoid duplicates (keyed by file path)

      // Try to parse database V2 first for accurate track list
      const trackPaths = await this._parseDatabaseV2();

      if (trackPaths && trackPaths.length > 0) {
        // Database parsing succeeded - use those paths
        logger.info(`Found ${trackPaths.length} tracks in Serato database`);

        for (const filePath of trackPaths) {
          try {
            // Verify file exists
            await fs.stat(filePath);
            const track = await this._createTrackObject(filePath);
            if (track) {
              tracksMap.set(filePath, track);
            }
          } catch (error) {
            // File doesn't exist or can't be read - skip it
            logger.debug(`Skipping track (file not found): ${filePath}`);
          }
        }

        logger.info(`Found ${tracksMap.size} tracks from database with existing files`);
      } else {
        logger.info('Database V2 parsing failed');
      }

      // ALSO scan the music directory to catch any files not in the database
      logger.info('Scanning music directory for additional tracks...');
      const defaultMusicPath = path.dirname(this.seratoPath);
      const scanPath = musicPath || defaultMusicPath;
      const scannedTracks = await this._scanDirectory(scanPath);

      let addedFromScan = 0;
      for (const track of scannedTracks) {
        if (!tracksMap.has(track.filePath)) {
          tracksMap.set(track.filePath, track);
          addedFromScan++;
        }
      }

      logger.info(`Found ${addedFromScan} additional tracks from directory scan`);

      const tracks = Array.from(tracksMap.values());
      logger.success(`Total library: ${tracks.length} tracks`);

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

      const crates = await Promise.all(
        crateFiles.map(async (file) => {
          const name = path.basename(file, '.crate');
          const filePath = path.join(this.cratesDir, file);

          // Quick count of tracks without full parsing
          let trackCount = 0;
          try {
            const fileContent = await fs.readFile(filePath);
            trackCount = this._countTracksInCrate(fileContent);
          } catch (error) {
            logger.warn(`Error counting tracks in ${name}:`, error.message);
          }

          return {
            id: this.slugify(name),
            name: name,
            trackCount: trackCount,
            filePath: filePath,
          };
        })
      );

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
   * Count tracks in crate file without full parsing
   * @private
   */
  _countTracksInCrate(buffer) {
    const ptrkMarker = Buffer.from('ptrk');
    let count = 0;
    let offset = 0;

    while (offset < buffer.length) {
      const markerIndex = buffer.indexOf(ptrkMarker, offset);
      if (markerIndex === -1) break;

      count++;
      offset = markerIndex + 4;
    }

    return count;
  }

  /**
   * Parse Serato database V2 file to extract all track file paths
   * @private
   */
  async _parseDatabaseV2() {
    const trackPaths = [];
    const databasePath = path.join(this.seratoPath, 'database V2');

    try {
      const buffer = await fs.readFile(databasePath);
      const otrkMarker = Buffer.from('otrk');
      const pfilMarker = Buffer.from('pfil');

      let offset = 0;

      // Search for 'otrk' (track) chunks
      while (offset < buffer.length - 8) {
        const otrkIndex = buffer.indexOf(otrkMarker, offset);
        if (otrkIndex === -1) break;

        // Read track chunk length
        const otrkLengthOffset = otrkIndex + 4;
        if (otrkLengthOffset + 4 > buffer.length) break;

        const otrkLength = buffer.readUInt32BE(otrkLengthOffset);
        const otrkDataStart = otrkLengthOffset + 4;
        const otrkDataEnd = otrkDataStart + otrkLength;

        // Search for 'pfil' (file path) inside this track chunk
        let pfilOffset = otrkDataStart;
        while (pfilOffset < otrkDataEnd - 8) {
          const pfilIndex = buffer.indexOf(pfilMarker, pfilOffset);
          if (pfilIndex === -1 || pfilIndex >= otrkDataEnd) break;

          // Read path length
          const pfilLengthOffset = pfilIndex + 4;
          if (pfilLengthOffset + 4 > buffer.length) break;

          const pfilLength = buffer.readUInt32BE(pfilLengthOffset);
          const pfilDataStart = pfilLengthOffset + 4;

          if (pfilDataStart + pfilLength > buffer.length) break;

          try {
            // Decode UTF-16BE file path
            const pathData = buffer.slice(pfilDataStart, pfilDataStart + pfilLength);
            let filePath = '';
            for (let i = 0; i < pathData.length; i += 2) {
              if (i + 1 < pathData.length) {
                const charCode = (pathData[i] << 8) | pathData[i + 1];
                if (charCode !== 0) {
                  filePath += String.fromCharCode(charCode);
                }
              }
            }

            filePath = filePath.trim();

            // Normalize path: ensure it starts with /
            if (filePath && !filePath.startsWith('/')) {
              filePath = '/' + filePath;
            }

            // Only add valid audio file paths
            if (filePath && /\.(mp3|flac|wav|aac|m4a|ogg|aiff)$/i.test(filePath)) {
              trackPaths.push(filePath);
              logger.debug(`Found track in database: ${filePath}`);
            }
          } catch (error) {
            logger.warn(`Error decoding track path in database:`, error.message);
          }

          break; // Only one pfil per otrk
        }

        // Move to next track chunk
        offset = otrkDataEnd;
      }

      logger.success(`Extracted ${trackPaths.length} track paths from database V2`);
      return trackPaths;
    } catch (error) {
      logger.warn(`Could not parse database V2: ${error.message}`);
      return null; // Return null to trigger fallback to directory scanning
    }
  }

  /**
   * Parse .crate file to extract track paths
   * Serato uses a binary chunk format with 'ptrk' markers
   * @private
   */
  _parseCrateFile(buffer) {
    const trackPaths = [];
    const ptrkMarker = Buffer.from('ptrk');

    let offset = 0;

    // Search for 'ptrk' chunks throughout the buffer
    while (offset < buffer.length - 8) {
      // Look for 'ptrk' marker
      const markerIndex = buffer.indexOf(ptrkMarker, offset);

      if (markerIndex === -1) {
        break; // No more tracks found
      }

      // Move to position after 'ptrk' marker
      offset = markerIndex + 4;

      // Read the length field (4 bytes, big-endian)
      if (offset + 4 > buffer.length) {
        break;
      }

      const length = buffer.readUInt32BE(offset);
      offset += 4;

      // Extract the path data
      if (offset + length > buffer.length) {
        break;
      }

      try {
        // Decode from UTF-16BE (Serato uses big-endian encoding)
        const pathData = buffer.slice(offset, offset + length);

        // Manually decode UTF-16BE since Node.js doesn't have built-in support
        let filePath = '';
        for (let i = 0; i < pathData.length; i += 2) {
          if (i + 1 < pathData.length) {
            const charCode = (pathData[i] << 8) | pathData[i + 1];
            if (charCode !== 0) {
              filePath += String.fromCharCode(charCode);
            }
          }
        }

        filePath = filePath.trim();

        // Normalize path: ensure it starts with /
        if (filePath && !filePath.startsWith('/')) {
          filePath = '/' + filePath;
        }

        // Only add if it looks like a valid audio file path
        if (filePath && /\.(mp3|flac|wav|aac|m4a|ogg|aiff)$/i.test(filePath)) {
          trackPaths.push(filePath);
          logger.debug(`Found track in crate: ${filePath}`);
        }
      } catch (error) {
        logger.warn(`Error decoding track path at offset ${offset}:`, error.message);
      }

      // Move to next potential chunk
      offset += length;
    }

    logger.info(`Extracted ${trackPaths.length} track paths from crate`);
    return trackPaths;
  }
}

module.exports = {
  SeratoParser,
  SeratoNotFoundError,
  ParseError,
  CrateNotFoundError,
};
