/**
 * IMPLEMENTATION SPEC: Serato Writer Module
 * 
 * This file provides detailed specifications for implementing the Serato writer.
 * Use this as a guide for Claude Code to build src/serato/writer.js
 */

// =============================================================================
// MODULE: src/serato/writer.js
// =============================================================================

/**
 * Class: SeratoWriter
 * 
 * Responsible for writing to Serato crate files while maintaining format compatibility.
 * 
 * IMPORTANT: This module modifies Serato's files directly. Must be extremely careful
 * to preserve binary format and use atomic writes to prevent corruption.
 */

class SeratoWriter {
  /**
   * Constructor
   * @param {string} seratoPath - Path to Serato directory
   * @param {SeratoParser} parser - Parser instance for reading
   */
  constructor(seratoPath, parser) {
    this.seratoPath = seratoPath;
    this.cratesPath = path.join(seratoPath, 'Subcrates');
    this.parser = parser;
    this.readOnly = false;
  }

  /**
   * Method: createCrate
   * 
   * Create a new Serato crate file.
   * 
   * Implementation Steps:
   * 1. Validate crate name (no special chars, max length)
   * 2. Check if crate already exists
   * 3. Generate empty crate binary structure
   * 4. Write to .crate file atomically
   * 5. Verify file was created successfully
   * 6. Return crate metadata
   * 
   * @param {string} name - Crate name
   * @param {string} color - Optional hex color code
   * @returns {Promise<CrateMeta>}
   * 
   * Binary Structure:
   * [Header]
   *   - Magic bytes
   *   - Version
   * [Metadata]
   *   - Crate name (UTF-16 string)
   *   - Color (if present)
   * [Track List]
   *   - Count: 0
   *   - Entries: []
   * 
   * Error Handling:
   * - Throw if read-only mode
   * - Throw if crate name exists
   * - Throw if invalid color code
   * - Rollback on write failure
   */
  async createCrate(name, color = null) {
    // Implementation here
  }

  /**
   * Method: addTracksToChrate
   * 
   * Add one or more tracks to an existing crate.
   * 
   * Implementation Steps:
   * 1. Check read-only mode
   * 2. Parse existing crate
   * 3. Validate all track IDs exist
   * 4. Check for duplicates
   * 5. Append new tracks to track list
   * 6. Rebuild crate binary structure
   * 7. Write atomically (temp file + rename)
   * 8. Invalidate parser cache
   * 9. Return updated crate info
   * 
   * @param {string} crateId - Crate ID or name
   * @param {Array<string>} trackIds - Array of track IDs to add
   * @returns {Promise<{ added: number, skipped: number, total: number }>}
   * 
   * Behavior:
   * - Skip tracks already in crate (don't error)
   * - Maintain existing track order
   * - Append new tracks to end
   * - Update modification timestamp
   * 
   * Error Handling:
   * - Throw CrateNotFoundError if crate doesn't exist
   * - Throw TrackNotFoundError if any track ID invalid
   * - Rollback on write failure
   */
  async addTracksToCrate(crateId, trackIds) {
    // Implementation here
  }

  /**
   * Method: removeTrackFromCrate
   * 
   * Remove a track from a crate.
   * 
   * @param {string} crateId - Crate ID or name
   * @param {string} trackId - Track ID to remove
   * @returns {Promise<{ removed: boolean, trackCount: number }>}
   * 
   * Implementation:
   * 1. Parse existing crate
   * 2. Find track in list
   * 3. Remove from array
   * 4. Rebuild and write crate
   * 5. Return success status
   * 
   * Behavior:
   * - Return success=false if track not in crate (don't error)
   */
  async removeTrackFromCrate(crateId, trackId) {
    // Implementation here
  }

  /**
   * Method: reorderCrate
   * 
   * Change the order of tracks in a crate.
   * 
   * @param {string} crateId - Crate ID
   * @param {Array<string>} orderedTrackIds - Track IDs in desired order
   * @returns {Promise<CrateMeta>}
   * 
   * Implementation:
   * 1. Validate all track IDs exist in crate
   * 2. Rebuild crate with new order
   * 3. Write atomically
   * 
   * Error:
   * - Throw if track IDs don't match crate contents
   */
  async reorderCrate(crateId, orderedTrackIds) {
    // Implementation here
  }

  /**
   * Method: deleteCrate
   * 
   * Delete a crate file.
   * 
   * @param {string} crateId - Crate ID to delete
   * @returns {Promise<boolean>}
   * 
   * Implementation:
   * 1. Check read-only mode
   * 2. Locate crate file
   * 3. Delete file
   * 4. Invalidate cache
   * 
   * Safety:
   * - Only deletes the .crate file
   * - Does NOT delete audio files
   * - Consider backup before delete
   */
  async deleteCrate(crateId) {
    // Implementation here
  }

