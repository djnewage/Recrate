const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const pLimit = require('p-limit');
const LRUCache = require('../utils/cache');
const logger = require('../utils/logger');
const MetadataExtractor = require('../audio/metadata');
const pathResolver = require('../utils/pathResolver');

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
class SeratoParser extends EventEmitter {
  constructor(seratoPath, musicPaths, cacheConfig = {}) {
    super();
    this.seratoPath = seratoPath;
    this.musicPaths = Array.isArray(musicPaths) ? musicPaths : [musicPaths].filter(Boolean);
    this.cratesDir = path.join(seratoPath, 'Subcrates');

    // Concurrency limiter to prevent "too many open files" errors
    this.fileOpLimit = pLimit(100); // Max 100 concurrent file operations

    // Initialize cache
    this.cache = new LRUCache(
      cacheConfig.maxSize || 1000,
      cacheConfig.ttl || 3600000
    );

    // Track cache for O(1) lookups by ID (populated during indexing)
    this.trackCache = new Map(); // trackId → track object

    // Initialize metadata extractor
    this.metadataExtractor = new MetadataExtractor();

    // Supported audio formats
    this.audioExtensions = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.aiff'];

    // Indexing status tracking
    this.indexingStatus = {
      isIndexing: false,
      isComplete: false,
      startTime: null,
      endTime: null,
      progress: {
        phase: 'idle', // idle, indexing, parsing_database, scanning, complete
        currentPath: null,
        filesIndexed: 0,
        tracksFound: 0,
        tracksResolved: 0,
        tracksNotFound: 0,
        message: 'Ready to index'
      }
    };

    // WebSocket instance for progress updates (set by server)
    this.io = null;
  }

  /**
   * Set WebSocket instance for progress updates
   */
  setWebSocket(io) {
    this.io = io;
  }

  /**
   * Emit progress update via WebSocket
   */
  _emitProgress(update) {
    if (this.io) {
      this.io.emit('indexing:progress', {
        ...this.indexingStatus,
        progress: {
          ...this.indexingStatus.progress,
          ...update
        }
      });
    }
  }

