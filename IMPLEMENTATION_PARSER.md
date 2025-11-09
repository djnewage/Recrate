/**
 * IMPLEMENTATION SPEC: Serato Parser Module
 * 
 * This file provides detailed specifications for implementing the Serato parser.
 * Use this as a guide for Claude Code to build src/serato/parser.js
 */

// =============================================================================
// MODULE: src/serato/parser.js
// =============================================================================

/**
 * Class: SeratoParser
 * 
 * Responsible for reading and parsing Serato database files and crate files.
 * 
 * Dependencies:
 * - fs/promises for async file operations
 * - path for path manipulation
 * - crypto for generating track IDs
 * - Potential: serato-js npm package (if compatible)
 */

class SeratoParser {
  /**
   * Constructor
   * @param {string} seratoPath - Path to Serato directory (e.g., ~/Music/_Serato_)
   */
  constructor(seratoPath) {
    this.seratoPath = seratoPath;
    this.databasePath = path.join(seratoPath, 'database V2');
    this.cratesPath = path.join(seratoPath, 'Subcrates');
    this.cache = {
      library: null,
      crates: new Map(),
      lastUpdate: null
    };
  }

  /**
   * Method: parseLibrary
   * 
   * Parse the main Serato database file and return all tracks.
   * 
   * Implementation Steps:
   * 1. Check if database file exists
   * 2. Read database V2 file as buffer
   * 3. Parse binary format:
   *    - Read header (magic number, version)
   *    - Extract track entries
   *    - Parse each track's metadata
   * 4. Build track objects
   * 5. Cache results
   * 6. Return array of tracks
   * 
   * @returns {Promise<Array<Track>>}
   * 
   * Track Object Shape:
   * {
   *   id: string,              // Generated from file path hash
   *   title: string,
   *   artist: string,
   *   album: string,
   *   genre: string,
   *   bpm: number,
   *   key: string,             // Musical key (e.g., "Am", "C#m")
   *   duration: number,        // Seconds
   *   filePath: string,        // Absolute path to audio file
   *   fileSize: number,        // Bytes
   *   format: string,          // File extension (mp3, flac, wav)
   *   bitrate: number,         // kbps
   *   addedAt: Date,
   *   lastModified: Date
   * }
   * 
   * Error Handling:
   * - Throw SeratoNotFoundError if directory doesn't exist
   * - Throw ParseError if database is corrupted
   * - Log warnings for individual track parsing failures
   */
  async parseLibrary() {
    // Implementation here
  }

  /**
   * Method: getAllCrates
   * 
   * List all crate files and return basic info.
   * 
   * Implementation Steps:
   * 1. Read Subcrates directory
   * 2. Filter for .crate files
   * 3. For each crate:
   *    - Parse crate name from filename
   *    - Get file stats (created, modified dates)
   *    - Quick parse to get track count
   * 4. Return array of crate metadata
   * 
   * @returns {Promise<Array<CrateMeta>>}
   * 
   * CrateMeta Object Shape:
   * {
   *   id: string,              // Slugified crate name
   *   name: string,            // Original crate name
   *   trackCount: number,
   *   color: string,           // Hex color code
   *   createdAt: Date,
   *   updatedAt: Date,
   *   filePath: string         // Path to .crate file
   * }
   */
  async getAllCrates() {
    // Implementation here
  }

  /**
   * Method: parseCrate
   * 
   * Parse a specific crate file and return full details including tracks.
   * 
   * Implementation Steps:
   * 1. Locate crate file by name or ID
   * 2. Read crate file as buffer
   * 3. Parse binary structure:
   *    - Read header
   *    - Extract track file paths
   *    - Parse color if present
   * 4. Look up full track info from library
   * 5. Maintain track order from crate
   * 6. Return crate object with tracks
   * 
   * @param {string} crateId - Crate ID or name
   * @returns {Promise<Crate>}
   * 
   * Crate Object Shape:
   * {
   *   id: string,
   *   name: string,
   *   trackCount: number,
   *   color: string,
   *   createdAt: Date,
   *   updatedAt: Date,
   *   tracks: Array<Track>     // Full track objects in order
   * }
   * 
   * Error Handling:
   * - Throw CrateNotFoundError if crate doesn't exist
   * - Handle missing tracks gracefully (track deleted but still in crate)
   */
  async parseCrate(crateId) {
    // Implementation here
  }

