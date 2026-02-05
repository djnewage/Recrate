const { spawn } = require('child_process');
const fs = require('fs');
const fsPromises = require('fs').promises;
const FFT = require('fft.js');
const logger = require('../utils/logger');
const pathResolver = require('../utils/pathResolver');

/**
 * Spectral Analyzer using FFmpeg + FFT
 * Extracts frequency band data for Serato-style colored waveforms
 *
 * Frequency bands (based on Serato research):
 * - Bass: 20-200 Hz (Warm Red #E84855)
 * - Mids: 200-1500 Hz (Purple #9B5DE5)
 * - Highs: 1500-20000 Hz (Cyan #00BBF9)
 *
 * Crossover points match actual Serato DJ behavior:
 * - Bass to Mids: ~200 Hz
 * - Mids to Highs: ~1.5 kHz
 */
class SpectralAnalyzer {
  constructor(parser, cache) {
    this.parser = parser;
    this.cache = cache;
    this.defaultSampleCount = 800; // More samples for spectral detail
    this.sampleRate = 44100; // Higher sample rate for frequency accuracy
    this.fftSize = 2048; // FFT window size
    this.hopSize = 512; // Overlap for smoother analysis
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
   * Get spectral waveform data for a track
   * Returns frequency band data (bass, mids, highs) for colored waveform rendering
   */
  async getSpectralData(trackId, sampleCount = this.defaultSampleCount) {
    try {
      // Check cache first
      const cacheKey = `spectral-${trackId}-${sampleCount}`;
      const cached = await this.cache.load(cacheKey);

      if (cached && cached.data && cached.data.sampleCount === sampleCount) {
        logger.debug(`Spectral cache hit for track ${trackId}`);
        return cached.data;
      }

      // Get track from parser
      const track = await this.parser.getTrackById(trackId);
      if (!track) {
        logger.warn(`Track not found: ${trackId}`);
        return null;
      }

      // Resolve file path
      const filePath = await this._resolveFilePath(track);
      if (!filePath) {
        logger.warn(`Could not resolve file path for track: ${trackId}`);
        return null;
      }

      // Check file modification time for cache validation
      const stats = await fsPromises.stat(filePath);
      if (cached && cached.sourceModified >= stats.mtime.getTime()) {
        logger.debug(`Spectral cache valid for track ${trackId}`);
        return cached.data;
      }

      // Generate spectral data
      logger.info(`Generating spectral data for track ${trackId}: ${track.title}`);
      const spectralData = await this._generateSpectralData(filePath, sampleCount);

      const result = {
        trackId,
        duration: track.duration || 0,
        sampleCount: spectralData.peaks.length,
        bands: spectralData.bands,
        peaks: spectralData.peaks,
        generatedAt: new Date().toISOString(),
      };

      // Save to cache
      await this.cache.save(cacheKey, result, {
        sourceModified: stats.mtime.getTime(),
      });

      return result;
    } catch (error) {
      logger.error(`Error getting spectral data for track ${trackId}:`, error);
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

    return null;
  }

  /**
   * Generate spectral data from audio file using FFmpeg + FFT
   */
  async _generateSpectralData(filePath, sampleCount) {
    const pcmBuffer = await this._extractPCM(filePath);

    // Convert PCM buffer to float samples
    const samples = this._pcmToFloat(pcmBuffer);

    // Perform STFT (Short-Time Fourier Transform)
    const spectralFrames = this._performSTFT(samples);

    // Extract frequency bands and downsample to requested sample count
    return this._extractBands(spectralFrames, sampleCount);
  }

  /**
   * Extract PCM data from audio file using FFmpeg
   */
  _extractPCM(filePath) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      // Normalize path for FFmpeg (use forward slashes on all platforms)
      // Windows backslashes are interpreted as escape sequences by FFmpeg
      const normalizedPath = filePath.replace(/\\/g, '/');

      const ffmpeg = spawn('ffmpeg', [
        '-i', normalizedPath,
        '-ac', '1', // Mono
        '-ar', String(this.sampleRate), // 44.1kHz for frequency accuracy
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-v', 'quiet',
        'pipe:1'
      ]);

      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg spawn error: ${error.message}`));
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      // Timeout after 60 seconds for longer files
      const timeout = setTimeout(() => {
        ffmpeg.kill();
        reject(new Error('FFmpeg timeout'));
      }, 60000);

      ffmpeg.on('close', () => clearTimeout(timeout));
    });
  }

  /**
   * Convert 16-bit PCM buffer to normalized float array (-1 to 1)
   */
  _pcmToFloat(buffer) {
    const bytesPerSample = 2;
    const totalSamples = Math.floor(buffer.length / bytesPerSample);
    const samples = new Float32Array(totalSamples);

    for (let i = 0; i < totalSamples; i++) {
      const offset = i * bytesPerSample;
      const sample = buffer.readInt16LE(offset);
      samples[i] = sample / 32768.0; // Normalize to -1 to 1
    }

    return samples;
  }

  /**
   * Perform Short-Time Fourier Transform (STFT)
   * Returns array of magnitude spectra for each time window
   */
  _performSTFT(samples) {
    const fft = new FFT(this.fftSize);
    const frames = [];
    const numFrames = Math.floor((samples.length - this.fftSize) / this.hopSize) + 1;

    // Hann window for smoother frequency analysis
    const window = this._hannWindow(this.fftSize);

    for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
      const startSample = frameIdx * this.hopSize;

      // Extract and window the frame
      const frame = new Array(this.fftSize);
      for (let i = 0; i < this.fftSize; i++) {
        const sampleIdx = startSample + i;
        if (sampleIdx < samples.length) {
          frame[i] = samples[sampleIdx] * window[i];
        } else {
          frame[i] = 0;
        }
      }

      // Perform FFT
      const out = fft.createComplexArray();
      fft.realTransform(out, frame);
      fft.completeSpectrum(out);

      // Calculate magnitude spectrum (only positive frequencies)
      const magnitudes = new Float32Array(this.fftSize / 2);
      for (let i = 0; i < this.fftSize / 2; i++) {
        const real = out[2 * i];
        const imag = out[2 * i + 1];
        magnitudes[i] = Math.sqrt(real * real + imag * imag);
      }

      frames.push(magnitudes);
    }

    return frames;
  }

  /**
   * Generate Hann window for smoother FFT analysis
   */
  _hannWindow(size) {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)));
    }
    return window;
  }

  /**
   * Extract bass, mids, highs bands from spectral frames
   * Downsample to requested sample count
   */
  _extractBands(frames, sampleCount) {
    if (frames.length === 0) {
      return {
        bands: {
          bass: Array(sampleCount).fill(0),
          mids: Array(sampleCount).fill(0),
          highs: Array(sampleCount).fill(0),
        },
        peaks: Array(sampleCount).fill(0),
      };
    }

    // Frequency resolution: each bin represents sampleRate / fftSize Hz
    const freqResolution = this.sampleRate / this.fftSize;

    // Calculate bin ranges for each frequency band (Serato-style crossovers)
    // Bass: 20-200 Hz (kicks, bass lines, sub-bass)
    const bassStart = Math.floor(20 / freqResolution);
    const bassEnd = Math.floor(200 / freqResolution);

    // Mids: 200-1500 Hz (snares, vocals, synths)
    const midsStart = bassEnd;
    const midsEnd = Math.floor(1500 / freqResolution);

    // Highs: 1500-20000 Hz (hi-hats, cymbals, crashes)
    const highsStart = midsEnd;
    const highsEnd = Math.min(Math.floor(20000 / freqResolution), this.fftSize / 2);

    // Extract energy in each band for all frames
    const bassEnergy = [];
    const midsEnergy = [];
    const highsEnergy = [];
    const totalEnergy = [];

    for (const frame of frames) {
      // Sum energy in each band
      let bass = 0, mids = 0, highs = 0, total = 0;

      for (let i = bassStart; i < bassEnd && i < frame.length; i++) {
        bass += frame[i] * frame[i];
      }

      for (let i = midsStart; i < midsEnd && i < frame.length; i++) {
        mids += frame[i] * frame[i];
      }

      for (let i = highsStart; i < highsEnd && i < frame.length; i++) {
        highs += frame[i] * frame[i];
      }

      // Total for overall amplitude
      for (let i = 0; i < frame.length; i++) {
        total += frame[i] * frame[i];
      }

      // RMS (Root Mean Square) for each band
      bassEnergy.push(Math.sqrt(bass / Math.max(1, bassEnd - bassStart)));
      midsEnergy.push(Math.sqrt(mids / Math.max(1, midsEnd - midsStart)));
      highsEnergy.push(Math.sqrt(highs / Math.max(1, highsEnd - highsStart)));
      totalEnergy.push(Math.sqrt(total / frame.length));
    }

    // Downsample to requested sample count
    const bass = this._downsample(bassEnergy, sampleCount);
    const mids = this._downsample(midsEnergy, sampleCount);
    const highs = this._downsample(highsEnergy, sampleCount);
    const peaks = this._downsample(totalEnergy, sampleCount);

    // Normalize each band to 0-1
    const normalizedBass = this._normalize(bass);
    const normalizedMids = this._normalize(mids);
    const normalizedHighs = this._normalize(highs);
    const normalizedPeaks = this._normalize(peaks);

    return {
      bands: {
        bass: normalizedBass,
        mids: normalizedMids,
        highs: normalizedHighs,
      },
      peaks: normalizedPeaks,
    };
  }

  /**
   * Downsample array to target length using linear interpolation
   */
  _downsample(data, targetLength) {
    if (data.length === 0) return Array(targetLength).fill(0);
    if (data.length === targetLength) return data;
    if (data.length < targetLength) {
      // Upsample by repeating values
      const result = [];
      const ratio = data.length / targetLength;
      for (let i = 0; i < targetLength; i++) {
        const srcIdx = Math.floor(i * ratio);
        result.push(data[Math.min(srcIdx, data.length - 1)]);
      }
      return result;
    }

    // Downsample by averaging windows
    const result = [];
    const windowSize = data.length / targetLength;

    for (let i = 0; i < targetLength; i++) {
      const start = Math.floor(i * windowSize);
      const end = Math.floor((i + 1) * windowSize);

      let max = 0;
      for (let j = start; j < end && j < data.length; j++) {
        if (data[j] > max) max = data[j];
      }
      result.push(max);
    }

    return result;
  }

  /**
   * Normalize array to 0-1 range
   */
  _normalize(data) {
    const max = Math.max(...data, 0.001); // Prevent division by zero
    return data.map(v => Number((v / max).toFixed(4)));
  }

  /**
   * Clear spectral cache for a specific track
   */
  async clearCache(trackId) {
    const cacheKey = `spectral-${trackId}`;
    return await this.cache.delete(cacheKey);
  }
}

module.exports = SpectralAnalyzer;
