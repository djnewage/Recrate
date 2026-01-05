/**
 * Parser Factory - Creates the appropriate parser for the given DJ software type
 */

const { SeratoParser, SeratoNotFoundError, ParseError, CrateNotFoundError } = require('./serato/parser');
const { SeratoWriter } = require('./serato/writer');
const { TraktorParser } = require('./traktor/parser');
const { RekordboxParser } = require('./rekordbox/parser');
const { VirtualDJParser } = require('./virtualdj/parser');
const { BaseParser, LibraryNotFoundError } = require('./BaseParser');

// Registry of available parsers
const PARSERS = {
  serato: {
    Parser: SeratoParser,
    Writer: SeratoWriter,
    name: 'Serato DJ',
    available: true
  },
  traktor: {
    Parser: TraktorParser,
    Writer: null, // Write support not yet implemented
    name: 'Traktor Pro',
    available: true
  },
  rekordbox: {
    Parser: RekordboxParser,
    Writer: null, // Write support not yet implemented
    name: 'rekordbox',
    available: true
  },
  virtualdj: {
    Parser: VirtualDJParser,
    Writer: null, // Write support not yet implemented
    name: 'Virtual DJ',
    available: true
  }
};

/**
 * Create a parser instance for the given DJ software type
 *
 * @param {string} libraryType - DJ software type ('serato', 'traktor', 'rekordbox', 'virtualdj')
 * @param {string} libraryPath - Path to the DJ library
 * @param {string|string[]} musicPaths - Path(s) to music files
 * @param {Object} [cacheConfig] - Cache configuration
 * @returns {BaseParser} Parser instance
 * @throws {Error} If parser type is not supported or not implemented
 */
function createParser(libraryType, libraryPath, musicPaths, cacheConfig = {}) {
  const parserInfo = PARSERS[libraryType];

  if (!parserInfo) {
    throw new Error(`Unknown DJ software type: ${libraryType}. Supported types: ${Object.keys(PARSERS).join(', ')}`);
  }

  if (!parserInfo.available || !parserInfo.Parser) {
    throw new Error(`Parser for ${parserInfo.name} is not yet implemented`);
  }

  return new parserInfo.Parser(libraryPath, musicPaths, cacheConfig);
}

/**
 * Create a writer instance for the given DJ software type
 *
 * @param {string} libraryType - DJ software type
 * @param {string} libraryPath - Path to the DJ library
 * @returns {Object|null} Writer instance or null if not supported
 */
function createWriter(libraryType, libraryPath) {
  const parserInfo = PARSERS[libraryType];

  if (!parserInfo || !parserInfo.available || !parserInfo.Writer) {
    return null;
  }

  return new parserInfo.Writer(libraryPath);
}

/**
 * Get list of available (implemented) parser types
 * @returns {string[]}
 */
function getAvailableParsers() {
  return Object.entries(PARSERS)
    .filter(([, info]) => info.available)
    .map(([type]) => type);
}

/**
 * Get list of all parser types (including unimplemented)
 * @returns {Object[]}
 */
function getAllParserTypes() {
  return Object.entries(PARSERS).map(([type, info]) => ({
    type,
    name: info.name,
    available: info.available
  }));
}

/**
 * Check if a parser type is available
 * @param {string} libraryType
 * @returns {boolean}
 */
function isParserAvailable(libraryType) {
  const info = PARSERS[libraryType];
  return info && info.available;
}

module.exports = {
  createParser,
  createWriter,
  getAvailableParsers,
  getAllParserTypes,
  isParserAvailable,
  // Re-export error classes for convenience
  LibraryNotFoundError,
  SeratoNotFoundError,
  ParseError,
  CrateNotFoundError,
  // Re-export base class
  BaseParser
};