  /**
   * Get current indexing status
   */
  getIndexingStatus() {
    return {
      ...this.indexingStatus,
      duration: this.indexingStatus.startTime
        ? (this.indexingStatus.endTime || Date.now()) - this.indexingStatus.startTime
        : null
    };
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
   * Start background indexing (non-blocking)
   */
  async startBackgroundIndexing() {
    if (this.indexingStatus.isIndexing) {
      logger.warn('Indexing already in progress');
      return;
    }

    // Start indexing in background (don't await)
    this.parseLibrary().catch(error => {
      logger.error('Background indexing failed:', error);
      this.indexingStatus.isIndexing = false;
      this.indexingStatus.progress.phase = 'error';
      this.indexingStatus.progress.message = `Indexing failed: ${error.message}`;
      this._emitProgress({ phase: 'error', message: `Error: ${error.message}` });
    });
  }

  /**
   * Parse library - Extract tracks from Serato database or scan directory
   * Returns array of track objects
   */
  async parseLibrary(musicPath = null) {
    const cacheKey = 'library';
    const cached = this.cache.get(cacheKey);
    if (cached && this.indexingStatus.isComplete) {
      logger.debug('Returning cached library');
      return cached;
    }

    // If already indexing, wait for it to complete using events
    if (this.indexingStatus.isIndexing) {
      logger.debug('Indexing already in progress, waiting for completion...');
      return new Promise((resolve) => {
        this.once('indexing:complete', () => {
          resolve(this.cache.get(cacheKey) || []);
        });
      });
    }

    this.indexingStatus.isIndexing = true;
    this.indexingStatus.isComplete = false;
    this.indexingStatus.startTime = Date.now();
    this.indexingStatus.progress.phase = 'indexing';
    this.indexingStatus.progress.message = 'Starting library indexing...';
    this._emitProgress({ phase: 'indexing', message: 'Starting library indexing...' });

    // Clear track cache to rebuild from scratch
    this.trackCache.clear();
    logger.debug('Track cache cleared for re-indexing');

    logger.info('Parsing library...');

    try {
      const tracksMap = new Map(); // Use Map to avoid duplicates (keyed by file path)

      // Determine music paths to scan
      const pathsToScan = this.musicPaths.length > 0
        ? this.musicPaths
        : (musicPath ? [musicPath] : [path.dirname(this.seratoPath)]);

      // Build path resolver index across all music locations
      logger.info('Building file index for intelligent path resolution...');
      this.indexingStatus.progress.message = 'Building file index across music locations...';
      this._emitProgress({ message: 'Building file index across music locations...' });

      await pathResolver.buildIndex(pathsToScan);
      const indexStats = pathResolver.getStats();
      this.indexingStatus.progress.filesIndexed = indexStats.filenameIndexSize;
      this._emitProgress({ filesIndexed: indexStats.filenameIndexSize });

      // Try to parse database V2 first for accurate track list with metadata
      this.indexingStatus.progress.phase = 'parsing_database';
      this.indexingStatus.progress.message = 'Parsing Serato database...';
      this._emitProgress({ phase: 'parsing_database', message: 'Parsing Serato database...' });

      const trackMetadata = await this._parseDatabaseV2();

      if (trackMetadata && trackMetadata.length > 0) {
        // Database parsing succeeded - use track metadata
        logger.info(`Found ${trackMetadata.length} tracks in Serato database`);
        this.indexingStatus.progress.message = `Resolving paths for ${trackMetadata.length} tracks...`;
        this._emitProgress({ message: `Resolving paths for ${trackMetadata.length} tracks...` });

        let resolved = 0;
        let notFound = 0;

        // Create all promises upfront for true concurrent execution
        // p-limit will queue and execute up to 100 concurrently
        const promises = trackMetadata.map(metadata =>
          this.fileOpLimit(async () => {
            let trackPath = metadata.filePath;

            try {
              // First, verify if exact path exists
              await fs.stat(trackPath);
            } catch (error) {
              // File doesn't exist at exact path - try intelligent resolution
              logger.debug(`Resolving moved/missing file: ${trackPath}`);
              const resolvedPath = await pathResolver.resolvePath(trackPath, metadata);

              if (resolvedPath) {
                trackPath = resolvedPath;
                resolved++; // Note: Minor race condition acceptable for statistics
                logger.debug(`Resolved: ${metadata.filePath} -> ${resolvedPath}`);
              } else {
                notFound++; // Note: Minor race condition acceptable for statistics
                logger.debug(`Could not resolve: ${metadata.filePath}`);
                return; // Skip tracks that can't be resolved
              }
            }

            // Create track object
            // Skip metadata extraction since we already have it from database
            const track = await this._createTrackObject(trackPath, true);
            if (track) {
              // Merge database metadata with track object
              track.bpm = metadata.bpm || track.bpm;
              track.key = metadata.key || track.key;
              tracksMap.set(trackPath, track); // Map operations are safe in single-threaded JS
              this.trackCache.set(track.id, track); // Add to track cache for instant lookups
            }

            // Emit progress every 100 completed tracks
            if (tracksMap.size % 100 === 0) {
              this.indexingStatus.progress.tracksFound = tracksMap.size;
              this.indexingStatus.progress.tracksResolved = resolved;
              this.indexingStatus.progress.tracksNotFound = notFound;
              this.indexingStatus.progress.message = `Processed ${tracksMap.size}/${trackMetadata.length} tracks (${resolved} resolved)`;
              this._emitProgress({
                tracksFound: tracksMap.size,
                tracksResolved: resolved,
                tracksNotFound: notFound,
                message: `Processed ${tracksMap.size}/${trackMetadata.length} tracks`
              });
            }
          })
        );

        // Wait for all promises to complete
        await Promise.all(promises);

        this.indexingStatus.progress.tracksFound = tracksMap.size;
        this.indexingStatus.progress.tracksResolved = resolved;
        this.indexingStatus.progress.tracksNotFound = notFound;
        logger.info(`Found ${tracksMap.size} tracks from database (${resolved} resolved via path matching, ${notFound} not found)`);
      } else {
        logger.info('Database V2 parsing failed or returned no tracks');
      }

      // Scan all music directories to catch any files not in the database
      this.indexingStatus.progress.phase = 'scanning';
      this.indexingStatus.progress.message = `Scanning ${pathsToScan.length} music location(s)...`;
      this._emitProgress({ phase: 'scanning', message: `Scanning ${pathsToScan.length} music location(s)...` });
      logger.info(`Scanning ${pathsToScan.length} music location(s) for additional tracks...`);
      let addedFromScan = 0;

      for (const scanPath of pathsToScan) {
        this.indexingStatus.progress.currentPath = scanPath;
        this.indexingStatus.progress.message = `Scanning: ${scanPath}`;
        this._emitProgress({ currentPath: scanPath, message: `Scanning: ${scanPath}` });
        logger.info(`Scanning: ${scanPath}`);

        // Extract metadata for scanned tracks since they're not in the database
        const scannedTracks = await this._scanDirectory(scanPath, true);

        for (const track of scannedTracks) {
          if (!tracksMap.has(track.filePath)) {
            tracksMap.set(track.filePath, track);
            this.trackCache.set(track.id, track); // Add to track cache for instant lookups
            addedFromScan++;
          }
        }
      }

      logger.info(`Found ${addedFromScan} additional tracks from directory scan`);

      const tracks = Array.from(tracksMap.values());
      logger.success(`Total library: ${tracks.length} tracks`);

      this.cache.set(cacheKey, tracks);

      // Mark indexing as complete
      this.indexingStatus.isIndexing = false;
      this.indexingStatus.isComplete = true;
      this.indexingStatus.endTime = Date.now();
      this.indexingStatus.progress.phase = 'complete';
      this.indexingStatus.progress.tracksFound = tracks.length;
      this.indexingStatus.progress.message = `Indexing complete! Found ${tracks.length} tracks`;
      this._emitProgress({
        phase: 'complete',
        tracksFound: tracks.length,
        message: `Indexing complete! Found ${tracks.length} tracks`
      });

      // Emit event for waiting callers
      this.emit('indexing:complete', tracks);

      return tracks;
    } catch (error) {
      logger.error('Error parsing library:', error.message);
      this.indexingStatus.isIndexing = false;
      this.indexingStatus.progress.phase = 'error';
      this.indexingStatus.progress.message = `Error: ${error.message}`;
      this._emitProgress({ phase: 'error', message: `Error: ${error.message}` });
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

      // Match tracks by file path (with intelligent resolution for moved files)
      const tracks = [];
      for (const trackPath of trackPaths) {
        // Try exact match first (fastest)
        let track = library.find(t => t.filePath === trackPath);

        // If no exact match, try resolving the path
        if (!track) {
          const resolvedPath = await pathResolver.resolvePath(trackPath);
          if (resolvedPath) {
            track = library.find(t => t.filePath === resolvedPath);
            if (track) {
              logger.debug(`Crate track resolved: ${trackPath} -> ${resolvedPath}`);
            }
          }
        }

        if (track) {
          tracks.push(track);
        } else {
          logger.debug(`Crate track not found in library: ${trackPath}`);
        }
      }

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
   * Checks cache first for O(1) lookup without blocking on indexing
   */
  async getTrackById(trackId) {
    // Check track cache first (instant O(1) lookup)
    if (this.trackCache.has(trackId)) {
      logger.debug(`Track ${trackId} found in cache (instant lookup)`);
      return this.trackCache.get(trackId);
    }

    // If not in cache, fall back to library search
    // This will only happen if indexing hasn't started or track doesn't exist
    logger.debug(`Track ${trackId} not in cache, searching library...`);
    const library = await this.parseLibrary();
    const track = library.find(t => t.id === trackId);

    // Add to cache if found
    if (track) {
      this.trackCache.set(track.id, track);
    }

    return track || null;
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
      // If invalidating library, also clear track cache
      if (item === 'library') {
        this.trackCache.clear();
        logger.debug('Track cache cleared');
      }
    } else {
      this.cache.clear();
      this.trackCache.clear();
      logger.debug('All caches cleared (library + track cache)');
    }
  }

  /**
   * Generate consistent track ID from metadata
   * Uses pathResolver to create stable IDs based on artist+title+duration
   * This ensures track IDs remain stable even when file paths change
   */
  generateTrackId(metadata) {
    return pathResolver.generateTrackId(metadata);
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
   * Scan directory recursively for audio files with circular symlink detection
   * @private
   */
  async _scanDirectory(dirPath, extractMetadata = true, tracks = [], visited = new Set()) {
    try {
      // Resolve to real path to detect circular symlinks
      let realPath;
      try {
        realPath = await fs.realpath(dirPath);
      } catch (error) {
        // If realpath fails, use original path (might be permission issue)
        logger.debug(`Could not resolve real path for ${dirPath}, using original path`);
        realPath = dirPath;
      }

      // Check if we've already visited this path (circular symlink detection)
      if (visited.has(realPath)) {
        logger.warn(`Circular symlink detected, skipping: ${dirPath}`);
        return tracks;
      }

      visited.add(realPath);

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        // Skip _Serato_ directory to avoid recursion
        if (entry.name === '_Serato_') {
          continue;
        }

        if (entry.isDirectory()) {
          await this._scanDirectory(fullPath, extractMetadata, tracks, visited);
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

      // Build track object with metadata defaults
      const trackData = {
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
        trackNumber: metadata?.trackNumber || null,
        fileSize: stats.size,
        format: metadata?.format || ext.substring(1).toUpperCase(),
        addedAt: stats.birthtime,
        // Path verification metadata (set during indexing)
        verifiedPath: filePath, // The verified, working path
        pathVerifiedAt: Date.now(), // When we last verified this path exists
      };

      // Generate stable ID from metadata (not file path)
      trackData.id = this.generateTrackId(trackData);

      return trackData;
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
