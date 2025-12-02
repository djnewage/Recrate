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
        key: metadata.common.key || null,
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