  /**
   * Method: getTrackById
   * 
   * Get a specific track by its ID.
   * 
   * @param {string} trackId - Track ID (hash of file path)
   * @returns {Promise<Track|null>}
   * 
   * Implementation:
   * 1. Check cache first
   * 2. Parse library if not cached
   * 3. Find track by ID
   * 4. Return track or null
   */
  async getTrackById(trackId) {
    // Implementation here
  }

  /**
   * Method: searchTracks
   * 
   * Search for tracks matching a query.
   * 
   * @param {string} query - Search query
   * @param {string} field - Optional field to search (title, artist, album, genre)
   * @returns {Promise<Array<Track>>}
   * 
   * Implementation:
   * 1. Get all tracks from library
   * 2. Filter based on query
   * 3. Search in: title, artist, album (unless field specified)
   * 4. Case-insensitive search
   * 5. Return matching tracks with relevance score
   */
  async searchTracks(query, field = null) {
    // Implementation here
  }

  /**
   * Helper Method: generateTrackId
   * 
   * Generate consistent track ID from file path.
   * 
   * @param {string} filePath - Absolute file path
   * @returns {string} - MD5 hash (first 16 chars)
   * 
   * Implementation:
   * Use crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16)
   */
  generateTrackId(filePath) {
    // Implementation here
  }

  /**
   * Helper Method: slugify
   * 
   * Convert crate name to ID-safe slug.
   * 
   * @param {string} name - Crate name
   * @returns {string} - Slugified name
   * 
   * Example: "Friday Night Bangers" -> "friday-night-bangers"
   */
  slugify(name) {
    // Implementation here
  }

  /**
   * Method: invalidateCache
   * 
   * Clear cache for specific item or all cache.
   * 
   * @param {string} item - Optional specific item to clear
   */
  invalidateCache(item = null) {
    // Implementation here
  }
}

// =============================================================================
// BINARY PARSING UTILITIES
// =============================================================================

/**
 * Helper Functions for Binary Parsing
 * 
 * These should be pure functions that handle low-level binary operations.
 */

/**
 * Read a length-prefixed UTF-16 string from buffer
 * @param {Buffer} buffer
 * @param {number} offset
 * @returns {{ value: string, bytesRead: number }}
 */
function readString(buffer, offset) {
  // 1. Read 4-byte length prefix
  // 2. Read UTF-16 string of that length
  // 3. Convert to JavaScript string
  // 4. Return value and bytes consumed
}

/**
 * Read a 32-bit integer (big-endian)
 * @param {Buffer} buffer
 * @param {number} offset
 * @returns {number}
 */
function readInt32(buffer, offset) {
  return buffer.readInt32BE(offset);
}

/**
 * Read a 32-bit float
 * @param {Buffer} buffer
 * @param {number} offset
 * @returns {number}
 */
function readFloat(buffer, offset) {
  return buffer.readFloatBE(offset);
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

class SeratoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SeratoError';
  }
}

class SeratoNotFoundError extends SeratoError {
  constructor(path) {
    super(`Serato directory not found: ${path}`);
    this.name = 'SeratoNotFoundError';
    this.code = 'SERATO_NOT_FOUND';
  }
}

class ParseError extends SeratoError {
  constructor(message) {
    super(`Parse error: ${message}`);
    this.name = 'ParseError';
    this.code = 'PARSE_ERROR';
  }
}

class CrateNotFoundError extends SeratoError {
  constructor(crateId) {
    super(`Crate not found: ${crateId}`);
    this.name = 'CrateNotFoundError';
    this.code = 'CRATE_NOT_FOUND';
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SERATO_COLORS = {
  '#FF0000': 'Red',
  '#FF8800': 'Orange',
  '#FFFF00': 'Yellow',
  '#88FF00': 'Green',
  '#00FF88': 'Teal',
  '#0088FF': 'Blue',
  '#8800FF': 'Purple',
  '#FF0088': 'Pink'
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  SeratoParser,
  SeratoError,
  SeratoNotFoundError,
  ParseError,
  CrateNotFoundError
};

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/*
const { SeratoParser } = require('./parser');

const parser = new SeratoParser('/Users/dj/Music/_Serato_');

// Get all tracks
const tracks = await parser.parseLibrary();

// Get all crates
const crates = await parser.getAllCrates();

// Get specific crate with tracks
const crate = await parser.parseCrate('friday-night-bangers');

// Search
const results = await parser.searchTracks('summer');
*/
