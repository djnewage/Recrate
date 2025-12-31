/**
 * BaseParser - Abstract base class for DJ software library parsers
 *
 * All DJ software parsers (Serato, Traktor, rekordbox, Virtual DJ) must extend
 * this class and implement its abstract methods.
 */

const EventEmitter = require('events');

/**
 * Custom error classes for parser operations
 */
class LibraryNotFoundError extends Error {
  constructor(message = 'DJ library not found') {
    super(message);
    this.name = 'LibraryNotFoundError';
  }
}

class ParseError extends Error {
  constructor(message = 'Failed to parse library data') {
    super(message);
    this.name = 'ParseError';
  }
}

class CrateNotFoundError extends Error {
  constructor(crateId) {
    super(`Crate not found: ${crateId}`);
    this.name = 'CrateNotFoundError';
    this.crateId = crateId;
  }
}

class TrackNotFoundError extends Error {
  constructor(trackId) {
    super(`Track not found: ${trackId}`);
    this.name = 'TrackNotFoundError';
    this.trackId = trackId;
  }
}

/**
 * Abstract base class for DJ library parsers
 * @extends EventEmitter
 */
class BaseParser extends EventEmitter {
  /**
   * @param {string} libraryPath - Path to DJ library
   * @param {string|string[]} musicPaths - Path(s) to music files
   * @param {Object} cacheConfig - Cache configuration
   * @param {number} [cacheConfig.maxSize=1000] - Max cache entries
   * @param {number} [cacheConfig.ttl=3600000] - Cache TTL in ms
   */
  constructor(libraryPath, musicPaths, cacheConfig = {}) {
    super();

    if (new.target === BaseParser) {
      throw new Error('BaseParser is abstract and cannot be instantiated directly');
    }

    this.libraryPath = libraryPath;
    this.musicPaths = Array.isArray(musicPaths) ? musicPaths : [musicPaths];
    this.cacheConfig = {
      maxSize: cacheConfig.maxSize || 1000,
      ttl: cacheConfig.ttl || 3600000
    };

    // Indexing state
    this.indexingStatus = {
      isIndexing: false,
      isComplete: false,
      startTime: null,
      endTime: null,
      duration: null,
      progress: {
        phase: 'idle',
        current: 0,
        total: 0,
        message: ''
      }
    };

    // WebSocket reference for progress updates
    this.io = null;
  }

  /**
   * Get the DJ software type this parser handles
   * @abstract
   * @returns {string} - One of: 'serato', 'traktor', 'rekordbox', 'virtualdj'
   */
  static get softwareType() {
    throw new Error('softwareType getter must be implemented by subclass');
  }

  /**
   * Get display name for this DJ software
   * @abstract
   * @returns {string}
   */
  static get displayName() {
    throw new Error('displayName getter must be implemented by subclass');
  }

  /**
   * Verify the library path exists and is valid
   * @abstract
   * @returns {Promise<boolean>}
   */
  async verifyLibraryPath() {
    throw new Error('verifyLibraryPath() must be implemented by subclass');
  }

  /**
   * Parse and return all tracks from the library
   * @abstract
   * @param {string} [musicPath] - Optional specific music path to scan
   * @returns {Promise<Track[]>}
   */
  async parseLibrary(musicPath = null) {
    throw new Error('parseLibrary() must be implemented by subclass');
  }

  /**
   * Get all crates/playlists from the library
   * @abstract
   * @returns {Promise<Crate[]>}
   */
  async getAllCrates() {
    throw new Error('getAllCrates() must be implemented by subclass');
  }

  /**
   * Parse a specific crate and return its tracks
   * @abstract
   * @param {string} crateId - Crate identifier
   * @returns {Promise<CrateWithTracks>}
   */
  async parseCrate(crateId) {
    throw new Error('parseCrate() must be implemented by subclass');
  }

  /**
   * Get a single track by ID
   * @abstract
   * @param {string} trackId - Track identifier
   * @returns {Promise<Track|null>}
   */
  async getTrackById(trackId) {
    throw new Error('getTrackById() must be implemented by subclass');
  }

  /**
   * Search tracks by query
   * @abstract
   * @param {string} query - Search query
   * @param {string} [field='all'] - Field to search: 'all', 'title', 'artist', 'album'
   * @returns {Promise<Track[]>}
   */
  async searchTracks(query, field = 'all') {
    throw new Error('searchTracks() must be implemented by subclass');
  }

  /**
   * Get a crate by ID (without tracks)
   * @abstract
   * @param {string} crateId - Crate identifier
   * @returns {Promise<Crate|null>}
   */
  async getCrateById(crateId) {
    throw new Error('getCrateById() must be implemented by subclass');
  }

  /**
   * Start background indexing of the library
   * Default implementation just parses the library synchronously.
   * Subclasses can override for async/background indexing.
   * @returns {Promise<void>}
   */
  async startBackgroundIndexing() {
    // Default: just parse the library (non-background)
    try {
      await this.parseLibrary();
      this.indexingStatus = {
        isIndexing: false,
        progress: 100,
        currentPhase: 'complete',
        tracksIndexed: 0,
        totalTracks: 0
      };
    } catch (error) {
      this.indexingStatus = {
        isIndexing: false,
        progress: 0,
        currentPhase: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get current indexing status
   * @returns {Object}
   */
  getIndexingStatus() {
    return { ...this.indexingStatus };
  }

  /**
   * Invalidate cache entries
   * @abstract
   * @param {string|null} [item=null] - Specific item to invalidate, or null for all
   */
  invalidateCache(item = null) {
    throw new Error('invalidateCache() must be implemented by subclass');
  }

  /**
   * Set WebSocket instance for progress updates
   * @param {Object} io - Socket.IO instance
   */
  setWebSocket(io) {
    this.io = io;
  }

  /**
   * Emit progress update via WebSocket
   * @protected
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitProgress(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
    this.emit(event, data);
  }

  /**
   * Generate a stable track ID from metadata
   * @param {Object} metadata - Track metadata
   * @returns {string}
   */
  generateTrackId(metadata) {
    const { createHash } = require('crypto');
    const input = `${metadata.artist || ''}|${metadata.title || ''}|${metadata.duration || 0}`;
    return createHash('md5').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Convert a name to a URL-friendly slug
   * @param {string} name - Name to slugify
   * @returns {string}
   */
  slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

module.exports = {
  BaseParser,
  LibraryNotFoundError,
  ParseError,
  CrateNotFoundError,
  TrackNotFoundError
};
