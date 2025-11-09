/**
 * IMPLEMENTATION SPEC: Utility Modules
 * 
 * This file provides detailed specifications for utility modules.
 */

// =============================================================================
// MODULE: src/utils/config.js
// =============================================================================

/**
 * Configuration Management
 * 
 * Loads and manages application configuration from environment variables
 * and config files.
 */

const path = require('path');
const os = require('os');

/**
 * Get default Serato path based on OS
 */
function getDefaultSeratoPath() {
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === 'darwin') {
    // macOS
    return path.join(homeDir, 'Music', '_Serato_');
  } else if (platform === 'win32') {
    // Windows
    return path.join(homeDir, 'Music', '_Serato_');
  } else {
    // Linux or other
    return path.join(homeDir, 'Music', '_Serato_');
  }
}

/**
 * Configuration object
 */
const config = {
  serato: {
    libraryPath: process.env.SERATO_PATH || getDefaultSeratoPath()
  },
  server: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost'
  },
  discovery: {
    serviceName: 'CrateLink',
    serviceType: 'http'
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '300000'), // 5 minutes
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '1000')
  },
  streaming: {
    chunkSize: 1024 * 256, // 256 KB
    maxConcurrentStreams: 10
  }
};

module.exports = config;

// =============================================================================
// MODULE: src/utils/logger.js
// =============================================================================

/**
 * Logging Utility
 * 
 * Simple colored console logging with different levels.
 */

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'info';
  }

  /**
   * Format timestamp
   */
  timestamp() {
    return new Date().toISOString();
  }

  /**
   * Log info message
   */
  info(...args) {
    console.log(
      `${colors.cyan}[INFO]${colors.reset}`,
      `[${this.timestamp()}]`,
      ...args
    );
  }

  /**
   * Log error message
   */
  error(...args) {
    console.error(
      `${colors.red}[ERROR]${colors.reset}`,
      `[${this.timestamp()}]`,
      ...args
    );
  }

  /**
   * Log warning message
   */
  warn(...args) {
    console.warn(
      `${colors.yellow}[WARN]${colors.reset}`,
      `[${this.timestamp()}]`,
      ...args
    );
  }

  /**
   * Log debug message
   */
  debug(...args) {
    if (this.level === 'debug') {
      console.log(
        `${colors.magenta}[DEBUG]${colors.reset}`,
        `[${this.timestamp()}]`,
        ...args
      );
    }
  }

  /**
   * Log success message
   */
  success(...args) {
    console.log(
      `${colors.green}[SUCCESS]${colors.reset}`,
      `[${this.timestamp()}]`,
      ...args
    );
  }
}

module.exports = new Logger();

// =============================================================================
// MODULE: src/utils/discovery.js
// =============================================================================

/**
 * Service Discovery via mDNS (Bonjour)
 * 
 * Allows mobile apps to auto-discover the desktop service on the local network.
 */

const bonjour = require('bonjour')();

class ServiceDiscovery {
  /**
   * Constructor
   * @param {number} port - Server port
   */
  constructor(port) {
    this.port = port;
    this.service = null;
  }

  /**
   * Method: start
   * 
   * Start advertising the service via mDNS.
   * 
   * Implementation:
   * 1. Create Bonjour service
   * 2. Publish with service type and name
   * 3. Include port and metadata
   * 
   * @returns {Promise<void>}
   */
  async start() {
    this.service = bonjour.publish({
      name: 'CrateLink',
      type: 'http',
      port: this.port,
      txt: {
        version: require('../../package.json').version,
        service: 'cratelink'
      }
    });

    console.log('🔍 Service published via mDNS as "CrateLink"');
  }

  /**
   * Method: stop
   * 
   * Stop advertising the service.
   * 
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.service) {
      this.service.stop(() => {
        console.log('Service discovery stopped');
      });
    }
  }
}

module.exports = { ServiceDiscovery };

// =============================================================================
// MODULE: src/serato/watcher.js
// =============================================================================

/**
 * File System Watcher
 * 
 * Watches Serato directory for changes and emits events.
 */

const chokidar = require('chokidar');
const { EventEmitter } = require('events');

class FileWatcher extends EventEmitter {
  /**
   * Constructor
   * @param {string} seratoPath - Path to watch
   */
  constructor(seratoPath) {
    super();
    this.seratoPath = seratoPath;
    this.watcher = null;
  }

  /**
   * Method: start
   * 
   * Start watching for file changes.
   * 
   * Implementation:
   * 1. Create chokidar watcher
   * 2. Watch for add, change, unlink events
   * 3. Debounce rapid changes
   * 4. Emit normalized events
   * 
   * @returns {Promise<void>}
   */
  async start() {
    this.watcher = chokidar.watch(this.seratoPath, {
      ignored: /(^|[\/\\])\../, // Ignore hidden files
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', path => this.emit('change', { type: 'add', path }))
      .on('change', path => this.emit('change', { type: 'change', path }))
      .on('unlink', path => this.emit('change', { type: 'unlink', path }));

    console.log('👀 Watching for file changes...');
  }

  /**
   * Method: stop
   * 
   * Stop watching.
   * 
   * @returns {Promise<void>}
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      console.log('File watcher stopped');
    }
  }
}

module.exports = { FileWatcher };

// =============================================================================
// MODULE: src/utils/cache.js
// =============================================================================

/**
 * Simple LRU Cache
 * 
 * In-memory cache with size limit and TTL.
 */

class LRUCache {
  /**
   * Constructor
   * @param {number} maxSize - Maximum number of items
   * @param {number} ttl - Time to live in milliseconds
   */
  constructor(maxSize = 1000, ttl = 300000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  /**
   * Get item from cache
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) return null;
    
    // Check TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    return item.value;
  }

  /**
   * Set item in cache
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    // Remove if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Check size limit
    if (this.cache.size >= this.maxSize) {
      // Remove oldest (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    // Add new item
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Check if key exists
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete item
   * @param {string} key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all items
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }
}

module.exports = { LRUCache };

// =============================================================================
// EXPORTS
// =============================================================================

// Each module exports separately, but here's a summary:
/*
const config = require('./utils/config');
const logger = require('./utils/logger');
const { ServiceDiscovery } = require('./utils/discovery');
const { FileWatcher } = require('./serato/watcher');
const { LRUCache } = require('./utils/cache');
*/
