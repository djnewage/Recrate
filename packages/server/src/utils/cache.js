const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * LRU (Least Recently Used) Cache with TTL support
 */
class LRUCache {
  constructor(maxSize = 100, ttl = 3600000) {
    this.maxSize = maxSize;
    this.ttl = ttl; // Time to live in milliseconds
    this.cache = new Map();
    this.accessOrder = []; // Track access order for LRU
  }

  /**
   * Get value from cache
   */
  get(key) {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.delete(key);
      return null;
    }

    // Update access order (move to end = most recently used)
    this._updateAccessOrder(key);

    return item.value;
  }

  /**
   * Set value in cache
   */
  set(key, value, customTtl = null) {
    const ttl = customTtl !== null ? customTtl : this.ttl;

    // If key exists, remove it from access order
    if (this.cache.has(key)) {
      this._removeFromAccessOrder(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used item
      this._evictLRU();
    }

    // Add to cache
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });

    // Add to end of access order (most recently used)
    this.accessOrder.push(key);

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key) {
    this.cache.delete(key);
    this._removeFromAccessOrder(key);
    return true;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get all keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Update access order for LRU
   */
  _updateAccessOrder(key) {
    this._removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order array
   */
  _removeFromAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict least recently used item
   */
  _evictLRU() {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder.shift();
    this.cache.delete(lruKey);
  }
}

/**
 * File-based persistent cache for library data
 * Stores compressed JSON to disk for fast cold starts
 */
class FileCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.cacheVersion = 1;
  }

  /**
   * Get the cache file path for a given key
   */
  getCacheFilePath(key) {
    return path.join(this.cacheDir, `${key}.json.gz`);
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir() {
    try {
      await fs.promises.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Save data to cache file (compressed)
   * @param {string} key - Cache key (e.g., 'library')
   * @param {any} data - Data to cache
   * @param {Object} metadata - Additional metadata (e.g., sourceModified timestamp)
   */
  async save(key, data, metadata = {}) {
    await this.ensureCacheDir();

    const cacheData = {
      version: this.cacheVersion,
      createdAt: new Date().toISOString(),
      ...metadata,
      data,
    };

    const jsonString = JSON.stringify(cacheData);
    const compressed = await gzip(jsonString);

    const filePath = this.getCacheFilePath(key);
    const tempPath = `${filePath}.tmp`;

    // Atomic write: write to temp file, then rename
    await fs.promises.writeFile(tempPath, compressed);
    await fs.promises.rename(tempPath, filePath);

    return {
      filePath,
      originalSize: jsonString.length,
      compressedSize: compressed.length,
      compressionRatio: (compressed.length / jsonString.length * 100).toFixed(1) + '%',
    };
  }

  /**
   * Load data from cache file
   * @param {string} key - Cache key
   * @param {Object} options - Options for cache validation
   * @param {number} options.sourceModified - Timestamp of source data (cache invalidated if older)
   * @returns {Object|null} Cached data or null if not found/invalid
   */
  async load(key, options = {}) {
    const filePath = this.getCacheFilePath(key);

    try {
      // Check if file exists
      await fs.promises.access(filePath, fs.constants.R_OK);

      const compressed = await fs.promises.readFile(filePath);
      const jsonString = (await gunzip(compressed)).toString('utf8');
      const cacheData = JSON.parse(jsonString);

      // Version check
      if (cacheData.version !== this.cacheVersion) {
        return null;
      }

      // Source modification check (invalidate if source is newer than cache)
      if (options.sourceModified && cacheData.sourceModified) {
        if (options.sourceModified > cacheData.sourceModified) {
          return null;
        }
      }

      return {
        data: cacheData.data,
        createdAt: cacheData.createdAt,
        sourceModified: cacheData.sourceModified,
        trackCount: cacheData.trackCount,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      // Log other errors but don't throw - treat as cache miss
      console.error(`Failed to load cache file ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Delete a cache file
   * @param {string} key - Cache key
   */
  async delete(key) {
    const filePath = this.getCacheFilePath(key);
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // File didn't exist
      }
      throw error;
    }
  }

  /**
   * Clear all cache files in the cache directory
   */
  async clear() {
    try {
      const files = await fs.promises.readdir(this.cacheDir);
      await Promise.all(
        files
          .filter(f => f.endsWith('.json.gz'))
          .map(f => fs.promises.unlink(path.join(this.cacheDir, f)))
      );
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Directory doesn't exist
      }
      throw error;
    }
  }

  /**
   * Check if cache exists and is valid
   * @param {string} key - Cache key
   * @param {Object} options - Validation options
   * @returns {boolean}
   */
  async isValid(key, options = {}) {
    const cached = await this.load(key, options);
    return cached !== null;
  }

  /**
   * Get cache file stats
   * @param {string} key - Cache key
   * @returns {Object|null} File stats or null if not found
   */
  async getStats(key) {
    const filePath = this.getCacheFilePath(key);
    try {
      const stats = await fs.promises.stat(filePath);
      return {
        filePath,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

module.exports = { LRUCache, FileCache };
