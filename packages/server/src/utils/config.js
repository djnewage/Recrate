const path = require("path");
const os = require("os");

// Runtime config can be set programmatically (e.g., from Electron main process)
let runtimeConfig = null;

/**
 * Set runtime configuration (call before accessing config properties)
 * @param {Object} cfg - Configuration object
 * @param {string} cfg.seratoPath - Path to Serato library
 * @param {string[]} cfg.musicPaths - Array of music directories
 * @param {number} cfg.port - Server port
 */
function setRuntimeConfig(cfg) {
  runtimeConfig = cfg;
}

// Only load .env if not in Electron packaged app
try {
  require("dotenv").config({
    path: path.join(__dirname, "..", "..", ".env"),
    override: true
  });
} catch (e) {
  // dotenv may not be available or .env may not exist - that's fine
}

/**
 * Auto-detect Serato installation path based on OS
 */
function detectSeratoPath() {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === "darwin") {
    // macOS
    return path.join(homeDir, "Music", "_Serato_");
  } else if (platform === "win32") {
    // Windows
    return path.join(homeDir, "Music", "_Serato_");
  } else {
    // Linux or other
    return path.join(homeDir, "Music", "_Serato_");
  }
}

/**
 * Parse comma-separated paths into array
 * @param {string} pathString - Comma-separated paths
 * @returns {Array<string>} Array of paths
 */
function parsePaths(pathString) {
  if (!pathString) {
    return [];
  }
  return pathString.split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      args[key] = value;
    }
  }
  return args;
}

const cmdArgs = parseArgs();

/**
 * Get music paths configuration
 * Supports multiple music directories via comma-separated paths
 */
function getMusicPaths() {
  // Priority 1: Command-line --music-paths or --music-path
  if (cmdArgs['music-paths']) {
    return parsePaths(cmdArgs['music-paths']);
  }
  if (cmdArgs['music-path']) {
    return [cmdArgs['music-path']];
  }

  // Priority 2: MUSIC_PATHS environment variable (comma-separated)
  if (process.env.MUSIC_PATHS) {
    return parsePaths(process.env.MUSIC_PATHS);
  }

  // Priority 3: MUSIC_PATH environment variable (single path, backwards compatible)
  if (process.env.MUSIC_PATH) {
    return parsePaths(process.env.MUSIC_PATH); // Also supports comma-separated for flexibility
  }

  // Priority 4: Default to parent of Serato path
  const seratoPath = cmdArgs['serato-path'] || process.env.SERATO_PATH || detectSeratoPath();
  const defaultMusicPath = path.dirname(seratoPath);
  return [defaultMusicPath];
}

/**
 * Configuration object
 * Priority: Runtime config > Command-line args > Environment variables > Defaults
 */
const config = {
  // Serato configuration
  serato: {
    get path() {
      return runtimeConfig?.seratoPath || cmdArgs['serato-path'] || process.env.SERATO_PATH || detectSeratoPath();
    },
    get musicPaths() {
      return runtimeConfig?.musicPaths || getMusicPaths();
    },
    databaseFile: "database V2",
    cratesDir: "Subcrates",
  },

  // Server configuration
  server: {
    get port() {
      return runtimeConfig?.port || parseInt(cmdArgs['port'], 10) || parseInt(process.env.PORT, 10) || 3000;
    },
    host: cmdArgs['host'] || process.env.HOST || "0.0.0.0",
  },

  // Cache configuration
  cache: {
    maxSize: parseInt(process.env.CACHE_MAX_SIZE, 10) || 1000,
    ttl: parseInt(process.env.CACHE_TTL, 10) || 3600000, // 1 hour in ms
  },

  // Service discovery
  discovery: {
    enabled: process.env.MDNS_ENABLED !== "false",
    serviceName: process.env.SERVICE_NAME || "Recrate",
    serviceType: "Recrate",
  },

  // Environment
  env: process.env.NODE_ENV || "development",
  isDevelopment: process.env.NODE_ENV !== "production",
  isProduction: process.env.NODE_ENV === "production",
};

module.exports = config;
module.exports.setRuntimeConfig = setRuntimeConfig;
