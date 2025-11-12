const path = require("path");
const os = require("os");
require("dotenv").config({
  path: path.join(__dirname, "..", "..", ".env"),
  override: true
});

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
 * Configuration object
 * Priority: Command-line args > Environment variables > Defaults
 */
const config = {
  // Serato configuration
  serato: {
    path: cmdArgs['serato-path'] || process.env.SERATO_PATH || detectSeratoPath(),
    musicPath: cmdArgs['music-path'] || process.env.MUSIC_PATH || null,
    databaseFile: "database V2",
    cratesDir: "Subcrates",
  },

  // Server configuration
  server: {
    port: parseInt(cmdArgs['port'], 10) || parseInt(process.env.PORT, 10) || 3000,
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
