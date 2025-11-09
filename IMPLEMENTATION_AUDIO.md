/**
 * IMPLEMENTATION SPEC: Audio Streaming Module
 * 
 * This file provides detailed specifications for implementing audio streaming.
 * Use this as a guide for Claude Code to build src/audio/streamer.js
 */

// =============================================================================
// MODULE: src/audio/streamer.js
// =============================================================================

/**
 * Class: AudioStreamer
 * 
 * Handles streaming audio files to mobile clients with support for:
 * - Range requests (for seeking)
 * - Multiple audio formats (MP3, FLAC, WAV, AAC)
 * - Efficient chunk streaming
 * - Content-Type detection
 */

class AudioStreamer {
  /**
   * Constructor
   * @param {SeratoParser} parser - Parser instance to get track info
   */
  constructor(parser) {
    this.parser = parser;
    this.CHUNK_SIZE = 1024 * 256; // 256 KB chunks
  }

  /**
   * Method: streamTrack
   * 
   * Stream an audio file to the response object.
   * Supports HTTP range requests for seeking.
   * 
   * @param {string} trackId - Track ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   * 
   * Implementation Steps:
   * 1. Get track info from parser
   * 2. Check if file exists
   * 3. Get file stats (size)
   * 4. Parse Range header if present
   * 5. Set appropriate response headers
   * 6. Create read stream with range
   * 7. Pipe to response
   * 8. Handle errors gracefully
   * 
   * HTTP Headers to Set:
   * - Content-Type: audio/mpeg (or appropriate MIME type)
   * - Content-Length: file size or range size
   * - Accept-Ranges: bytes
   * - Content-Range: bytes start-end/total (if range request)
   * 
   * Status Codes:
   * - 200 OK: Full file
   * - 206 Partial Content: Range request
   * - 404 Not Found: Track doesn't exist
   * - 416 Range Not Satisfiable: Invalid range
   * 
   * Error Handling:
   * - Handle file not found
   * - Handle invalid range requests
   * - Handle read errors
   * - Clean up streams on error
   */
  async streamTrack(trackId, req, res) {
    // Implementation here
  }

  /**
   * Method: getMimeType
   * 
   * Get MIME type for audio file based on extension.
   * 
   * @param {string} filePath - File path
   * @returns {string} - MIME type
   * 
   * Supported Formats:
   * - .mp3 → audio/mpeg
   * - .flac → audio/flac
   * - .wav → audio/wav
   * - .m4a, .aac → audio/mp4
   * - .ogg → audio/ogg
   * - default → application/octet-stream
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Method: parseRange
   * 
   * Parse HTTP Range header.
   * 
   * @param {string} rangeHeader - Range header value (e.g., "bytes=0-1023")
   * @param {number} fileSize - Total file size
   * @returns {Object|null} - { start: number, end: number } or null if invalid
   * 
   * Implementation:
   * 1. Parse "bytes=start-end" format
   * 2. Handle missing start or end
   * 3. Validate range is within file size
   * 4. Return normalized range object
   * 
   * Examples:
   * - "bytes=0-1023" → { start: 0, end: 1023 }
   * - "bytes=1024-" → { start: 1024, end: fileSize-1 }
   * - "bytes=-1024" → { start: fileSize-1024, end: fileSize-1 }
   */
  parseRange(rangeHeader, fileSize) {
    // Implementation here
  }

  /**
   * Method: getArtwork
   * 
   * Extract and stream album artwork from audio file.
   * 
   * @param {string} trackId - Track ID
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   * 
   * Implementation:
   * 1. Get track file path
   * 2. Use music-metadata to extract artwork
   * 3. If artwork exists:
   *    - Set Content-Type based on image format
   *    - Stream artwork data
   * 4. If no artwork:
   *    - Return 404
   * 
   * Artwork Formats:
   * - JPEG → image/jpeg
   * - PNG → image/png
   */
  async getArtwork(trackId, res) {
    // Implementation here
  }

  /**
   * Helper Method: streamFile
   * 
   * Low-level file streaming with range support.
   * 
   * @param {string} filePath - File to stream
   * @param {number} start - Start byte
   * @param {number} end - End byte
   * @param {Object} res - Response object
   * @returns {Promise<void>}
   * 
   * Implementation:
   * 1. Create read stream with range
   * 2. Pipe to response
   * 3. Handle errors
   * 4. Clean up on completion
   */
  async streamFile(filePath, start, end, res) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { start, end });
      
      stream.on('error', (err) => {
        reject(err);
      });
      
      stream.on('end', () => {
        resolve();
      });
      
      stream.pipe(res);
    });
  }
}

