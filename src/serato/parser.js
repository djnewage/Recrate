const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const LRUCache = require('../utils/cache');
const logger = require('../utils/logger');
const MetadataExtractor = require('../audio/metadata');

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
  constructor(seratoPath, musicPath, cacheConfig = {}) {
    this.seratoPath = seratoPath;
    this.musicPath = musicPath;
    this.cratesDir = path.join(seratoPath, 'Subcrates');

    // Initialize cache
    this.cache = new LRUCache(
      cacheConfig.maxSize || 1000,
      cacheConfig.ttl || 3600000
    );

    // Initialize metadata extractor
    this.metadataExtractor = new MetadataExtractor();

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

      // Try to parse database V2 first for accurate track list with metadata
      const trackMetadata = await this._parseDatabaseV2();

      if (trackMetadata && trackMetadata.length > 0) {
        // Database parsing succeeded - use track metadata
        logger.info(`Found ${trackMetadata.length} tracks in Serato database`);

        for (const metadata of trackMetadata) {
          try {
            // Verify file exists
            await fs.stat(metadata.filePath);
            // Skip metadata extraction since we already have it from database
            const track = await this._createTrackObject(metadata.filePath, true);
            if (track) {
              // Merge database metadata with track object
              track.bpm = metadata.bpm || track.bpm;
              track.key = metadata.key || track.key;
              tracksMap.set(metadata.filePath, track);
            }
          } catch (error) {
            // File doesn't exist or can't be read - skip it
            logger.debug(`Skipping track (file not found): ${metadata.filePath}`);
          }
        }

        logger.info(`Found ${tracksMap.size} tracks from database with existing files`);
      } else {
        logger.info('Database V2 parsing failed');
      }

      // ALSO scan the music directory to catch any files not in the database
      logger.info('Scanning music directory for additional tracks...');
      const defaultMusicPath = path.dirname(this.seratoPath);
      const scanPath = this.musicPath || musicPath || defaultMusicPath;
      logger.info(`Scan path: ${scanPath}`);
      // Extract metadata for scanned tracks since they're not in the database
      const scannedTracks = await this._scanDirectory(scanPath, true);

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
  async _scanDirectory(dirPath, extractMetadata = true, tracks = []) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip _Serato_ directory to avoid recursion
        if (entry.name === '_Serato_') {
          continue;
        }

        if (entry.isDirectory()) {
          await this._scanDirectory(fullPath, extractMetadata, tracks);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.audioExtensions.includes(ext)) {
            const track = await this._createTrackObject(fullPath, !extractMetadata);
            if (track) {
              tracks.push(track);
            }
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
  async _createTrackObject(filePath, skipMetadataExtraction = false) {
    try {
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);
      const ext = path.extname(filename);

      // Extract metadata from the actual audio file if requested
      let metadata = null;
      if (!skipMetadataExtraction) {
        try {
          metadata = await this.metadataExtractor.extractMetadata(filePath);
        } catch (metadataError) {
          logger.debug(`Metadata extraction failed for ${filePath}: ${metadataError.message}`);
        }
      }

      return {
        id: this.generateTrackId(filePath),
        filePath: filePath,
        filename: filename,
        title: metadata?.title || path.basename(filename, ext),
        artist: metadata?.artist || 'Unknown Artist',
        album: metadata?.album || 'Unknown Album',
        genre: metadata?.genre || '',
        year: metadata?.year || null,
        duration: metadata?.duration || 0,
        bpm: metadata?.bpm || null,
        key: metadata?.key || null,
        fileSize: stats.size,
        format: metadata?.format || ext.substring(1).toUpperCase(),
        addedAt: stats.birthtime,
      };
    } catch (error) {
      logger.warn(`Error creating track object for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Decode UTF-16BE string from buffer
   * @private
   */
  _decodeUTF16BE(buffer) {
    let str = '';
    for (let i = 0; i < buffer.length; i += 2) {
      if (i + 1 < buffer.length) {
        const charCode = (buffer[i] << 8) | buffer[i + 1];
        if (charCode !== 0) {
          str += String.fromCharCode(charCode);
        }
      }
    }
    return str.trim();
  }

  /**
   * Extract field value from Serato database chunk
   * @private
   */
  _extractField(buffer, marker, startOffset, endOffset) {
    try {
      const fieldIndex = buffer.indexOf(marker, startOffset);
      if (fieldIndex === -1 || fieldIndex >= endOffset) return null;

      const lengthOffset = fieldIndex + 4;
      if (lengthOffset + 4 > buffer.length) return null;

      const length = buffer.readUInt32BE(lengthOffset);
      const dataStart = lengthOffset + 4;

      if (dataStart + length > buffer.length) return null;

      const data = buffer.slice(dataStart, dataStart + length);
      return this._decodeUTF16BE(data);
    } catch (error) {
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
   * Parse Serato database V2 file to extract track metadata (path, BPM, key)
   * @private
   */
  async _parseDatabaseV2() {
    const trackMetadata = [];
    const databasePath = path.join(this.seratoPath, 'database V2');

    try {
      const buffer = await fs.readFile(databasePath);
      const otrkMarker = Buffer.from('otrk');
      const pfilMarker = Buffer.from('pfil');
      const tbpmMarker = Buffer.from('tbpm');
      const tkeyMarker = Buffer.from('tkey');

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

        // Initialize track metadata object
        const track = {
          filePath: null,
          bpm: null,
          key: null,
        };

        // Extract file path
        let filePath = this._extractField(buffer, pfilMarker, otrkDataStart, otrkDataEnd);
        if (filePath) {
          // Normalize path: ensure it starts with /
          if (!filePath.startsWith('/')) {
            filePath = '/' + filePath;
          }
          track.filePath = filePath;
        }

        // Extract BPM
        const bpmStr = this._extractField(buffer, tbpmMarker, otrkDataStart, otrkDataEnd);
        if (bpmStr) {
          const bpm = parseFloat(bpmStr);
          if (!isNaN(bpm)) {
            track.bpm = bpm;
          }
        }

        // Extract key
        const key = this._extractField(buffer, tkeyMarker, otrkDataStart, otrkDataEnd);
        if (key) {
          track.key = key;
        }

        // Only add valid audio file paths
        if (track.filePath && /\.(mp3|flac|wav|aac|m4a|ogg|aiff)$/i.test(track.filePath)) {
          trackMetadata.push(track);
          logger.debug(`Found track: ${track.filePath} [BPM: ${track.bpm || 'N/A'}, Key: ${track.key || 'N/A'}]`);
        }

        // Move to next track chunk
        offset = otrkDataEnd;
      }

      logger.success(`Extracted ${trackMetadata.length} tracks from database V2`);
      return trackMetadata;
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
