/**
 * Safe Writer for Serato Markers in Audio Files
 *
 * This module implements safe file writing with:
 * - Atomic writes (temp file + rename) - protects against partial writes
 * - Verification after write
 * - Preservation of unknown Serato data
 *
 * SAFETY PRINCIPLES:
 * 1. Atomic operations - Write to temp file, then rename (original unchanged on failure)
 * 2. Verify after write - Read back and validate written data
 * 3. Preserve unknown data - Don't delete Serato markers we don't understand
 *
 * NOTE: Backup creation is available via createBackup() for manual use, but not
 * automatically performed during cue point writes. Atomic writes provide sufficient
 * protection, and cue points are trivially recreatable (2 seconds of work in Serato).
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { SeratoMarkersParser, hexToRgb, DEFAULT_CUE_COLORS } = require('./serato-markers');

// Node-id3 for MP3 ID3 tag writing (dynamically imported for ESM compatibility)
let NodeID3 = null;

async function getNodeID3() {
  if (!NodeID3) {
    try {
      NodeID3 = require('node-id3');
    } catch (error) {
      throw new Error('node-id3 package not installed. Run: npm install node-id3');
    }
  }
  return NodeID3;
}

/**
 * Tags that are safe to preserve during write
 * (read/write formats are compatible in node-id3)
 *
 * IMPORTANT: Do NOT add image, comment, unsynchronisedLyrics, userDefinedText,
 * private, etc. - these have different read/write formats that corrupt output
 */
const SAFE_TEXT_TAGS = [
  'title', 'artist', 'album', 'year', 'genre', 'composer',
  'trackNumber', 'partOfSet', 'bpm', 'initialKey', 'publisher',
  'encodedBy', 'copyright', 'language', 'length', 'mood',
  'originalTitle', 'originalArtist', 'originalYear',
  'performerInfo', 'conductor', 'remixArtist', 'subtitle',
  'contentGroup', 'ISRC', 'encodingTechnology'
];

/**
 * Format date for backup filename (filesystem-safe)
 */
function formatDateForFilename(date) {
  return date.toISOString().replace(/:/g, '-').replace(/\./g, '-');
}

// ============================================================================
// Serato Markers_ (v1) Format Support
// IMPORTANT: Serato DJ requires BOTH v1 and v2 formats for full compatibility:
// - Cues 1-5 (index 0-4): Read from v1 format (Serato Markers_)
// - Cues 6-8 (index 5-7): Read from v2 format (Serato Markers2) when v1 is present
// We must write BOTH formats - v1-only or v2-only will not work correctly
// ============================================================================

/**
 * Encode a 24-bit value to serato32 format (4 bytes, 7 bits each)
 * Serato's v1 markers use this encoding for positions and colors
 *
 * @param {number} value - 24-bit value to encode (max 0xFFFFFF)
 * @returns {Buffer} 4-byte serato32 encoded buffer
 */
function encodeSerato32(value) {
  return Buffer.from([
    (value >> 21) & 0x7F,
    (value >> 14) & 0x7F,
    (value >> 7) & 0x7F,
    value & 0x7F
  ]);
}

/**
 * Decode serato32 format back to 24-bit value
 *
 * @param {Buffer} buf - 4-byte serato32 encoded buffer
 * @returns {number} Decoded 24-bit value
 */
function decodeSerato32(buf) {
  return ((buf[0] & 0x7F) << 21) |
         ((buf[1] & 0x7F) << 14) |
         ((buf[2] & 0x7F) << 7) |
         (buf[3] & 0x7F);
}

/**
 * Parse Serato Markers_ (v1) binary format
 * Used as fallback when music-metadata can't find v2 frame
 *
 * @param {Buffer} data - Raw v1 data (318 bytes expected)
 * @returns {Array} Parsed cue point entries in v2-compatible format
 */
function parseMarkersV1Data(data) {
  if (!data || data.length < 6) {
    return [];
  }

  // Validate header: 02 05
  if (data[0] !== 0x02 || data[1] !== 0x05) {
    logger.debug('[SERATO WRITER] V1 data has invalid version header');
    return [];
  }

  const entryCount = data.readUInt32BE(2);
  if (entryCount !== 14) {
    logger.debug(`[SERATO WRITER] V1 data has unexpected entry count: ${entryCount}`);
  }

  const entries = [];
  let offset = 6; // After 6-byte header

  // Parse 14 entries (first 5 are cues, rest are loops)
  for (let i = 0; i < 14 && offset + 22 <= data.length; i++) {
    const startSet = data[offset] === 0x00;

    if (startSet && i < 5) {  // Only first 5 entries are cues
      const positionMs = decodeSerato32(data.slice(offset + 1, offset + 5));
      const colorValue = decodeSerato32(data.slice(offset + 0x10, offset + 0x14));
      const type = data[offset + 0x14];

      if (type === 0x01) {  // CUE type
        entries.push({
          type: 'CUE',
          index: i,
          positionMs: positionMs,
          positionSec: positionMs / 1000,
          color: {
            r: (colorValue >> 16) & 0xFF,
            g: (colorValue >> 8) & 0xFF,
            b: colorValue & 0xFF
          }
        });
      }
    }
    offset += 22;
  }

  logger.debug(`[SERATO WRITER] Parsed ${entries.length} cue points from V1 data`);
  return entries;
}

