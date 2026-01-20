/**
 * Serato Markers2 Binary Parser/Encoder
 *
 * Parses and encodes Serato Markers2 data stored in audio file ID3 tags.
 * This format stores cue points, loops, and other DJ markers.
 *
 * Storage Locations:
 * - MP3/AIFF: ID3v2.4 GEOB frame with description "Serato Markers2"
 * - FLAC: Vorbis comment `SERATO_MARKERS_V2` (base64 encoded)
 * - MP4/M4A: Custom atom `----:com.serato.dj:markersv2`
 *
 * Binary Structure:
 * [Header] 01 01 (version bytes)
 * [Entries - repeated]
 *   00 (entry marker)
 *   [type] Null-terminated string: "CUE", "COLOR", "BPMLOCK", "LOOP", etc.
 *   [length: 4 bytes BE] Length of payload
 *   [payload: N bytes] Type-specific data
 *
 * CUE Payload (variable length, minimum 13 bytes + label):
 *   00 (always 0)
 *   [index: 1 byte] Cue index 0-7 (maps to banks 1-8)
 *   [position: 4 bytes BE] Position in milliseconds
 *   00 (padding)
 *   [R: 1 byte] Red 0-255
 *   [G: 1 byte] Green 0-255
 *   [B: 1 byte] Blue 0-255
 *   00 00 (padding)
 *   [label] Null-terminated UTF-8 string (variable length)
 *
 * SAFETY: This module only handles binary parsing/encoding.
 * File I/O and backups are handled by the caller.
 */

const logger = require('../utils/logger');

/**
 * Entry types found in Serato Markers2
 */
const ENTRY_TYPES = {
  CUE: 'CUE',
  LOOP: 'LOOP',
  COLOR: 'COLOR',
  BPMLOCK: 'BPMLOCK',
  FLIP: 'FLIP',
};

/**
 * Default cue point colors (RGB) matching Serato's palette
 */
const DEFAULT_CUE_COLORS = {
  0: { r: 0xCC, g: 0x00, b: 0x00 }, // Red
  1: { r: 0xCC, g: 0x44, b: 0x00 }, // Orange
  2: { r: 0xCC, g: 0x88, b: 0x00 }, // Yellow
  3: { r: 0x00, g: 0xCC, b: 0x00 }, // Green
  4: { r: 0x00, g: 0xCC, b: 0xCC }, // Cyan
  5: { r: 0x00, g: 0x44, b: 0xCC }, // Blue
  6: { r: 0xCC, g: 0x00, b: 0xCC }, // Purple
  7: { r: 0xCC, g: 0x44, b: 0x88 }, // Pink
};

/**
 * Convert RGB object to hex string
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Convert hex string to RGB object
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

/**
 * Modified Base64 encoding/decoding for FLAC/M4A
 * Serato uses a modified base64 alphabet: replaces +/ with -_
 */
function seratoBase64Encode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function seratoBase64Decode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

class SeratoMarkersParser {
  /**
   * Parse binary Markers2 data
   * @param {Buffer} buffer - Raw binary data from ID3 GEOB frame
   * @returns {Array} Array of entry objects with type and data
   */
  static parse(buffer) {
    if (!buffer || buffer.length < 2) {
      logger.warn('[SERATO MARKERS] Buffer too small to parse');
      return [];
    }

    const entries = [];
    let offset = 0;

    // Verify header (01 01)
    if (buffer[0] !== 0x01 || buffer[1] !== 0x01) {
      logger.warn('[SERATO MARKERS] Invalid header, expected 01 01');
      // Try to continue anyway - some files may have different versions
    }
    offset = 2;

    // Parse entries
    while (offset < buffer.length) {
      // Check for entry marker (00) - some formats have it, some don't
      if (buffer[offset] === 0x00) {
        offset++; // Skip entry marker
        // Check for end of data (multiple zeros = padding)
        if (offset >= buffer.length || buffer[offset] === 0x00) break;
      }

      // Read null-terminated type string
      const typeStart = offset;
      while (offset < buffer.length && buffer[offset] !== 0x00) {
        offset++;
      }

      if (offset >= buffer.length) break;

      const type = buffer.slice(typeStart, offset).toString('utf8');
      offset++; // Skip null terminator

      // Check for empty type (end of entries)
      if (type.length === 0) {
        break;
      }

      // Read length (4 bytes big-endian)
      if (offset + 4 > buffer.length) {
        logger.warn(`[SERATO MARKERS] Truncated length at offset ${offset}`);
        break;
      }

      const length = buffer.readUInt32BE(offset);
      offset += 4;

      // Read payload
      if (offset + length > buffer.length) {
        logger.warn(`[SERATO MARKERS] Truncated payload at offset ${offset}, expected ${length} bytes`);
        break;
      }

      const payload = buffer.slice(offset, offset + length);
      offset += length;

      entries.push({
        type,
        payload,
        _raw: { typeStart, length, payloadStart: offset - length },
      });

      logger.debug(`[SERATO MARKERS] Parsed entry: type=${type}, length=${length}`);
    }

    return entries;
  }

