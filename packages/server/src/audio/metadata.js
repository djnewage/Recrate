// music-metadata is ESM-only, so we need dynamic import
let parseFile = null;

async function getParseFile() {
  if (!parseFile) {
    const mm = await import('music-metadata');
    parseFile = mm.parseFile;
  }
  return parseFile;
}

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { toCamelot } = require('../utils/keyConverter');
const { SeratoMarkersParser } = require('./serato-markers');

/**
 * Audio metadata extractor using music-metadata library
 */
class MetadataExtractor {
  constructor() {
    this.supportedFormats = ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.aiff'];
  }

  /**
   * Extract metadata from an audio file
   */
  async extractMetadata(filePath) {
    try {
      const parse = await getParseFile();
      const metadata = await parse(filePath, { skipCovers: false });

      // Convert key to Camelot notation if present
      const rawKey = metadata.common.key || null;
      const camelotKey = rawKey ? toCamelot(rawKey) : null;

      return {
        title: metadata.common.title || path.basename(filePath, path.extname(filePath)),
        artist: metadata.common.artist || 'Unknown Artist',
        album: metadata.common.album || 'Unknown Album',
        genre: metadata.common.genre ? metadata.common.genre[0] : '',
        year: metadata.common.year || null,
        duration: metadata.format.duration || 0,
        bitrate: metadata.format.bitrate || null,
        sampleRate: metadata.format.sampleRate || null,
        bpm: metadata.common.bpm || null,
        key: camelotKey || rawKey, // Use Camelot if available, fallback to raw
        format: metadata.format.container || path.extname(filePath).substring(1).toUpperCase(),
        hasArtwork: !!(metadata.common.picture && metadata.common.picture.length > 0),
      };
    } catch (error) {
      logger.warn(`Failed to extract metadata for ${filePath}:`, error.message);

      // Return basic metadata on error
      return {
        title: path.basename(filePath, path.extname(filePath)),
        artist: 'Unknown Artist',
        album: 'Unknown Album',
        genre: '',
        year: null,
        duration: 0,
        bitrate: null,
        sampleRate: null,
        bpm: null,
        key: null,
        format: path.extname(filePath).substring(1).toUpperCase(),
        hasArtwork: false,
      };
    }
  }

  /**
   * Extract artwork from an audio file
   * Returns buffer of image data
   */
  async getArtwork(filePath) {
    try {
      const parse = await getParseFile();
      const metadata = await parse(filePath, { skipCovers: false });

      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0];
        return {
          data: picture.data,
          format: picture.format,
        };
      }