  /**
   * Method: updateCrateMetadata
   * 
   * Update crate name or color.
   * 
   * @param {string} crateId - Crate ID
   * @param {Object} updates - { name?: string, color?: string }
   * @returns {Promise<CrateMeta>}
   * 
   * Implementation:
   * 1. Parse existing crate
   * 2. Apply updates
   * 3. If name changed, rename file
   * 4. Rebuild binary structure
   * 5. Write atomically
   */
  async updateCrateMetadata(crateId, updates) {
    // Implementation here
  }

  /**
   * Helper Method: buildCrateBinary
   * 
   * Build binary structure for a crate.
   * 
   * @param {Object} crate - Crate data
   * @returns {Buffer}
   * 
   * Structure:
   * - Header (magic, version)
   * - Name (length-prefixed UTF-16)
   * - Color (if present)
   * - Track count (4 bytes)
   * - Track entries (file paths as length-prefixed strings)
   */
  buildCrateBinary(crate) {
    // Implementation here
  }

  /**
   * Helper Method: writeAtomic
   * 
   * Write file atomically to prevent corruption.
   * 
   * @param {string} filePath - Target file path
   * @param {Buffer} data - Data to write
   * @returns {Promise<void>}
   * 
   * Implementation:
   * 1. Write to temp file (filePath + '.tmp')
   * 2. Sync to disk
   * 3. Rename temp to target (atomic operation)
   * 4. Delete temp on failure
   * 
   * This ensures file is never in a half-written state
   */
  async writeAtomic(filePath, data) {
    // Implementation here
  }

  /**
   * Method: setReadOnly
   * 
   * Enable/disable read-only mode.
   * 
   * @param {boolean} readOnly
   * 
   * When enabled:
   * - All write operations throw ReadOnlyError
   * - Useful when Serato is running
   */
  setReadOnly(readOnly) {
    this.readOnly = readOnly;
  }

  /**
   * Helper Method: checkReadOnly
   * 
   * Throw error if in read-only mode.
   * Call at start of all write operations.
   */
  checkReadOnly() {
    if (this.readOnly) {
      throw new ReadOnlyError('Cannot write in read-only mode');
    }
  }

  /**
   * Method: backupCrate
   * 
   * Create a backup of a crate before modifying.
   * 
   * @param {string} crateId
   * @returns {Promise<string>} - Backup file path
   * 
   * Saves to: [crateName].crate.backup.[timestamp]
   */
  async backupCrate(crateId) {
    // Implementation here
  }
}

// =============================================================================
// BINARY WRITING UTILITIES
// =============================================================================

/**
 * Write a length-prefixed UTF-16 string to buffer
 * @param {string} str
 * @returns {Buffer}
 */
function writeString(str) {
  // 1. Encode string as UTF-16
  // 2. Get byte length
  // 3. Create buffer with length prefix (4 bytes) + string data
  // 4. Return buffer
}

/**
 * Write a 32-bit integer (big-endian)
 * @param {number} value
 * @returns {Buffer}
 */
function writeInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

/**
 * Concatenate multiple buffers
 * @param {Array<Buffer>} buffers
 * @returns {Buffer}
 */
function concatBuffers(buffers) {
  return Buffer.concat(buffers);
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

class ReadOnlyError extends Error {
  constructor(message = 'Operation not allowed in read-only mode') {
    super(message);
    this.name = 'ReadOnlyError';
    this.code = 'READ_ONLY';
  }
}

class CrateExistsError extends Error {
  constructor(name) {
    super(`Crate already exists: ${name}`);
    this.name = 'CrateExistsError';
    this.code = 'CRATE_EXISTS';
  }
}

class TrackNotFoundError extends Error {
  constructor(trackId) {
    super(`Track not found: ${trackId}`);
    this.name = 'TrackNotFoundError';
    this.code = 'TRACK_NOT_FOUND';
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate crate name
 * @param {string} name
 * @throws {Error} if invalid
 */
function validateCrateName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Crate name is required');
  }
  if (name.length > 255) {
    throw new Error('Crate name too long (max 255 chars)');
  }
  // Check for invalid filename characters
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/;
  if (invalidChars.test(name)) {
    throw new Error('Crate name contains invalid characters');
  }
}

/**
 * Validate color code
 * @param {string} color
 * @throws {Error} if invalid
 */
function validateColor(color) {
  if (!color) return; // Color is optional
  
  const hexPattern = /^#[0-9A-F]{6}$/i;
  if (!hexPattern.test(color)) {
    throw new Error('Invalid color code (must be hex format: #RRGGBB)');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  SeratoWriter,
  ReadOnlyError,
  CrateExistsError,
  TrackNotFoundError,
  validateCrateName,
  validateColor
};

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/*
const { SeratoParser } = require('./parser');
const { SeratoWriter } = require('./writer');

const parser = new SeratoParser('/Users/dj/Music/_Serato_');
const writer = new SeratoWriter('/Users/dj/Music/_Serato_', parser);

// Create new crate
const crate = await writer.createCrate('Opening Set', '#4ECDC4');

// Add tracks
await writer.addTracksToCrate('opening-set', ['track-id-1', 'track-id-2']);

// Remove track
await writer.removeTrackFromCrate('opening-set', 'track-id-1');

// Delete crate
await writer.deleteCrate('opening-set');
*/
