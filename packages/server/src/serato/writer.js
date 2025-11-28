const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Custom error classes
 */
class ReadOnlyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReadOnlyError';
  }
}

class CrateExistsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrateExistsError';
  }
}

class TrackNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrackNotFoundError';
  }
}

/**
 * Serato Writer - Write to Serato crate files
 * Implements full binary format for Serato ScratchLive/DJ Pro compatibility
 */
class SeratoWriter {
  constructor(seratoPath, parser) {
    this.seratoPath = seratoPath;
    this.cratesDir = path.join(seratoPath, 'Subcrates');
    this.parser = parser;
    this.readOnly = false;

    // Serato crate version string
    this.version = '1.0/Serato ScratchLive Crate';
  }

  /**
   * Set read-only mode
   */
  setReadOnly(readOnly) {
    this.readOnly = readOnly;
    logger.info(`Writer mode: ${readOnly ? 'Read-only' : 'Read-write'}`);
  }

  /**
   * Check if in read-only mode
   */
  checkReadOnly() {
    if (this.readOnly) {
      throw new ReadOnlyError('Writer is in read-only mode');
    }
  }

  /**
   * Validate crate name
   */
  validateCrateName(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Crate name must be a non-empty string');
    }

    if (name.length > 100) {
      throw new Error('Crate name too long (max 100 characters)');
    }