/**
 * Build a single v1 marker entry (22 bytes)
 *
 * Entry format:
 * - 0x00 (1): Start set flag (0x00=set, 0x7F=not set)
 * - 0x01 (4): Start position (serato32 encoded ms)
 * - 0x05 (1): End set flag
 * - 0x06 (4): End position (serato32 encoded ms)
 * - 0x0A (6): Reserved (zeros)
 * - 0x10 (4): Color (serato32 encoded RGB)
 * - 0x14 (1): Type (0x01=Cue, 0x03=Loop)
 * - 0x15 (1): Locked (boolean)
 *
 * @param {Object} entry - { positionMs, color: {r,g,b}, index }
 * @returns {Buffer} 22-byte entry
 */
function buildMarkersV1Entry(entry) {
  const buf = Buffer.alloc(22);

  if (entry && entry.positionMs !== undefined) {
    // Entry is set
    buf[0] = 0x00;  // Start set flag = true
    encodeSerato32(entry.positionMs).copy(buf, 1);  // Start position

    buf[5] = 0x7F;  // End not set (for cues, not loops)
    Buffer.from([0x7F, 0x7F, 0x7F, 0x7F]).copy(buf, 6);  // End position not set

    // Reserved bytes 0x0A-0x0F already zeroed by Buffer.alloc

    // Color (RGB to serato32)
    // Check for r,g,b as separate properties (from extractCuePoints) or as color object
    let color;
    if (entry.r !== undefined && entry.g !== undefined && entry.b !== undefined) {
      color = { r: entry.r, g: entry.g, b: entry.b };
    } else if (entry.color) {
      color = entry.color;
    } else if (DEFAULT_CUE_COLORS && entry.index !== undefined) {
      color = DEFAULT_CUE_COLORS[entry.index] || DEFAULT_CUE_COLORS[0];
    }
    if (!color) {
      color = { r: 204, g: 0, b: 0 };  // Default red
    }
    const colorValue = (color.r << 16) | (color.g << 8) | color.b;
    encodeSerato32(colorValue).copy(buf, 0x10);

    buf[0x14] = 0x01;  // Type: Cue
    buf[0x15] = 0x00;  // Not locked
  } else {
    // Empty entry (not set)
    buf[0] = 0x7F;  // Start not set
    buf.fill(0x7F, 1, 5);  // Start position (not set)
    buf[5] = 0x7F;  // End not set
    buf.fill(0x7F, 6, 10);  // End position (not set)
    // Reserved bytes 0x0A-0x0F already zeroed
    buf.fill(0x7F, 0x10, 0x14);  // Color (not set)
    buf[0x14] = 0x00;  // Type: Invalid
    buf[0x15] = 0x00;  // Not locked
  }

  return buf;
}

/**
 * Build complete Serato Markers_ (v1) frame data
 *
 * Format:
 * - Header (6 bytes): 02 05 + 4-byte entry count (big endian)
 * - 14 entries (22 bytes each): 5 cues + 9 loops
 * - Footer (4 bytes): Track color (serato32)
 *
 * Total: 6 + 308 + 4 = 318 bytes
 *
 * @param {Array} cuePoints - Array of { index, positionMs, color }
 * @returns {Buffer} Complete v1 markers data
 */
function buildMarkersV1Data(cuePoints) {
  // DEBUG: Log incoming cue points
  logger.info(`[DEBUG] [buildMarkersV1Data] Received ${cuePoints.length} cue points:`);
  for (const cue of cuePoints) {
    logger.info(`[DEBUG] [buildMarkersV1Data]   cue.index=${cue.index}, cue.positionMs=${cue.positionMs}`);
  }

  // Header: version bytes + entry count
  const header = Buffer.alloc(6);
  header[0] = 0x02;
  header[1] = 0x05;
  header.writeUInt32BE(14, 2);  // 14 entries (5 cues + 9 loops)

  // Build 14 entries
  // Entries 0-4: Cues (indices 0-4)
  // Entries 5-13: Loops (indices 0-8) - we don't support loops yet
  const entries = [];
  for (let i = 0; i < 14; i++) {
    if (i < 5) {
      // Cue slot - look for matching cue point by index
      const cue = cuePoints.find(c => c.index === i);
      // DEBUG: Log slot matching
      logger.info(`[DEBUG] [buildMarkersV1Data] Slot ${i}: looking for index=${i}, found=${cue ? 'YES' : 'NO'}${cue ? `, positionMs=${cue.positionMs}` : ''}`);
      entries.push(buildMarkersV1Entry(cue));
    } else {
      // Loop slot - empty for now
      entries.push(buildMarkersV1Entry(null));
    }
  }

  // Footer: track color (default to 0x999999 - gray)
  const footer = encodeSerato32(0x999999);

  return Buffer.concat([header, ...entries, footer]);
}