      return null;
    } catch (error) {
      logger.warn(`Failed to extract artwork for ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Extract Serato cue points from an audio file
   * Reads the Serato Markers2 data from ID3v2 GEOB frame
   * @param {string} filePath - Path to the audio file
   * @returns {Array} Array of cue point objects with index, positionMs, positionSec, colorHex, label
   */
  async extractSeratoCuePoints(filePath) {
    try {
      const parse = await getParseFile();
      const metadata = await parse(filePath, {
        skipCovers: true,
        includeNative: true, // Required to get raw ID3 frames
      });

      // Find Serato Markers2 GEOB frame in native tags
      // Try both ID3v2.4 and ID3v2.3
      // Use explicit array check to handle cases where native isn't an array
      const nativeFrames = metadata.native?.['ID3v2.4'] || metadata.native?.['ID3v2.3'];
      const native = Array.isArray(nativeFrames) ? nativeFrames : [];

      // Log when no native ID3v2 frames found to help diagnose issues
      if (native.length === 0) {
        logger.debug(`[METADATA] No native ID3v2 frames found in: ${path.basename(filePath)}`);
      }

      // Find all GEOB frames for diagnostic purposes
      const allGeob = native.filter(f => f.id === 'GEOB');
      if (allGeob.length > 0) {
        const descriptions = allGeob.map(f => {
          const desc = f.value?.description;
          if (!desc) return 'no-description';
          if (desc.length > 30) return desc.slice(0, 30) + '...';
          return desc;
        });
        logger.debug(`[METADATA] Found ${allGeob.length} GEOB frames in ${path.basename(filePath)}: [${descriptions.join(', ')}]`);
      }

      const geobFrame = native.find(frame =>
        frame.id === 'GEOB' &&
        frame.value?.description === 'Serato Markers2'
      );

      if (!geobFrame || !geobFrame.value?.data) {
        logger.debug(`[METADATA] No Serato Markers2 found in: ${path.basename(filePath)}`);
        return [];
      }

      // Log full GEOB frame structure for diagnostics
      logger.debug(`[METADATA] GEOB frame: desc="${geobFrame.value.description}", ` +
        `mime="${geobFrame.value.type || 'none'}", filename="${geobFrame.value.filename || 'none'}"`);

      // Get the raw data from GEOB frame
      let buffer = Buffer.isBuffer(geobFrame.value.data)
        ? geobFrame.value.data
        : Buffer.from(geobFrame.value.data);

      // Log first 32 bytes as hex for diagnostics
      const hexPreview = buffer.slice(0, Math.min(32, buffer.length)).toString('hex');
      logger.debug(`[METADATA] GEOB objectData (${buffer.length} bytes), first 32 hex: ${hexPreview}`);

      // Determine data format and parse accordingly
      // Format 1: Binary - starts with 01 01 header
      // Format 2: Base64 - ASCII text that decodes to 01 01 header
      // Format 3: Prefixed - description text + null + possibly 0x01 0x01 + base64 (non-standard)

      if (buffer.length >= 2 && buffer[0] === 0x01 && buffer[1] === 0x01) {
        // Already binary format - pass directly to parser
        logger.debug(`[METADATA] Markers2 data is binary format (01 01 header)`);
      } else {
        // Data is not binary - need to extract and decode base64
        // The buffer may contain: "[partial]Markers2\0[\x01\x01]<base64>"
        // where the first byte might be stripped (e.g., "erato Markers2" instead of "Serato Markers2")

        // Find "Markers2" which handles both "Serato Markers2" and "erato Markers2" (partial)
        const markers2Index = buffer.indexOf('Markers2');
        let dataStart = 0;

        if (markers2Index !== -1 && markers2Index < 32) {
          // Skip past "Markers2"
          dataStart = markers2Index + 8; // "Markers2".length = 8

          // Skip null terminator(s)
          while (dataStart < buffer.length && buffer[dataStart] === 0x00) {
            dataStart++;
          }

          // Skip any 0x01 bytes (version/format markers sometimes present)
          while (dataStart < buffer.length && buffer[dataStart] === 0x01) {
            dataStart++;
          }

          logger.debug(`[METADATA] Found Markers2 at index ${markers2Index}, base64 starts at ${dataStart}`);
        }

        // Extract the base64 portion
        const base64Buffer = buffer.slice(dataStart);
        let base64Str = base64Buffer.toString('utf8').trim();

        // Log what we're about to decode
        logger.debug(`[METADATA] Base64 string (first 50 chars): ${base64Str.slice(0, 50)}`);

        // Attempt base64 decode and validate
        try {
          const decoded = SeratoMarkersParser.decodeBase64(base64Str);

          // Validate: decoded data must start with 01 01 header
          if (decoded.length >= 2 && decoded[0] === 0x01 && decoded[1] === 0x01) {
            buffer = decoded;
            logger.debug(`[METADATA] Decoded base64 -> binary (${base64Str.length} chars -> ${buffer.length} bytes, valid 01 01 header)`);
          } else {
            logger.warn(`[METADATA] Base64 decoded but invalid header: got ${decoded[0]?.toString(16)} ${decoded[1]?.toString(16)}, expected 01 01`);
          }
        } catch (decodeError) {
          logger.warn(`[METADATA] Base64 decode failed: ${decodeError.message}`);
          logger.debug(`[METADATA] Raw data (first 50 chars): ${base64Str.slice(0, 50)}`);
        }
      }

      // Check if data is JSON format (starts with '{')
      let cuePoints;
      if (buffer.length > 0 && buffer[0] === 0x7B) { // '{' = 0x7B
        logger.debug(`[METADATA] Detected JSON cue format in: ${path.basename(filePath)}`);
        cuePoints = SeratoMarkersParser.parseJsonCues(buffer);
      } else {
        // Standard binary Markers2 format
        const entries = SeratoMarkersParser.parse(buffer);
        cuePoints = SeratoMarkersParser.extractCuePoints(entries);
      }

      if (cuePoints.length > 0) {
        logger.debug(`[METADATA] Extracted ${cuePoints.length} Serato cue points from: ${path.basename(filePath)}`);
      }

      return cuePoints;
    } catch (error) {
      logger.warn(`[METADATA] Failed to extract Serato cue points for ${filePath}:`, error.message);
      return [];
    }
  }

  /**
   * Scan directory for audio files
   */
  async scanDirectory(dirPath, onProgress = null) {
    const audioFiles = [];

    async function scan(currentPath) {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          // Skip _Serato_ directory
          if (entry.name === '_Serato_') {
            continue;
          }

          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.supportedFormats.includes(ext)) {
              audioFiles.push(fullPath);
              if (onProgress) {
                onProgress(fullPath);
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`Error scanning directory ${currentPath}:`, error.message);
      }
    }

    await scan(dirPath);
    return audioFiles;
  }

  /**
   * Check if file is a supported audio format
   */
  isAudioFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
  }
}

module.exports = MetadataExtractor;
