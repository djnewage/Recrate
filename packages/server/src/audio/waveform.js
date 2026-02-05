const { spawn } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const pathResolver = require('../utils/pathResolver');

/**
 * Waveform generator using FFmpeg
 * Extracts audio peaks for visualization
 */
class WaveformGenerator {
  constructor(parser, cache) {
    this.parser = parser;
    this.cache = cache; // FileCache instance for persistent storage
    this.defaultPeakCount = 150; // Number of peaks to generate
    this.sampleRate = 8000; // Low sample rate for efficiency
  }

  /**
   * Check if FFmpeg is available
   */
  async checkFFmpeg() {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-version']);
      ffmpeg.on('error', () => resolve(false));
      ffmpeg.on('close', (code) => resolve(code === 0));
    });
  }

  /**
   * Get waveform data for a track
   * Returns cached data if available, otherwise generates new waveform
   */
  async getWaveform(trackId, peakCount = this.defaultPeakCount) {
    try {
      // Check cache first
      const cacheKey = `waveform-${trackId}`;
      const cached = await this.cache.load(cacheKey);

      if (cached && cached.data && cached.data.peakCount === peakCount) {
        logger.debug(`Waveform cache hit for track ${trackId}`);
        return cached.data;
      }

      // Get track from parser
      const track = await this.parser.getTrackById(trackId);
      if (!track) {
        return null;
      }

      // Resolve file path
      const filePath = await this._resolveFilePath(track);
      if (!filePath) {
        return null;
      }

      // Check file modification time for cache validation
      const stats = await fsPromises.stat(filePath);
      if (cached && cached.sourceModified >= stats.mtime.getTime()) {
        logger.debug(`Waveform cache valid for track ${trackId}`);
        return cached.data;
      }

      // Generate waveform
      logger.info(`Generating waveform for track ${trackId}: ${track.title}`);
      const peaks = await this._generatePeaks(filePath, peakCount);

      const waveformData = {
        trackId,
        peaks,
        duration: track.duration || 0,
        peakCount: peaks.length,
        generatedAt: new Date().toISOString(),
      };

      // Save to cache
      await this.cache.save(cacheKey, waveformData, {
        sourceModified: stats.mtime.getTime(),
      });

      return waveformData;
    } catch (error) {
      logger.error(`Error getting waveform for track ${trackId}:`, error);
      return null;
    }
  }

  /**
   * Resolve the actual file path for a track
   */
  async _resolveFilePath(track) {
    let filePath = track.verifiedPath || track.filePath;

    try {
      await fsPromises.access(filePath, fs.constants.R_OK);
      return filePath;
    } catch {
      // Try path resolution
      const resolvedPath = await pathResolver.resolvePath(track.filePath, track);
      if (resolvedPath) {
        try {
          await fsPromises.access(resolvedPath, fs.constants.R_OK);
          return resolvedPath;
        } catch {
          logger.warn(`Resolved path not accessible: ${resolvedPath}`);
        }
      }
    }

    logger.warn(`Could not resolve file path for track: ${track.filePath}`);
    return null;
  }

  /**
   * Generate peak data from audio file using FFmpeg
   */
  async _generatePeaks(filePath, peakCount) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      // Normalize path for FFmpeg (use forward slashes on all platforms)
      // Windows backslashes are interpreted as escape sequences by FFmpeg
      const normalizedPath = filePath.replace(/\\/g, '/');

      // FFmpeg command to extract raw PCM data
      // -i: input file
      // -ac 1: mono
      // -ar 8000: 8kHz sample rate (efficient for visualization)
      // -f s16le: 16-bit signed little-endian PCM
      // -acodec pcm_s16le: PCM codec
      // pipe:1: output to stdout
      const ffmpeg = spawn('ffmpeg', [
        '-i', normalizedPath,
        '-ac', '1',
        '-ar', String(this.sampleRate),
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-v', 'quiet', // Suppress output
        'pipe:1'
      ]);

      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.stderr.on('data', (data) => {
        // FFmpeg writes progress to stderr, ignore it
        logger.debug(`FFmpeg: ${data.toString()}`);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}`));
          return;
        }

        try {
          const buffer = Buffer.concat(chunks);
          const peaks = this._calculatePeaks(buffer, peakCount);
          resolve(peaks);
        } catch (error) {
          reject(error);
        }
      });

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        ffmpeg.kill();
        reject(new Error('FFmpeg timeout'));
      }, 30000);

      ffmpeg.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * Calculate peak amplitudes from PCM buffer
   */
  _calculatePeaks(buffer, peakCount) {
    // PCM data is 16-bit signed, so 2 bytes per sample
    const bytesPerSample = 2;
    const totalSamples = Math.floor(buffer.length / bytesPerSample);

    if (totalSamples === 0) {
      return Array(peakCount).fill(0);
    }

    const samplesPerPeak = Math.floor(totalSamples / peakCount);
    const peaks = [];

    for (let i = 0; i < peakCount; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, totalSamples);

      let maxAmplitude = 0;

      for (let j = start; j < end; j++) {
        const offset = j * bytesPerSample;
        if (offset + 1 < buffer.length) {
          // Read 16-bit signed little-endian value
          const sample = buffer.readInt16LE(offset);
          const amplitude = Math.abs(sample);
          if (amplitude > maxAmplitude) {
            maxAmplitude = amplitude;
          }
        }
      }

      peaks.push(maxAmplitude);
    }

    // Normalize peaks to 0-1 range
    const maxPeak = Math.max(...peaks, 1); // Prevent division by zero
    const normalizedPeaks = peaks.map(p => Number((p / maxPeak).toFixed(4)));

    return normalizedPeaks;
  }

  /**
   * Clear waveform cache for a specific track
   */
  async clearCache(trackId) {
    const cacheKey = `waveform-${trackId}`;
    return await this.cache.delete(cacheKey);
  }

  /**
   * Clear all waveform caches
   */
  async clearAllCaches() {
    // This will clear all caches, not just waveforms
    // In a production system, you might want to be more selective
    logger.info('Clearing all waveform caches');
    return await this.cache.clear();
  }
}

module.exports = WaveformGenerator;