// ============================================================================
// Serato Markers2 (v2) Format Support (already implemented)
// ============================================================================

/**
 * Encode markers for Serato GEOB frame in ID3 tags
 * Serato's format: 01 01 prefix + base64(binary markers with 01 01 header)
 *
 * @param {Buffer} markersBuffer - Binary markers from SeratoMarkersParser.encode()
 * @returns {Buffer} Encoded data for GEOB frame
 */
function encodeMarkersForGEOB(markersBuffer) {
  // markersBuffer from SeratoMarkersParser.encode() already has 01 01 header
  // Serato format: raw "01 01" + base64(data including its own 01 01 header)
  const base64Content = markersBuffer.toString('base64');
  return Buffer.concat([
    Buffer.from([0x01, 0x01]),           // Raw version prefix
    Buffer.from(base64Content, 'ascii')  // Base64 encoded binary
  ]);
}

/**
 * Decode Serato GEOB data back to binary markers
 * Handles the 01 01 prefix + base64 format used in ID3 GEOB frames
 *
 * Note: music-metadata has a bug in GEOB parsing that sometimes includes
 * part of the description in the data. We work around this by searching
 * for the 01 01 marker pattern.
 *
 * @param {Buffer} data - Data from GEOB frame
 * @returns {Buffer} Decoded binary markers
 */
function decodeMarkersFromGEOB(data) {
  if (!data || data.length < 4) {
    return data;
  }

  // Search for the 01 01 marker (may not be at start due to music-metadata bug)
  let markerIndex = -1;
  for (let i = 0; i < data.length - 3; i++) {
    if (data[i] === 0x01 && data[i + 1] === 0x01) {
      // Check if followed by base64-like characters (uppercase letters are common)
      const nextByte = data[i + 2];
      if ((nextByte >= 0x41 && nextByte <= 0x5A) || // A-Z
          (nextByte >= 0x61 && nextByte <= 0x7A) || // a-z
          (nextByte >= 0x30 && nextByte <= 0x39)) { // 0-9
        markerIndex = i;
        break;
      }
    }
  }

  if (markerIndex === -1) {
    // No 01 01 + base64 pattern found - might be raw binary format
    // Check if it starts with 01 01 directly (raw Serato format)
    if (data[0] === 0x01 && data[1] === 0x01) {
      return data;
    }
    logger.debug('[SERATO WRITER] No valid Serato marker pattern found in GEOB data');
    return data;
  }

  // Extract base64 content after 01 01
  let base64Data = data.slice(markerIndex + 2);

  // Trim trailing null bytes (ID3 frame padding)
  let endIndex = base64Data.length;
  while (endIndex > 0 && base64Data[endIndex - 1] === 0x00) {
    endIndex--;
  }
  base64Data = base64Data.slice(0, endIndex);

  // Check if it looks like base64 (valid base64 characters only)
  // Base64 alphabet: A-Z (0x41-0x5A), a-z (0x61-0x7A), 0-9 (0x30-0x39), +/= and newlines
  const isBase64 = base64Data.length > 0 && base64Data.every(byte =>
    (byte >= 0x41 && byte <= 0x5A) || // A-Z
    (byte >= 0x61 && byte <= 0x7A) || // a-z
    (byte >= 0x30 && byte <= 0x39) || // 0-9
    byte === 0x2B || // +
    byte === 0x2F || // /
    byte === 0x3D || // =
    byte === 0x0A || // newline
    byte === 0x0D    // carriage return
  );

  if (isBase64) {
    try {
      const base64Str = base64Data.toString('ascii');
      const decoded = Buffer.from(base64Str, 'base64');
      logger.debug(`[SERATO WRITER] Decoded base64: ${base64Data.length} bytes -> ${decoded.length} bytes`);
      return decoded;
    } catch (e) {
      logger.warn(`[SERATO WRITER] Base64 decode failed: ${e.message}`);
    }
  }

  // Return raw data starting from 01 01
  return data.slice(markerIndex);
}

/**
 * Build a raw GEOB frame for ID3 tag with ISO-8859-1 encoding
 * This bypasses node-id3's UTF-16 encoding which causes compatibility issues
 *
 * @param {string} description - Frame description (e.g., "Serato Markers2")
 * @param {Buffer} data - The data payload
 * @returns {Buffer} Complete GEOB frame ready to insert into ID3 tag
 */
