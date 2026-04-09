#!/usr/bin/env node

/**
 * Download platform-specific FFmpeg static binary for bundling with Electron.
 *
 * Binaries are sourced from the ffmpeg-static GitHub releases:
 *   https://github.com/eugeneware/ffmpeg-static/releases
 *
 * Usage:
 *   node download-ffmpeg.js [--output <dir>]
 *
 * Environment variables:
 *   TARGET_PLATFORM  - Override platform (darwin, win32, linux). Defaults to process.platform.
 *   TARGET_ARCH      - Override arch (x64, arm64). Defaults to process.arch.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGunzip } = require('zlib');

const FFMPEG_VERSION = 'b6.0';
const BASE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_VERSION}`;

const CACHE_DIR = path.join(__dirname, '..', '.ffmpeg-cache');

function getTargetPlatform() {
  return process.env.TARGET_PLATFORM || process.platform;
}

function getTargetArch() {
  return process.env.TARGET_ARCH || process.arch;
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

function getDownloadUrl(platform, arch) {
  return `${BASE_URL}/ffmpeg-${platform}-${arch}.gz`;
}

function getCachePath(platform, arch) {
  return path.join(CACHE_DIR, `ffmpeg-${platform}-${arch}${platform === 'win32' ? '.exe' : ''}`);
}

/**
 * Follow redirects and download a URL to a file, returning a promise.
 */
function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Too many redirects'));
    }

    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'recrate-build' } }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // consume response to free memory
        return downloadFile(res.headers.location, destPath, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
      }

      const gunzip = createGunzip();
      const fileStream = fs.createWriteStream(destPath);

      res.pipe(gunzip).pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(resolve);
      });

      gunzip.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(new Error(`Decompression failed: ${err.message}`));
      });

      fileStream.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function downloadFFmpegSingle(platform, arch, outputDir) {
  const binaryName = getBinaryName(platform);
  const outputPath = path.join(outputDir, binaryName);
  const cachePath = getCachePath(platform, arch);

  console.log(`  Platform: ${platform}, Arch: ${arch}`);
  console.log(`  Output:   ${outputDir}/${binaryName}`);

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Check cache first
  if (fs.existsSync(cachePath)) {
    console.log(`  Using cached FFmpeg binary`);
    fs.copyFileSync(cachePath, outputPath);
    if (platform !== 'win32') {
      fs.chmodSync(outputPath, 0o755);
    }
    return outputPath;
  }

  // Download
  const url = getDownloadUrl(platform, arch);
  console.log(`  Downloading from: ${url}`);

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Download to cache first, then copy to output
  const tempPath = cachePath + '.tmp';
  try {
    await downloadFile(url, tempPath);
    fs.renameSync(tempPath, cachePath);
  } catch (err) {
    // Clean up temp file on failure
    try { fs.unlinkSync(tempPath); } catch (_) {}
    throw err;
  }

  // Copy to output
  fs.copyFileSync(cachePath, outputPath);
  if (platform !== 'win32') {
    fs.chmodSync(outputPath, 0o755);
  }

  const size = fs.statSync(outputPath).size;
  console.log(`  Downloaded FFmpeg (${(size / 1024 / 1024).toFixed(1)} MB)`);

  return outputPath;
}

async function downloadFFmpeg(options = {}) {
  const platform = options.platform || getTargetPlatform();
  const arch = options.arch || getTargetArch();
  const outputDir = options.outputDir || path.join(__dirname, '..', 'server-bundle', 'ffmpeg');

  // On macOS, download both x64 and arm64 into arch-specific subdirs
  // so a single electron-builder invocation can produce both arch installers
  if (platform === 'darwin' && !options.singleArch) {
    console.log('  macOS detected — downloading both x64 and arm64 binaries');
    const x64Path = await downloadFFmpegSingle(platform, 'x64', path.join(outputDir, 'x64'));
    const arm64Path = await downloadFFmpegSingle(platform, 'arm64', path.join(outputDir, 'arm64'));
    return arm64Path;
  }

  return downloadFFmpegSingle(platform, arch, outputDir);
}

// Allow running directly or requiring as a module
if (require.main === module) {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  downloadFFmpeg({ outputDir })
    .then((p) => {
      console.log(`\n✅ FFmpeg binary ready at: ${p}`);
    })
    .catch((err) => {
      console.error(`\n❌ Failed to download FFmpeg: ${err.message}`);
      process.exit(1);
    });
}

module.exports = downloadFFmpeg;