  /**
   * Parse JSON-format cue point data
   * Format: {"algorithm":14,"cues":[{"name":"Cue 1","time":23.765},...]}
   * @param {Buffer|string} data - JSON string or buffer containing JSON
   * @returns {Array} Array of cue point objects matching extractCuePoints() format
   */
  static parseJsonCues(data) {
    try {
      const jsonStr = Buffer.isBuffer(data) ? data.toString('utf8') : data;
      const parsed = JSON.parse(jsonStr);

      if (!parsed.cues || !Array.isArray(parsed.cues)) {
        return [];
      }

      const cues = [];
      parsed.cues.forEach((cue, index) => {
        if (index >= 8) return; // Max 8 cue points (0-7)

        if (typeof cue.time === 'number') {
          // Use existing DEFAULT_CUE_COLORS constant
          const color = DEFAULT_CUE_COLORS[index] || DEFAULT_CUE_COLORS[0];
          cues.push({
            index: index,
            positionMs: Math.round(cue.time), // time is already in ms
            positionSec: cue.time / 1000,
            label: cue.name || '',
            r: color.r,
            g: color.g,
            b: color.b,
            colorHex: rgbToHex(color.r, color.g, color.b),
          });
          logger.debug(`[SERATO MARKERS] Parsed JSON cue ${index}: ${cue.time}ms, label="${cue.name || ''}"`);
        }
      });

      if (cues.length > 0) {
        logger.info(`[SERATO MARKERS] Extracted ${cues.length} cues from JSON format`);
      }
      return cues;
    } catch (error) {
      logger.debug(`[SERATO MARKERS] Not valid JSON cue data: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract cue points from parsed entries
   * Handles both V2 format (entries with payload) and V1 format (already extracted)
   * @param {Array} entries - Parsed entries from parse() or V1 parser
   * @returns {Array} Array of cue point objects
   */
  static extractCuePoints(entries) {
    const cuePoints = [];

    for (const entry of entries) {
      // Check if this is V1 format (already extracted - has positionMs but no payload)
      if (entry.positionMs !== undefined && entry.payload === undefined) {
        // V1 format - already extracted, just normalize the format
        const color = entry.color || { r: 0xCC, g: 0x00, b: 0x00 };
        cuePoints.push({
          index: entry.index,
          positionMs: entry.positionMs,
          positionSec: entry.positionSec ?? entry.positionMs / 1000,
          r: entry.r ?? color.r,
          g: entry.g ?? color.g,
          b: entry.b ?? color.b,
          colorHex: entry.colorHex ?? rgbToHex(entry.r ?? color.r, entry.g ?? color.g, entry.b ?? color.b),
          label: entry.label || '',
        });
        continue;
      }

      // V2 format - needs extraction from payload
      if (entry.type !== ENTRY_TYPES.CUE) continue;

      const payload = entry.payload;
      if (!payload || payload.length < 13) {
        logger.warn(`[SERATO MARKERS] CUE payload too small: ${payload?.length || 0} bytes (minimum 13)`);
        continue;
      }

      try {
        // Parse CUE payload
        // Byte 0: always 0
        // Byte 1: index (0-7)
        // Bytes 2-5: position in milliseconds (BE)
        // Byte 6: padding (0)
        // Bytes 7-9: RGB color
        // Bytes 10-11: padding (0, 0)
        // Byte 12+: null-terminated label

        const index = payload[1];
        const positionMs = payload.readUInt32BE(2);
        const r = payload[7];
        const g = payload[8];
        const b = payload[9];

        // Extract label (starts at byte 12, null-terminated)
        // Simplified logic: labelEnd === 12 means empty label (immediate null)
        let label = '';
        if (payload.length > 12) {
          const labelEnd = payload.indexOf(0x00, 12);
          label = labelEnd !== -1
            ? payload.slice(12, labelEnd).toString('utf8')
            : payload.slice(12).toString('utf8');
        }

        cuePoints.push({
          index,
          positionMs,
          positionSec: positionMs / 1000,
          r,
          g,
          b,
          colorHex: rgbToHex(r, g, b),
          label: label || '',
          _payload: payload, // Keep original for re-encoding
        });

        logger.debug(`[SERATO MARKERS] Extracted cue ${index}: ${positionMs}ms, color=${rgbToHex(r, g, b)}, label="${label}"`);
      } catch (error) {
        logger.warn(`[SERATO MARKERS] Error parsing CUE entry:`, error.message);
      }
    }

    // Sort by index
    cuePoints.sort((a, b) => a.index - b.index);
    return cuePoints;
  }

  /**
   * Create a CUE entry payload
   * @param {number} index - Cue index 0-7
   * @param {number} positionMs - Position in milliseconds
   * @param {number} r - Red 0-255
   * @param {number} g - Green 0-255
   * @param {number} b - Blue 0-255
   * @param {string} label - Cue label (optional)
   * @returns {Buffer} CUE payload buffer
   */
  static createCuePayload(index, positionMs, r, g, b, label = '') {
    // Validate inputs
    if (index < 0 || index > 7) {
      throw new Error(`Invalid cue index: ${index}. Must be 0-7.`);
    }
    if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      throw new Error(`Invalid RGB values: ${r}, ${g}, ${b}. Must be 0-255.`);
    }
    if (positionMs < 0 || !isFinite(positionMs)) {
      throw new Error(`Invalid position: ${positionMs}. Must be non-negative and finite.`);
    }

    // Limit label size to prevent buffer overflow
    const MAX_LABEL_LENGTH = 256;
    const truncatedLabel = label.slice(0, MAX_LABEL_LENGTH);
    const labelBytes = Buffer.from(truncatedLabel, 'utf8');
    const payloadLength = 12 + labelBytes.length + 1; // 12 fixed bytes + label + null terminator

    const payload = Buffer.alloc(payloadLength);
    let offset = 0;

    // Byte 0: always 0
    payload[offset++] = 0x00;

    // Byte 1: index
    payload[offset++] = index & 0xFF;

    // Bytes 2-5: position in milliseconds (BE)
    payload.writeUInt32BE(Math.round(positionMs), offset);
    offset += 4;

    // Byte 6: padding
    payload[offset++] = 0x00;

    // Bytes 7-9: RGB color
    payload[offset++] = r & 0xFF;
    payload[offset++] = g & 0xFF;
    payload[offset++] = b & 0xFF;

    // Bytes 10-11: padding
    payload[offset++] = 0x00;
    payload[offset++] = 0x00;

    // Label (null-terminated)
    labelBytes.copy(payload, offset);
    offset += labelBytes.length;
    payload[offset] = 0x00; // Null terminator

    return payload;
  }

  /**
   * Create a CUE entry (type + length + payload)
   * @param {number} index - Cue index 0-7
   * @param {number} positionMs - Position in milliseconds
   * @param {number} r - Red 0-255
   * @param {number} g - Green 0-255
   * @param {number} b - Blue 0-255
   * @param {string} label - Cue label (optional)
   * @returns {Buffer} Complete CUE entry buffer
   */
  static createCueEntry(index, positionMs, r, g, b, label = '') {
    const payload = this.createCuePayload(index, positionMs, r, g, b, label);
    const type = Buffer.from(ENTRY_TYPES.CUE + '\x00', 'utf8');

    // Entry: 00 + type + length (4 bytes BE) + payload
    const entry = Buffer.alloc(1 + type.length + 4 + payload.length);
    let offset = 0;

    // Entry marker
    entry[offset++] = 0x00;

    // Type (null-terminated)
    type.copy(entry, offset);
    offset += type.length;

    // Length (4 bytes BE)
    entry.writeUInt32BE(payload.length, offset);
    offset += 4;

    // Payload
    payload.copy(entry, offset);

    return entry;
  }

  /**
   * Encode entries back to binary format
   * @param {Array} entries - Array of entry objects (with type and payload)
   * @returns {Buffer} Complete Markers2 binary buffer
   */
  static encode(entries) {
    const buffers = [];

    // Header
    buffers.push(Buffer.from([0x01, 0x01]));

    // Entries
    for (const entry of entries) {
      // NOTE: No entry marker byte - Serato's native format doesn't use them
      // (Previously we added 0x00 here which broke cues 6-8)

      // Type (null-terminated)
      buffers.push(Buffer.from(entry.type + '\x00', 'utf8'));

      // Length (4 bytes BE)
      const lengthBuf = Buffer.alloc(4);
      lengthBuf.writeUInt32BE(entry.payload.length, 0);
      buffers.push(lengthBuf);

      // Payload
      buffers.push(entry.payload);
    }

    return Buffer.concat(buffers);
  }

  /**
   * Merge new cue points with existing entries
   * Preserves non-CUE entries and updates/adds CUE entries
   * @param {Array} existingEntries - Existing parsed entries
   * @param {Array} cuePoints - New cue points to merge
   * @returns {Array} Merged entries
   */
  static mergeEntries(existingEntries, cuePoints) {
    // Separate CUE entries from others
    const nonCueEntries = existingEntries.filter(e => e.type !== ENTRY_TYPES.CUE);
    const existingCues = this.extractCuePoints(existingEntries);

    // Create a map of existing cues by index
    const cueMap = new Map();
    for (const cue of existingCues) {
      cueMap.set(cue.index, cue);
    }

    // Update/add new cue points
    for (const newCue of cuePoints) {
      const rgb = newCue.r !== undefined
        ? { r: newCue.r, g: newCue.g, b: newCue.b }
        : hexToRgb(newCue.colorHex) || DEFAULT_CUE_COLORS[newCue.index] || { r: 0xCC, g: 0x00, b: 0x00 };

      cueMap.set(newCue.index, {
        index: newCue.index,
        positionMs: newCue.positionMs ?? Math.round(newCue.positionSec * 1000),
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        label: newCue.label || '',
      });
    }

    // Build merged entries: non-CUE entries first, then CUE entries sorted by index
    const mergedEntries = [...nonCueEntries];

    const sortedCues = Array.from(cueMap.values()).sort((a, b) => a.index - b.index);
    for (const cue of sortedCues) {
      mergedEntries.push({
        type: ENTRY_TYPES.CUE,
        payload: this.createCuePayload(cue.index, cue.positionMs, cue.r, cue.g, cue.b, cue.label),
      });
    }

    return mergedEntries;
  }

  /**
   * Remove a cue point by index
   * Handles both V2 format (entries with payload) and V1 format (already extracted)
   * @param {Array} entries - Existing parsed entries
   * @param {number} cueIndex - Index of cue to remove (0-7)
   * @returns {Array} Updated entries without the specified cue
   */
  static removeCuePoint(entries, cueIndex) {
    return entries.filter(entry => {
      // V1 format - has index directly on entry
      if (entry.positionMs !== undefined && entry.payload === undefined) {
        return entry.index !== cueIndex;
      }
      // V2 format - check the type first
      if (entry.type !== ENTRY_TYPES.CUE) return true;
      // Check the index byte in the payload
      return entry.payload && entry.payload[1] !== cueIndex;
    });
  }

  /**
   * Validate buffer structure
   * @param {Buffer} buffer - Buffer to validate
   * @returns {Object} Validation result { valid: boolean, error?: string }
   */
  static validate(buffer) {
    if (!buffer || buffer.length < 2) {
      return { valid: false, error: 'Buffer too small' };
    }

    // Check header
    if (buffer[0] !== 0x01 || buffer[1] !== 0x01) {
      return { valid: false, error: 'Invalid header' };
    }

    // Try to parse entries
    try {
      const entries = this.parse(buffer);
      if (entries.length === 0) {
        // Empty is valid (no markers)
        return { valid: true };
      }

      // Validate each entry has reasonable structure
      for (const entry of entries) {
        if (!entry.type || entry.type.length === 0) {
          return { valid: false, error: 'Entry with empty type' };
        }
        if (!entry.payload || entry.payload.length < 0) {
          return { valid: false, error: 'Entry with invalid payload' };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Create empty Markers2 buffer (header only)
   * @returns {Buffer} Empty Markers2 buffer
   */
  static createEmpty() {
    return Buffer.from([0x01, 0x01]);
  }

  /**
   * Decode base64-encoded Markers2 data (for FLAC/M4A)
   * @param {string} base64Data - Base64 encoded string
   * @returns {Buffer} Decoded buffer
   */
  static decodeBase64(base64Data) {
    return seratoBase64Decode(base64Data);
  }

  /**
   * Encode Markers2 buffer to base64 (for FLAC/M4A)
   * @param {Buffer} buffer - Binary buffer
   * @returns {string} Base64 encoded string
   */
  static encodeBase64(buffer) {
    return seratoBase64Encode(buffer);
  }
}

module.exports = {
  SeratoMarkersParser,
  ENTRY_TYPES,
  DEFAULT_CUE_COLORS,
  rgbToHex,
  hexToRgb,
};