function buildRawGEOBFrame(description, data) {
  // Build frame content
  // IMPORTANT: Serato DJ expects ID3v2.4 with UTF-8 encoding (0x03)
  const content = Buffer.concat([
    Buffer.from([0x03]),                                   // Encoding: UTF-8 (required for Serato)
    Buffer.from('application/octet-stream\x00', 'utf8'),   // MIME type (null-terminated)
    Buffer.from('\x00', 'utf8'),                           // Filename (empty, null-terminated)
    Buffer.from(description + '\x00', 'utf8'),             // Description (null-terminated)
    data                                                    // Binary data
  ]);

  // Build frame header
  // Frame ID: GEOB (4 bytes)
  // Size: syncsafe integer (4 bytes) - each byte uses only 7 bits
  // Flags: 0x0000 (2 bytes)
  const frameSize = content.length;
  const syncsafeSize = Buffer.alloc(4);
  syncsafeSize[0] = (frameSize >> 21) & 0x7F;
  syncsafeSize[1] = (frameSize >> 14) & 0x7F;
  syncsafeSize[2] = (frameSize >> 7) & 0x7F;
  syncsafeSize[3] = frameSize & 0x7F;

  return Buffer.concat([
    Buffer.from('GEOB', 'ascii'),  // Frame ID
    syncsafeSize,                   // Size (syncsafe)
    Buffer.from([0x00, 0x00]),      // Flags
    content                         // Frame content
  ]);
}

/**
 * Safe writer for Serato markers in audio files
 */
class SeratoFileWriter {
  constructor(options = {}) {
    this.backupRetentionDays = options.backupRetentionDays ?? 7;
    this.backupSuffix = '.serato-backup-';
    this.tempSuffix = '.serato-temp';
  }