    // Serato doesn't allow certain characters in crate names
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(name)) {
      throw new Error('Crate name contains invalid characters');
    }

    return true;
  }

  /**
   * Generate crate filename from name
   */
  getCrateFilename(name) {
    return `${name}.crate`;
  }

  /**
   * Get full path to crate file
   */
  getCratePath(name) {
    return path.join(this.cratesDir, this.getCrateFilename(name));
  }

  /**
   * Create backup of crate file
   */
  async backupCrate(crateName) {
    const cratePath = this.getCratePath(crateName);

    if (!fsSync.existsSync(cratePath)) {
      return null; // No file to backup
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = `${cratePath}.backup-${timestamp}`;

    await fs.copyFile(cratePath, backupPath);
    logger.success(`Created backup: ${path.basename(backupPath)}`);

    return backupPath;
  }

  /**
   * Write UTF-16 string to buffer
   */
  writeUTF16String(str) {
    const buf = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16BE(str.charCodeAt(i), i * 2);
    }
    return buf;
  }

  /**
   * Write tag with length and data
   */
  writeTag(tag, data) {
    const tagBuf = Buffer.from(tag, 'ascii'); // 4 bytes
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(data.length, 0);

    return Buffer.concat([tagBuf, lengthBuf, data]);
  }

  /**
   * Build version header
   */
  buildVersionHeader() {
    const versionStr = this.writeUTF16String(this.version);
    return this.writeTag('vrsn', versionStr);
  }

  /**
   * Build sorting section
   */
  buildSortingSection() {
    // Default sorting configuration
    // Format: tvcn (column name) + brev (reverse flag)
    const columnName = this.writeUTF16String('bpm');
    const tvcnTag = this.writeTag('tvcn', columnName);

    const brevBuf = Buffer.from([0x01]); // Reverse sort
    const brevTag = this.writeTag('brev', brevBuf);

    const sortData = Buffer.concat([tvcnTag, brevTag]);
    return this.writeTag('osrt', sortData);
  }

  /**
   * Build column definition
   */
  buildColumnDefinition(name, width = 0x30) {
    const columnName = this.writeUTF16String(name);
    const tvcnTag = this.writeTag('tvcn', columnName);

    const widthBuf = Buffer.alloc(2);
    widthBuf.writeUInt16BE(width, 0);
    const tvcwTag = this.writeTag('tvcw', widthBuf);

    return Buffer.concat([tvcnTag, tvcwTag]);
  }

  /**
   * Build all column definitions
   */
  buildColumnsSection() {
    const columns = [
      { name: 'bpm', width: 0x30 },
      { name: 'year', width: 0x30 },
      { name: 'song', width: 0x30 },
      { name: 'playCount', width: 0x30 },
      { name: 'artist', width: 0xFA }, // 250 pixels
      { name: 'genre', width: 0x30 },
      { name: 'length', width: 0x30 },
    ];

    const columnBuffers = columns.map(col => {
      const colDef = this.buildColumnDefinition(col.name, col.width);
      return this.writeTag('ovct', colDef);
    });

    return Buffer.concat(columnBuffers);
  }

  /**
   * Build track entry
   */
  buildTrackEntry(trackPath) {
    const pathStr = this.writeUTF16String(trackPath);
    return this.writeTag('ptrk', pathStr);
  }

  /**
   * Build tracks section
   * Each track needs its own otrk wrapper containing the ptrk tag
   */
  buildTracksSection(tracks) {
    if (!tracks || tracks.length === 0) {
      return Buffer.alloc(0); // No tracks = no otrk tags
    }

    // Each track gets wrapped in its own otrk tag
    const trackBuffers = tracks.map(track => {
      const ptrkTag = this.buildTrackEntry(track.filePath);
      return this.writeTag('otrk', ptrkTag);
    });

    return Buffer.concat(trackBuffers);
  }

  /**
   * Build complete crate binary
   */
  buildCrateBinary(crateName, tracks = []) {
    const versionHeader = this.buildVersionHeader();
    const sortingSection = this.buildSortingSection();
    const columnsSection = this.buildColumnsSection();
    const tracksSection = this.buildTracksSection(tracks);

    return Buffer.concat([
      versionHeader,
      sortingSection,
      columnsSection,
      tracksSection,
    ]);
  }

  /**
   * Write file atomically (temp file + rename)
   */
  async writeAtomic(filePath, data) {
    const tempPath = `${filePath}.tmp`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, data);

      // Atomic rename
      await fs.rename(tempPath, filePath);

      logger.success(`Wrote file: ${path.basename(filePath)}`);
    } catch (error) {
      // Clean up temp file on error
      try {
        await fs.unlink(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Create a new crate
   */
  async createCrate(name, color = null) {
    this.checkReadOnly();
    this.validateCrateName(name);

    const cratePath = this.getCratePath(name);

    // Check if crate already exists
    if (fsSync.existsSync(cratePath)) {
      throw new CrateExistsError(`Crate "${name}" already exists`);
    }

    logger.info(`Creating crate: ${name}`);

    // Build empty crate
    const crateData = this.buildCrateBinary(name, []);

    // Write atomically
    await this.writeAtomic(cratePath, crateData);

    // Invalidate parser cache
    this.parser.invalidateCache();

    logger.success(`Created crate: ${name}`);

    return {
      id: this.parser.slugify(name),
      name,
      trackCount: 0,
      color,
    };
  }

  /**
   * Add tracks to a crate
   */
  async addTracksToCrate(crateId, trackIds) {
    this.checkReadOnly();

    logger.info(`Adding ${trackIds.length} tracks to crate: ${crateId}`);

    // Parse existing crate
    const crate = await this.parser.parseCrate(crateId);
    const cratePath = this.getCratePath(crate.name);

    // Backup existing crate
    await this.backupCrate(crate.name);

    // Get track details
    const newTracks = [];
    for (const trackId of trackIds) {
      const track = await this.parser.getTrackById(trackId);
      if (!track) {
        throw new TrackNotFoundError(`Track not found: ${trackId}`);
      }

      // Skip if track already in crate (check by file path, not ID)
      const alreadyExists = crate.tracks.some(t => t.filePath === track.filePath);
      if (!alreadyExists) {
        newTracks.push(track);
      }
    }

    // Combine existing and new tracks
    const allTracks = [...crate.tracks, ...newTracks];

    // Build updated crate
    const crateData = this.buildCrateBinary(crate.name, allTracks);

    // Write atomically
    await this.writeAtomic(cratePath, crateData);

    // Invalidate cache
    this.parser.invalidateCache(`crate-${crateId}`);
    this.parser.invalidateCache('crates-list'); // Invalidate list to update track counts

    logger.success(`Added ${newTracks.length} tracks (skipped ${trackIds.length - newTracks.length} duplicates)`);

    return {
      added: newTracks.length,
      skipped: trackIds.length - newTracks.length,
      total: allTracks.length,
    };
  }

  /**
   * Remove track from crate
   */
  async removeTrackFromCrate(crateId, trackId) {
    this.checkReadOnly();

    logger.info(`Removing track ${trackId} from crate: ${crateId}`);

    // Parse existing crate
    const crate = await this.parser.parseCrate(crateId);
    const cratePath = this.getCratePath(crate.name);

    // Backup existing crate
    await this.backupCrate(crate.name);

    // Remove track
    const updatedTracks = crate.tracks.filter(t => t.id !== trackId);

    if (updatedTracks.length === crate.tracks.length) {
      logger.warn(`Track ${trackId} not found in crate`);
      return { removed: false };
    }

    // Build updated crate
    const crateData = this.buildCrateBinary(crate.name, updatedTracks);

    // Write atomically
    await this.writeAtomic(cratePath, crateData);

    // Invalidate cache
    this.parser.invalidateCache(`crate-${crateId}`);
    this.parser.invalidateCache('crates-list'); // Invalidate list to update track counts

    logger.success(`Removed track from crate`);

    return {
      removed: true,
      remainingTracks: updatedTracks.length,
    };
  }

  /**
   * Delete a crate
   */
  async deleteCrate(crateId) {
    this.checkReadOnly();

    logger.info(`Deleting crate: ${crateId}`);

    // Parse crate to get name
    const crate = await this.parser.parseCrate(crateId);
    const cratePath = this.getCratePath(crate.name);

    // Backup before deleting
    const backupPath = await this.backupCrate(crate.name);

    // Delete crate file
    await fs.unlink(cratePath);

    // Invalidate cache
    this.parser.invalidateCache();

    logger.success(`Deleted crate: ${crate.name} (backup: ${path.basename(backupPath)})`);

    return {
      deleted: true,
      backup: backupPath,
    };
  }
}

module.exports = {
  SeratoWriter,
  ReadOnlyError,
  CrateExistsError,
  TrackNotFoundError,
};
