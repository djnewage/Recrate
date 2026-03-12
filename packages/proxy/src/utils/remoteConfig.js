const admin = require('firebase-admin');
const logger = require('./logger');

// Cache remote config values with TTL
let configCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Default values (used if Remote Config fetch fails)
const DEFAULTS = {
  beta_mode: false,
  trial_duration_days: 7,
};

/**
 * Get a Remote Config value by key
 * Falls back to default if Remote Config is unavailable
 * @param {string} key - Remote Config parameter key
 * @returns {Promise<any>} The config value
 */
async function getConfigValue(key) {
  const cached = configCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const remoteConfig = admin.remoteConfig();
    const template = await remoteConfig.getTemplate();
    const param = template.parameters[key];

    if (param?.defaultValue?.value !== undefined) {
      const value = param.defaultValue.value;

      // Parse booleans
      if (value === 'true') {
        configCache[key] = { value: true, timestamp: Date.now() };
        return true;
      }
      if (value === 'false') {
        configCache[key] = { value: false, timestamp: Date.now() };
        return false;
      }

      // Try to parse as number
      const numValue = Number(value);
      const result = isNaN(numValue) ? value : numValue;

      configCache[key] = { value: result, timestamp: Date.now() };
      return result;
    }
  } catch (error) {
    logger.warn(`[RemoteConfig] Failed to fetch '${key}', using default:`, error.message);
  }

  // Return default
  const defaultValue = DEFAULTS[key];
  configCache[key] = { value: defaultValue, timestamp: Date.now() };
  return defaultValue;
}

/**
 * Get beta mode flag from Remote Config
 * @returns {Promise<boolean>}
 */
async function getBetaMode() {
  return getConfigValue('beta_mode');
}

/**
 * Get the trial duration in days from Remote Config
 * @returns {Promise<number>} Trial duration in days
 */
async function getTrialDurationDays() {
  return getConfigValue('trial_duration_days');
}

/**
 * Clear the config cache (useful for testing)
 */
function clearCache() {
  configCache = {};
}

module.exports = {
  getConfigValue,
  getBetaMode,
  getTrialDurationDays,
  clearCache,
};