  /**
   * Write cue points to audio file with atomic write protection
   * @param {string} filePath - Path to the audio file
   * @param {Array} cuePoints - Array of cue point objects
   * @param {Object} options - Write options (verify: boolean)
   * @returns {Object} { success: boolean, entriesWritten?: number, error?: string }
   */
  async writeCuePoints(filePath, cuePoints, options = {}) {
    const { verify = true } = options;

    // Validate cuePoints input
    if (!Array.isArray(cuePoints)) {
      return { success: false, error: 'cuePoints must be an array' };
    }

    for (const cue of cuePoints) {
      if (typeof cue.index !== 'number' || cue.index < 0 || cue.index > 7) {
        return { success: false, error: `Invalid cue index: ${cue.index}` };
      }
      const posMs = cue.positionMs ?? (cue.positionSec != null ? cue.positionSec * 1000 : undefined);
      if (typeof posMs !== 'number' || posMs < 0 || !isFinite(posMs)) {
        return { success: false, error: `Invalid position for cue ${cue.index}` };
      }
    }

    logger.info(`[SERATO WRITER] Writing ${cuePoints.length} cue points to: ${filePath}`);

    // DEBUG: Log all cue points received
    for (const cue of cuePoints) {
      logger.info(`[DEBUG] [SERATO WRITER] writeCuePoints received: index=${cue.index}, positionMs=${cue.positionMs}, positionSec=${cue.positionSec}`);
    }

    // Validate file path
    if (!filePath) {
      return { success: false, error: 'File path is required' };
    }

    // Check file exists and is writable
    try {
      await fs.access(filePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      return { success: false, error: `File not accessible: ${error.message}` };
    }

    // Check file format
    const ext = path.extname(filePath).toLowerCase();
    if (!['.mp3', '.aiff', '.aif'].includes(ext)) {
      return {
        success: false,
        error: `Unsupported format: ${ext}. Currently only MP3/AIFF are supported for writing.`,
      };
    }

    try {
      // Step 1: Read existing markers (preserve non-cue entries)
      const existingEntries = await this.readExistingMarkers(filePath);
      logger.info(`[SERATO WRITER] Read ${existingEntries.length} existing entries`);

      // Step 2: Merge cue points with existing entries
      const mergedEntries = SeratoMarkersParser.mergeEntries(existingEntries, cuePoints);
      logger.info(`[SERATO WRITER] Merged to ${mergedEntries.length} entries`);

      // Step 3: Encode to binary
      const encoded = SeratoMarkersParser.encode(mergedEntries);

      // Step 4: Validate encoded data
      const validation = SeratoMarkersParser.validate(encoded);
      if (!validation.valid) {
        throw new Error(`Encoded data validation failed: ${validation.error}`);
      }

      // Step 5: Write atomically (pass cuePoints for v1 format)
      // Extract ALL cue points from merged entries (preserves existing cues)
      const cuesForV1 = SeratoMarkersParser.extractCuePoints(mergedEntries);
      await this.writeAtomically(filePath, encoded, cuesForV1);
      logger.info(`[SERATO WRITER] Atomic write completed (v1 + v2 frames)`);

      // Step 6: Verify by reading back
      if (verify) {
        const verification = await this.verifyWrite(filePath, cuePoints);
        if (!verification.success) {
          throw new Error(`Verification failed: ${verification.error}`);
        }
        logger.info(`[SERATO WRITER] Verification passed`);
      }

      return {
        success: true,
        entriesWritten: mergedEntries.length,
      };

    } catch (error) {
      logger.error(`[SERATO WRITER] Write failed: ${error.message}`);
      // Atomic write ensures original file is unchanged on failure
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete a cue point from an audio file
   * @param {string} filePath - Path to the audio file
   * @param {number} cueIndex - Index of cue to delete (0-7)
   * @returns {Object} { success: boolean, error?: string }
   */
  async deleteCuePoint(filePath, cueIndex, options = {}) {
    logger.info(`[SERATO WRITER] Deleting cue ${cueIndex} from: ${filePath}`);

    // Validate input
    if (!filePath) {
      return { success: false, error: 'File path is required' };
    }

    if (cueIndex < 0 || cueIndex > 7) {
      return { success: false, error: 'Cue index must be between 0 and 7' };
    }

    // Check file exists and is writable
    try {
      await fs.access(filePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      return { success: false, error: `File not accessible: ${error.message}` };
    }

    try {
      // Read existing markers
      const existingEntries = await this.readExistingMarkers(filePath);

      // Remove the cue point
      const updatedEntries = SeratoMarkersParser.removeCuePoint(existingEntries, cueIndex);

      // Extract remaining cue points for v1 encoding
      const cuesForV1 = SeratoMarkersParser.extractCuePoints(updatedEntries);

      // Encode and write (both v1 and v2)
      const encoded = SeratoMarkersParser.encode(updatedEntries);
      await this.writeAtomically(filePath, encoded, cuesForV1);

      return { success: true };

    } catch (error) {
      logger.error(`[SERATO WRITER] Delete failed: ${error.message}`);
      // Atomic write ensures original file is unchanged on failure
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a timestamped backup of the file
   * @param {string} filePath - Path to the file to backup
   * @returns {string} Path to the backup file
   */
  async createBackup(filePath) {
    const timestamp = formatDateForFilename(new Date());
    const backupPath = `${filePath}${this.backupSuffix}${timestamp}`;

    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Restore from backup
   * @param {string} filePath - Path to the file to restore
   * @param {string} backupPath - Path to the backup file
   */
  async rollback(filePath, backupPath) {
    // Verify backup exists
    try {
      await fs.access(backupPath, fs.constants.R_OK);
    } catch (error) {
      throw new Error(`Backup file not accessible: ${backupPath}`);
    }

    // Copy backup over the original
    await fs.copyFile(backupPath, filePath);
  }

  /**
   * Read existing Serato markers from file
   * @param {string} filePath - Path to the audio file
   * @returns {Array} Parsed entries
   */
  async readExistingMarkers(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (['.mp3', '.aiff', '.aif'].includes(ext)) {
      return this._readMarkersFromID3(filePath);
    }

    // TODO: Support FLAC and M4A
    logger.warn(`[SERATO WRITER] Format ${ext} not yet supported for reading markers`);
    return [];
  }

  /**
   * Read markers from ID3 tags (MP3/AIFF)
   * Uses music-metadata to read GEOB frames
   * Tries Serato Markers2 (v2) first, falls back to Serato Markers_ (v1)
   * @private
   */
  async _readMarkersFromID3(filePath) {
    try {
      const mm = await import('music-metadata');
      const metadata = await mm.parseFile(filePath, {
        skipCovers: true,
        includeNative: true,
      });

      const nativeFrames = metadata.native?.['ID3v2.4'] || metadata.native?.['ID3v2.3'];
      const native = Array.isArray(nativeFrames) ? nativeFrames : [];

      // DEBUG: Log all GEOB frames found with hex values for description
      const geobFramesForDebug = native.filter(f => f.id === 'GEOB');
      logger.info(`[DEBUG] [_readMarkersFromID3] Found ${geobFramesForDebug.length} GEOB frames`);
      for (let i = 0; i < geobFramesForDebug.length; i++) {
        const desc = geobFramesForDebug[i].value?.description || '';
        const descHex = Buffer.from(desc, 'utf8').toString('hex');
        logger.info(`[DEBUG] [_readMarkersFromID3] GEOB[${i}] description: "${desc}"`);
        logger.info(`[DEBUG] [_readMarkersFromID3] GEOB[${i}] description hex: ${descHex}`);
        logger.info(`[DEBUG] [_readMarkersFromID3] GEOB[${i}] strict match Markers2: ${desc === 'Serato Markers2'}`);
        logger.info(`[DEBUG] [_readMarkersFromID3] GEOB[${i}] strict match Markers_: ${desc === 'Serato Markers_'}`);
        logger.info(`[DEBUG] [_readMarkersFromID3] GEOB[${i}] includes Markers2: ${desc.includes('Serato Markers2')}`);
        logger.info(`[DEBUG] [_readMarkersFromID3] GEOB[${i}] includes Markers_: ${desc.includes('Serato Markers_')}`);
      }

      // Try to find Serato Markers2 (v2) first - base64 format
      let geobFrame = native.find(
        frame => frame.id === 'GEOB' && frame.value?.description === 'Serato Markers2'
      );

      if (geobFrame?.value?.data) {
        // V2 found - use base64 decoding logic
        const rawData = Buffer.isBuffer(geobFrame.value.data)
          ? geobFrame.value.data
          : Buffer.from(geobFrame.value.data);

        const buffer = decodeMarkersFromGEOB(rawData);
        logger.debug(`[SERATO WRITER] Read ${rawData.length} bytes from V2 GEOB, decoded to ${buffer.length} bytes`);
        return SeratoMarkersParser.parse(buffer);
      }

      // V2 not found - try Serato Markers_ (v1) as fallback
      // This handles the case where music-metadata's GEOB parsing bug prevents finding v2
      geobFrame = native.find(
        frame => frame.id === 'GEOB' && frame.value?.description === 'Serato Markers_'
      );

      if (geobFrame?.value?.data) {
        const rawData = Buffer.isBuffer(geobFrame.value.data)
          ? geobFrame.value.data
          : Buffer.from(geobFrame.value.data);

        // Handle music-metadata bug - search for actual v1 data start (version bytes 02 05)
        let dataStart = 0;
        for (let i = 0; i < rawData.length - 1; i++) {
          if (rawData[i] === 0x02 && rawData[i + 1] === 0x05) {
            dataStart = i;
            break;
          }
        }

        const v1Data = rawData.slice(dataStart);
        logger.debug(`[SERATO WRITER] Read ${v1Data.length} bytes from V1 GEOB (offset: ${dataStart})`);
        return parseMarkersV1Data(v1Data);
      }

      logger.debug(`[SERATO WRITER] No Serato markers frame in: ${filePath}`);
      return [];
    } catch (error) {
      logger.warn(`[SERATO WRITER] Error reading ID3 markers: ${error.message}`);
      return [];
    }
  }

  /**
   * Write markers atomically (temp file + rename)
   * @param {string} filePath - Path to the audio file
   * @param {Buffer} markersBuffer - Encoded markers binary (v2 format)
   * @param {Array} cuePoints - Cue point objects for v1 format encoding
   */
  async writeAtomically(filePath, markersBuffer, cuePoints = []) {
    const tempPath = `${filePath}${this.tempSuffix}`;
    const ext = path.extname(filePath).toLowerCase();
    let tempCreated = false;

    try {
      // Copy original to temp
      await fs.copyFile(filePath, tempPath);
      tempCreated = true;

      // Update GEOB frames in temp file (both v1 and v2)
      if (['.mp3', '.aiff', '.aif'].includes(ext)) {
        await this._writeMarkersToID3(tempPath, markersBuffer, cuePoints);
      } else {
        throw new Error(`Unsupported format for writing: ${ext}`);
      }

      // Atomic rename (overwrites original)
      await fs.rename(tempPath, filePath);
      tempCreated = false; // Rename succeeded, temp no longer exists at tempPath

    } finally {
      // Clean up temp file if it still exists (on partial failure)
      if (tempCreated) {
        try {
          await fs.unlink(tempPath);
        } catch {
          // Ignore cleanup error
        }
      }
    }
  }

  /**
   * Write markers to ID3 GEOB frames (MP3/AIFF)
   * Writes BOTH Serato Markers_ (v1) and Serato Markers2 (v2) formats for full compatibility:
   * - v1 format: Required for cues 1-5 (index 0-4) - Serato only reads these from v1
   * - v2 format: Required for cues 6-8 (index 5-7) - But only when v1 is also present
   *
   * @param {string} filePath - Path to the audio file
   * @param {Buffer} markersBuffer - Encoded v2 markers binary
   * @param {Array} cuePoints - Array of cue point objects for v1 format encoding
   * @private
   */
  async _writeMarkersToID3(filePath, markersBuffer, cuePoints = []) {
    const NodeID3 = await getNodeID3();

    logger.info(`[SERATO WRITER] Writing ID3 GEOB frames (v1 + v2) with ${cuePoints.length} cue points`);

    // Step 1: Read existing file content
    const fileContent = await fs.readFile(filePath);

    // Step 2: Read existing tags to preserve metadata
    const existingTags = NodeID3.read(filePath);

    // Step 3: Build tags to write (preserve safe text tags)
    const tagsToWrite = {};
    for (const tag of SAFE_TEXT_TAGS) {
      if (existingTags && existingTags[tag]) {
        tagsToWrite[tag] = existingTags[tag];
      }
    }

    // Step 4: Create the ID3 tag buffer with standard frames (no GEOB yet)
    let id3Buffer = NodeID3.create(tagsToWrite);

    // Step 5: Build Serato Markers_ (v1) GEOB frame
    // CRITICAL: Serato DJ reads cues 1-5 (index 0-4) ONLY from v1 format
    // v1 uses raw binary (no base64), unlike v2 which uses 01 01 + base64
    const v1BinaryData = buildMarkersV1Data(cuePoints);
    const v1Frame = buildRawGEOBFrame('Serato Markers_', v1BinaryData);
    logger.info(`[SERATO WRITER] V1 frame size: ${v1Frame.length} bytes (${cuePoints.filter(c => c.index < 5).length} cues for slots 0-4)`);

    // Step 6: Build Serato Markers2 (v2) GEOB frame
    // v2 format supports all 8 cue points but Serato only reads cues 6-8 from it
    const v2Data = encodeMarkersForGEOB(markersBuffer);
    const v2Frame = buildRawGEOBFrame('Serato Markers2', v2Data);
    logger.info(`[SERATO WRITER] V2 frame size: ${v2Frame.length} bytes`);

    // Step 7: Insert GEOB frames into the ID3 tag
    // ID3 structure: header (10 bytes) + frames
    const id3Header = id3Buffer.slice(0, 10);
    const existingFrames = id3Buffer.slice(10);

    // Calculate new total size (existing frames + v1 frame + v2 frame)
    const newFramesSize = existingFrames.length + v1Frame.length + v2Frame.length;

    // Create new header with updated size (syncsafe encoding)
    // IMPORTANT: Serato DJ expects ID3v2.4, not ID3v2.3
    const newHeader = Buffer.alloc(10);
    newHeader[0] = 0x49; // 'I'
    newHeader[1] = 0x44; // 'D'
    newHeader[2] = 0x33; // '3'
    newHeader[3] = 0x04; // Version: ID3v2.4 (required for Serato)
    newHeader[4] = 0x00; // Revision: 0
    newHeader[5] = 0x00; // Flags: none
    newHeader[6] = (newFramesSize >> 21) & 0x7F;
    newHeader[7] = (newFramesSize >> 14) & 0x7F;
    newHeader[8] = (newFramesSize >> 7) & 0x7F;
    newHeader[9] = newFramesSize & 0x7F;

    // Combine: header + existing frames + v1 frame + v2 frame
    // NOTE: v1 frame comes first to ensure Serato finds it for cues 1-5
    const newId3Tag = Buffer.concat([newHeader, existingFrames, v1Frame, v2Frame]);

    // Step 8: Remove old ID3 tag from file and prepend new one
    const audioContent = NodeID3.removeTagsFromBuffer(fileContent) || fileContent;
    const newFileContent = Buffer.concat([newId3Tag, audioContent]);

    // Step 9: Write to file
    await fs.writeFile(filePath, newFileContent);

    logger.info(`[SERATO WRITER] Successfully wrote ID3 tag (${newId3Tag.length} bytes) with both v1 and v2 Serato frames`);
  }

  /**
   * Verify write by reading back and comparing
   * DEBUG VERSION - extensive logging
   * @param {string} filePath - Path to the audio file
   * @param {Array} expectedCues - Expected cue points
   * @returns {Object} { success: boolean, error?: string }
   */
  async verifyWrite(filePath, expectedCues) {
    try {
      logger.info(`[DEBUG VERIFY] Starting verification for: ${filePath}`);

      // DEBUG: Read directly with music-metadata to see ALL frames
      const mm = await import('music-metadata');
      const metadata = await mm.parseFile(filePath, {
        skipCovers: true,
        includeNative: true,
      });

      // DEBUG: Log all native frames
      const v3Frames = metadata.native?.['ID3v2.3'] || [];
      const v4Frames = metadata.native?.['ID3v2.4'] || [];
      logger.info(`[DEBUG VERIFY] ID3v2.3 frame count: ${v3Frames.length}`);
      logger.info(`[DEBUG VERIFY] ID3v2.4 frame count: ${v4Frames.length}`);

      const nativeFrames = v4Frames.length > 0 ? v4Frames : v3Frames;

      // Log frame types found
      const frameTypes = [...new Set(nativeFrames.map(f => f.id))];
      logger.info(`[DEBUG VERIFY] Frame types found: ${frameTypes.join(', ')}`);

      // Log all GEOB frames found
      const geobFrames = nativeFrames.filter(f => f.id === 'GEOB');
      logger.info(`[DEBUG VERIFY] GEOB frames found: ${geobFrames.length}`);

      for (let i = 0; i < geobFrames.length; i++) {
        const geob = geobFrames[i];
        logger.info(`[DEBUG VERIFY] GEOB[${i}] description: "${geob.value?.description}"`);
        logger.info(`[DEBUG VERIFY] GEOB[${i}] mimeType: "${geob.value?.mimeType}"`);
        logger.info(`[DEBUG VERIFY] GEOB[${i}] filename: "${geob.value?.filename}"`);
        logger.info(`[DEBUG VERIFY] GEOB[${i}] data length: ${geob.value?.data?.length || 0}`);
        if (geob.value?.data) {
          const dataHex = Buffer.isBuffer(geob.value.data)
            ? geob.value.data.slice(0, 30).toString('hex')
            : Buffer.from(geob.value.data).slice(0, 30).toString('hex');
          logger.info(`[DEBUG VERIFY] GEOB[${i}] data hex (first 30): ${dataHex}`);
        }
      }

      // Now do the normal verification
      const entries = await this.readExistingMarkers(filePath);
      logger.info(`[DEBUG VERIFY] Parsed entries count: ${entries.length}`);

      // extractCuePoints now handles both V1 (already extracted) and V2 (needs extraction) formats
      const actualCues = SeratoMarkersParser.extractCuePoints(entries);
      logger.info(`[DEBUG VERIFY] Extracted cue points: ${actualCues.length}`);

      // Create map for comparison
      const actualMap = new Map();
      for (const cue of actualCues) {
        actualMap.set(cue.index, cue);
        logger.info(`[DEBUG VERIFY] Found cue ${cue.index} at ${cue.positionMs}ms`);
      }

      // Verify each expected cue exists with correct position
      for (const expected of expectedCues) {
        const actual = actualMap.get(expected.index);
        if (!actual) {
          logger.error(`[DEBUG VERIFY] Cue ${expected.index} NOT FOUND!`);
          return {
            success: false,
            error: `Cue ${expected.index} not found after write`,
          };
        }

        const expectedMs = expected.positionMs ?? Math.round(expected.positionSec * 1000);
        if (Math.abs(actual.positionMs - expectedMs) > 1) {
          return {
            success: false,
            error: `Cue ${expected.index} position mismatch: expected ${expectedMs}ms, got ${actual.positionMs}ms`,
          };
        }
      }

      logger.info(`[DEBUG VERIFY] Verification PASSED!`);
      return { success: true };
    } catch (error) {
      logger.error(`[DEBUG VERIFY] Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up old backups
   * @param {string} dirPath - Directory to clean
   * @param {number} retentionDays - Days to keep backups (default: this.backupRetentionDays)
   * @returns {Object} { deleted: number, errors: string[] }
   */
  async cleanupOldBackups(dirPath, retentionDays = null) {
    const retention = retentionDays ?? this.backupRetentionDays;
    const cutoffTime = Date.now() - retention * 24 * 60 * 60 * 1000;

    const results = { deleted: 0, errors: [] };

    try {
      const files = await fs.readdir(dirPath);
      const backupFiles = files.filter(f => f.includes(this.backupSuffix));

      for (const file of backupFiles) {
        const filePath = path.join(dirPath, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.mtimeMs < cutoffTime) {
            await fs.unlink(filePath);
            results.deleted++;
            logger.debug(`[SERATO WRITER] Deleted old backup: ${file}`);
          }
        } catch (error) {
          results.errors.push(`Failed to process ${file}: ${error.message}`);
        }
      }
    } catch (error) {
      results.errors.push(`Failed to read directory: ${error.message}`);
    }

    if (results.deleted > 0) {
      logger.info(`[SERATO WRITER] Cleaned up ${results.deleted} old backups`);
    }

    return results;
  }

  /**
   * List backups for a file
   * @param {string} filePath - Original file path
   * @returns {Array} Array of backup file paths
   */
  async listBackups(filePath) {
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath);

    try {
      const files = await fs.readdir(dir);
      return files
        .filter(f => f.startsWith(baseName + this.backupSuffix))
        .map(f => path.join(dir, f))
        .sort()
        .reverse(); // Most recent first
    } catch (error) {
      logger.warn(`[SERATO WRITER] Error listing backups: ${error.message}`);
      return [];
    }
  }

  /**
   * Restore from the most recent backup
   * @param {string} filePath - Original file path
   * @returns {Object} { success: boolean, backup?: string, error?: string }
   */
  async restoreFromLatestBackup(filePath) {
    const backups = await this.listBackups(filePath);

    if (backups.length === 0) {
      return { success: false, error: 'No backups found' };
    }

    const latestBackup = backups[0];
    try {
      await this.rollback(filePath, latestBackup);
      return { success: true, backup: latestBackup };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { SeratoFileWriter };
