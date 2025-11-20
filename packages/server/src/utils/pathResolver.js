const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const MetadataExtractor = require('../audio/metadata');
const logger = require('./logger');

/**
 * PathResolver - Intelligent path resolution for music files
 *
 * Handles graceful path changes by:
 * - Building searchable index of all audio files across multiple locations
 * - Matching tracks by filename and metadata when exact paths don't exist
 * - Caching successful resolutions for performance
 */
class PathResolver {
  constructor() {
    // Index: filename -> array of {path, metadata}
    this.filenameIndex = new Map();

    // Index: metadata hash -> path
    this.metadataHashIndex = new Map();

    // Cache: old path -> resolved path
    this.resolutionCache = new Map();

    // Track if index is built
    this.isIndexed = false;

    // Supported audio extensions
    this.audioExtensions = new Set(['.mp3', '.m4a', '.flac', '.wav', '.aac', '.ogg', '.wma', '.aiff']);

    // Initialize metadata extractor
    this.metadataExtractor = new MetadataExtractor();
  }

  /**
   * Build file index across all music locations
   * @param {Array<string>} musicPaths - Array of directory paths to scan
   * @returns {Promise<Object>} Index statistics
   */
  async buildIndex(musicPaths) {
    const startTime = Date.now();
    logger.info(`Building file index across ${musicPaths.length} location(s)...`);

    // Clear existing index
    this.filenameIndex.clear();
    this.metadataHashIndex.clear();

    let totalFiles = 0;
    let indexedFiles = 0;
    let errors = 0;

    for (const musicPath of musicPaths) {
      try {
        // Check if path exists
        const stats = await fs.stat(musicPath);
        if (!stats.isDirectory()) {
          logger.warn(`Skipping ${musicPath} - not a directory`);
          continue;
        }

        logger.info(`Scanning: ${musicPath}`);
        const files = await this._findAudioFilesRecursive(musicPath);
        totalFiles += files.length;

        // Index each file
        for (const filePath of files) {
          try {
            await this._indexFile(filePath);
            indexedFiles++;

            // Log progress every 100 files
            if (indexedFiles % 100 === 0) {
              logger.debug(`Indexed ${indexedFiles}/${totalFiles} files...`);
            }
          } catch (error) {
            errors++;
            logger.debug(`Failed to index ${filePath}: ${error.message}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to scan ${musicPath}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime;
    this.isIndexed = true;

    const stats = {
      totalFiles,
      indexedFiles,
      errors,
      uniqueFilenames: this.filenameIndex.size,
      uniqueMetadataHashes: this.metadataHashIndex.size,
      durationMs: duration
    };

    logger.info(`Index built: ${indexedFiles} files indexed in ${duration}ms (${errors} errors)`);
    logger.debug(`Unique filenames: ${stats.uniqueFilenames}, Unique metadata hashes: ${stats.uniqueMetadataHashes}`);

    return stats;
  }

  /**
   * Resolve a track path using intelligent matching
   * @param {string} originalPath - Original path from database
   * @param {Object} trackMetadata - Optional metadata to assist matching
   * @returns {string|null} Resolved path or null if not found
   */
  async resolvePath(originalPath, trackMetadata = null) {
    if (!this.isIndexed) {
      logger.warn('Path resolver index not built - call buildIndex() first');
      return null;
    }

    // Check cache first
    if (this.resolutionCache.has(originalPath)) {
      return this.resolutionCache.get(originalPath);
    }

    // Strategy 1: Check if exact path still exists
    if (fsSync.existsSync(originalPath)) {
      this.resolutionCache.set(originalPath, originalPath);
      return originalPath;
    }

    // Strategy 2: Match by filename + metadata validation
    const filename = path.basename(originalPath);
    const candidates = this.filenameIndex.get(filename);

    if (candidates && candidates.length > 0) {
      // If only one candidate, validate and return
      if (candidates.length === 1) {
        const candidate = candidates[0];
        if (this._validateMetadataMatch(trackMetadata, candidate.metadata)) {
          logger.debug(`Resolved ${filename} via filename match: ${candidate.path}`);
          this.resolutionCache.set(originalPath, candidate.path);
          return candidate.path;
        }
      }

      // Multiple candidates - find best match
      if (trackMetadata) {
        for (const candidate of candidates) {
          if (this._validateMetadataMatch(trackMetadata, candidate.metadata, true)) {
            logger.debug(`Resolved ${filename} via filename + metadata match: ${candidate.path}`);
            this.resolutionCache.set(originalPath, candidate.path);
            return candidate.path;
          }
        }
      }

      // No metadata or no match - return first candidate with warning
      logger.warn(`Multiple candidates for ${filename}, using first match (validation failed)`);
      this.resolutionCache.set(originalPath, candidates[0].path);
      return candidates[0].path;
    }

    // Strategy 3: Match by metadata hash only
    if (trackMetadata) {
      const metadataHash = this._generateMetadataHash(trackMetadata);
      const matchedPath = this.metadataHashIndex.get(metadataHash);

      if (matchedPath) {
        logger.debug(`Resolved ${filename} via metadata hash: ${matchedPath}`);
        this.resolutionCache.set(originalPath, matchedPath);
        return matchedPath;
      }
    }

    // No resolution found
    logger.debug(`Could not resolve path: ${originalPath}`);
    return null;
  }

  /**
   * Generate stable track ID from metadata
   * @param {Object} metadata - Track metadata
   * @returns {string} 16-character hash
   */
  generateTrackId(metadata) {
    const hash = this._generateMetadataHash(metadata);
    return hash.substring(0, 16);
  }

  /**
   * Clear resolution cache (useful after rescanning)
   */
  clearCache() {
    this.resolutionCache.clear();
    logger.debug('Resolution cache cleared');
  }

  /**
   * Get index statistics
   * @returns {Object} Current index stats
   */
  getStats() {
    return {
      isIndexed: this.isIndexed,
      filenameIndexSize: this.filenameIndex.size,
      metadataHashIndexSize: this.metadataHashIndex.size,
      resolutionCacheSize: this.resolutionCache.size
    };
  }

  // Private methods

  /**
   * Recursively find all audio files in a directory
   * @param {string} dir - Directory to search
   * @returns {Promise<Array<string>>} Array of file paths
   */
  async _findAudioFilesRecursive(dir) {
    const results = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip hidden files and system directories
        if (entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          // Recurse into subdirectories
          const subFiles = await this._findAudioFilesRecursive(fullPath);
          results.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.audioExtensions.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error reading directory ${dir}: ${error.message}`);
    }

    return results;
  }

  /**
   * Index a single file
   * @param {string} filePath - Path to audio file
   */
  async _indexFile(filePath) {
    // Extract metadata
    const metadata = await this.metadataExtractor.extractMetadata(filePath);

    // Skip if metadata extraction failed
    if (!metadata) {
      return;
    }

    const filename = path.basename(filePath);

    // Add to filename index
    if (!this.filenameIndex.has(filename)) {
      this.filenameIndex.set(filename, []);
    }
    this.filenameIndex.get(filename).push({
      path: filePath,
      metadata
    });

    // Add to metadata hash index
    const metadataHash = this._generateMetadataHash(metadata);
    this.metadataHashIndex.set(metadataHash, filePath);
  }

  /**
   * Generate metadata hash for matching
   * @param {Object} metadata - Track metadata
   * @returns {string} MD5 hash
   */
  _generateMetadataHash(metadata) {
    if (!metadata) {
      return '';
    }

    // Create hash from artist + title + duration (most stable identifiers)
    const artist = (metadata.artist || '').toLowerCase().trim();
    const title = (metadata.title || '').toLowerCase().trim();
    const duration = Math.round(metadata.duration || 0);

    // Fallback to album + track if artist/title missing
    const album = (metadata.album || '').toLowerCase().trim();
    const trackNumber = metadata.trackNumber || 0;

    // Primary hash: artist + title + duration
    let hashInput = `${artist}|${title}|${duration}`;

    // If primary fields are missing, use fallback
    if (!artist && !title) {
      hashInput = `${album}|${trackNumber}|${duration}`;
    }

    return crypto.createHash('md5')
      .update(hashInput)
      .digest('hex');
  }

  /**
   * Validate if two metadata objects match
   * @param {Object} meta1 - First metadata object
   * @param {Object} meta2 - Second metadata object
   * @param {boolean} strict - Use strict matching
   * @returns {boolean} True if metadata matches
   */
  _validateMetadataMatch(meta1, meta2, strict = false) {
    if (!meta1 || !meta2) {
      return false;
    }

    // Compare key fields
    const artistMatch = this._compareString(meta1.artist, meta2.artist);
    const titleMatch = this._compareString(meta1.title, meta2.title);
    const durationMatch = this._compareDuration(meta1.duration, meta2.duration);

    if (strict) {
      // Strict: all three must match
      return artistMatch && titleMatch && durationMatch;
    } else {
      // Lenient: at least 2 of 3 must match, or duration + (artist or title)
      const matches = [artistMatch, titleMatch, durationMatch].filter(Boolean).length;
      return matches >= 2 || (durationMatch && (artistMatch || titleMatch));
    }
  }

  /**
   * Compare two strings (case-insensitive, handles nulls)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {boolean} True if strings match
   */
  _compareString(str1, str2) {
    if (!str1 || !str2) {
      return false;
    }
    return str1.toLowerCase().trim() === str2.toLowerCase().trim();
  }

  /**
   * Compare two durations (allow 2 second tolerance)
   * @param {number} duration1 - First duration in seconds
   * @param {number} duration2 - Second duration in seconds
   * @returns {boolean} True if durations match within tolerance
   */
  _compareDuration(duration1, duration2) {
    if (!duration1 || !duration2) {
      return false;
    }
    return Math.abs(duration1 - duration2) <= 2; // 2 second tolerance
  }
}

// Export singleton instance
module.exports = new PathResolver();
