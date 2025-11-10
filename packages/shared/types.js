/**
 * @typedef {Object} Track
 * @property {string} id - Unique track identifier
 * @property {string} title - Track title
 * @property {string} artist - Artist name
 * @property {string} album - Album name
 * @property {number} bpm - Beats per minute
 * @property {string} key - Musical key
 * @property {number} duration - Duration in seconds
 * @property {string} filePath - Absolute path to audio file
 * @property {number} [bitrate] - Audio bitrate
 * @property {number} [sampleRate] - Sample rate in Hz
 * @property {string} [genre] - Music genre
 * @property {number} [year] - Release year
 */

/**
 * @typedef {Object} Crate
 * @property {string} id - Unique crate identifier
 * @property {string} name - Crate name
 * @property {number} trackCount - Number of tracks in crate
 * @property {string} color - Hex color code
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {Track[]} [tracks] - Array of tracks (when expanded)
 */

/**
 * @typedef {Object} ServerStatus
 * @property {('running'|'stopped'|'starting'|'error')} status - Server status
 * @property {string} [url] - Server URL when running
 * @property {string} [ip] - Local IP address
 * @property {number} [port] - Server port
 * @property {string} [error] - Error message if status is 'error'
 */

/**
 * @typedef {Object} Config
 * @property {string} seratoPath - Path to Serato library
 * @property {string} [musicPath] - Path to music files
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {boolean} [autoStart] - Auto-start server on launch
 */

module.exports = {};
