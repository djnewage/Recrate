/**
 * Musical Key to Camelot Notation Converter
 * Converts standard musical key notation to Camelot wheel notation
 */

// Camelot wheel mapping
// A = minor keys, B = major keys
const CAMELOT_MAP = {
  // Minor keys (A)
  'abm': '1A', 'g#m': '1A',
  'ebm': '2A', 'd#m': '2A',
  'bbm': '3A', 'a#m': '3A',
  'fm': '4A',
  'cm': '5A',
  'gm': '6A',
  'dm': '7A',
  'am': '8A',
  'em': '9A',
  'bm': '10A',
  'f#m': '11A', 'gbm': '11A',
  'c#m': '12A', 'dbm': '12A',

  // Major keys (B)
  'b': '1B',
  'f#': '2B', 'gb': '2B',
  'db': '3B', 'c#': '3B',
  'ab': '4B', 'g#': '4B',
  'eb': '5B', 'd#': '5B',
  'bb': '6B', 'a#': '6B',
  'f': '7B',
  'c': '8B',
  'g': '9B',
  'd': '10B',
  'a': '11B',
  'e': '12B',
};

/**
 * Normalize a key string for lookup
 * Handles various formats: "Am", "A minor", "Amin", "A min", etc.
 * @param {string} key - Raw key string
 * @returns {string} Normalized key for lookup
 */
function normalizeKey(key) {
  if (!key) return null;

  let normalized = key.toLowerCase().trim();

  // Remove common suffixes/prefixes
  normalized = normalized
    .replace(/\s*(major|maj)\s*/gi, '')
    .replace(/\s*(minor|min)\s*/gi, 'm')
    .replace(/\s+/g, '');

  // Handle "flat" and "sharp" written out
  normalized = normalized
    .replace(/flat/gi, 'b')
    .replace(/sharp/gi, '#');

  return normalized;
}

/**
 * Convert standard musical key notation to Camelot notation
 * @param {string} key - Key in standard notation (e.g., "Am", "C", "F#m", "Bb")
 * @returns {string|null} Camelot notation (e.g., "8A", "8B", "11A", "6B") or null if unknown
 */
function toCamelot(key) {
  if (!key) return null;

  // If already in Camelot format, return as-is
  if (/^\d{1,2}[AB]$/i.test(key.trim())) {
    return key.trim().toUpperCase();
  }

  const normalized = normalizeKey(key);
  if (!normalized) return null;

  return CAMELOT_MAP[normalized] || null;
}

/**
 * Convert Camelot notation to standard musical key
 * @param {string} camelot - Camelot notation (e.g., "8A", "8B")
 * @returns {string|null} Standard key notation (e.g., "Am", "C")
 */
function fromCamelot(camelot) {
  if (!camelot) return null;

  const normalized = camelot.trim().toUpperCase();

  // Reverse lookup
  for (const [key, value] of Object.entries(CAMELOT_MAP)) {
    if (value === normalized) {
      // Return the first (canonical) match
      // Format nicely: capitalize first letter, keep 'm' lowercase for minor
      if (key.endsWith('m')) {
        return key.slice(0, -1).toUpperCase() + 'm';
      }
      return key.toUpperCase();
    }
  }

  return null;
}

/**
 * Check if two keys are compatible for mixing (Camelot wheel rules)
 * Compatible keys: same key, +/-1 number, or same number different letter
 * @param {string} key1 - First key (Camelot notation)
 * @param {string} key2 - Second key (Camelot notation)
 * @returns {boolean} True if keys are mix-compatible
 */
function areKeysCompatible(key1, key2) {
  if (!key1 || !key2) return false;

  const match1 = key1.match(/^(\d{1,2})([AB])$/i);
  const match2 = key2.match(/^(\d{1,2})([AB])$/i);

  if (!match1 || !match2) return false;

  const num1 = parseInt(match1[1], 10);
  const letter1 = match1[2].toUpperCase();
  const num2 = parseInt(match2[1], 10);
  const letter2 = match2[2].toUpperCase();

  // Same key
  if (num1 === num2 && letter1 === letter2) return true;

  // Same number, different letter (relative major/minor)
  if (num1 === num2) return true;

  // Adjacent numbers, same letter (handle wrap-around 12 <-> 1)
  if (letter1 === letter2) {
    const diff = Math.abs(num1 - num2);
    if (diff === 1 || diff === 11) return true;
  }

  return false;
}

module.exports = {
  toCamelot,
  fromCamelot,
  areKeysCompatible,
  normalizeKey,
};
