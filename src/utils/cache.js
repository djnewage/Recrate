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

module.exports = LRUCache;