// =============================================================================
// MODULE: src/audio/metadata.js
// =============================================================================

/**
 * Class: MetadataExtractor
 * 
 * Extract detailed metadata from audio files using music-metadata library.
 */

class MetadataExtractor {
  /**
   * Method: extractMetadata
   * 
   * Extract all metadata from an audio file.
   * 
   * @param {string} filePath - Path to audio file
   * @returns {Promise<Object>}
   * 
   * Extracted Data:
   * {
   *   title: string,
   *   artist: string,
   *   album: string,
   *   genre: string,
   *   year: number,
   *   trackNumber: number,
   *   duration: number,        // Seconds
   *   bitrate: number,         // kbps
   *   sampleRate: number,      // Hz
   *   format: string,          // File format
   *   hasArtwork: boolean
   * }
   * 
   * Implementation:
   * 1. Use music-metadata.parseFile()
   * 2. Extract common metadata
   * 3. Extract format info
   * 4. Check for artwork
   * 5. Return normalized object
   * 
   * Error Handling:
   * - Return partial data if some fields missing
   * - Log warnings for parse errors
   * - Don't throw, return best-effort data
   */
  async extractMetadata(filePath) {
    // Implementation here
  }

  /**
   * Method: getArtwork
   * 
   * Extract artwork buffer from audio file.
   * 
   * @param {string} filePath
   * @returns {Promise<{ data: Buffer, format: string }|null>}
   * 
   * Returns artwork data and format (jpeg, png) or null if no artwork.
   */
  async getArtwork(filePath) {
    // Implementation here
  }

  /**
   * Method: scanDirectory
   * 
   * Scan directory for audio files and extract metadata.
   * 
   * @param {string} dirPath - Directory to scan
   * @param {Function} onProgress - Progress callback (optional)
   * @returns {Promise<Array<Object>>}
   * 
   * Implementation:
   * 1. Recursively find audio files
   * 2. Extract metadata for each
   * 3. Call progress callback with status
   * 4. Return array of track objects
   * 
   * Progress Callback:
   * onProgress({ current: 50, total: 100, file: 'track.mp3' })
   */
  async scanDirectory(dirPath, onProgress = null) {
    // Implementation here
  }

  /**
   * Helper: isAudioFile
   * 
   * Check if file is a supported audio format.
   * 
   * @param {string} filePath
   * @returns {boolean}
   */
  isAudioFile(filePath) {
    const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus'];
    const ext = path.extname(filePath).toLowerCase();
    return audioExtensions.includes(ext);
  }
}

// =============================================================================
// EXPRESS ROUTE HANDLER EXAMPLES
// =============================================================================

/**
 * Example route handler for streaming
 */
async function streamHandler(req, res) {
  const { trackId } = req.params;
  const streamer = new AudioStreamer(parser);
  
  try {
    await streamer.streamTrack(trackId, req, res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Track not found' });
    } else {
      console.error('Stream error:', error);
      res.status(500).json({ error: 'Failed to stream track' });
    }
  }
}

/**
 * Example route handler for artwork
 */
async function artworkHandler(req, res) {
  const { trackId } = req.params;
  const streamer = new AudioStreamer(parser);
  
  try {
    await streamer.getArtwork(trackId, res);
  } catch (error) {
    res.status(404).json({ error: 'Artwork not found' });
  }
}

// =============================================================================
// PERFORMANCE CONSIDERATIONS
// =============================================================================

/**
 * Caching Strategy:
 * 
 * 1. Metadata Cache
 *    - Cache extracted metadata in memory
 *    - Invalidate on file modification
 *    - Use LRU cache to limit memory
 * 
 * 2. Artwork Cache
 *    - Cache extracted artwork
 *    - Store in memory or disk
 *    - Serve cached version when available
 * 
 * 3. Stream Optimization
 *    - Use appropriate chunk size (256KB good for mobile)
 *    - Support compression if possible
 *    - Monitor memory usage with large files
 */

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  AudioStreamer,
  MetadataExtractor
};

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/*
// In Express route
const { AudioStreamer, MetadataExtractor } = require('./streamer');

const parser = new SeratoParser('/Users/dj/Music/_Serato_');
const streamer = new AudioStreamer(parser);
const metadata = new MetadataExtractor();

// Stream endpoint
app.get('/api/stream/:trackId', async (req, res) => {
  await streamer.streamTrack(req.params.trackId, req, res);
});

// Artwork endpoint
app.get('/api/artwork/:trackId', async (req, res) => {
  await streamer.getArtwork(req.params.trackId, res);
});

// Extract metadata for new file
const info = await metadata.extractMetadata('/path/to/track.mp3');
*/
