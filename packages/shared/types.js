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
 * Supported DJ software platforms
 * @typedef {'serato' | 'traktor' | 'rekordbox' | 'virtualdj'} DJSoftware
 */

/**
 * @typedef {Object} DJLibrary
 * @property {DJSoftware} type - DJ software type
 * @property {string} path - Path to DJ library
 * @property {string} name - Display name (e.g., "Main Library", "External Drive")
 * @property {number} [trackCount] - Number of tracks (if known)
 * @property {number} [crateCount] - Number of crates/playlists (if known)
 * @property {boolean} [isActive] - Whether this is the currently active library
 */

/**
 * @typedef {Object} Config
 * @property {DJSoftware} [libraryType] - DJ software type (default: 'serato')
 * @property {string} [libraryPath] - Path to DJ library
 * @property {string} [seratoPath] - Legacy: Path to Serato library (alias for libraryPath when type is serato)
 * @property {string} [musicPath] - Path to music files
 * @property {number} port - Server port
 * @property {string} host - Server host
 * @property {boolean} [autoStart] - Auto-start server on launch
 */

/**
 * DJ Software metadata for detection and display
 */
const DJ_SOFTWARE_INFO = {
  serato: {
    name: 'Serato DJ',
    icon: 'serato',
    color: '#00BFFF',
    defaultPaths: {
      darwin: ['~/Music/_Serato_'],
      win32: ['~/Music/_Serato_', 'D:\\Music\\_Serato_'],
      linux: ['~/Music/_Serato_']
    },
    validation: {
      requiredFiles: ['database V2'],
      requiredDirs: ['Subcrates']
    }
  },
  traktor: {
    name: 'Traktor Pro',
    icon: 'traktor',
    color: '#FF6B00',
    defaultPaths: {
      darwin: ['~/Documents/Native Instruments/Traktor Pro 3', '~/Documents/Native Instruments/Traktor Pro 4'],
      win32: ['~/Documents/Native Instruments/Traktor Pro 3', '~/Documents/Native Instruments/Traktor Pro 4'],
      linux: []
    },
    validation: {
      requiredFiles: ['collection.nml'],
      requiredDirs: []
    }
  },
  rekordbox: {
    name: 'rekordbox',
    icon: 'rekordbox',
    color: '#1DB954',
    defaultPaths: {
      darwin: ['~/Library/Pioneer/rekordbox'],
      win32: ['~/AppData/Roaming/Pioneer/rekordbox'],
      linux: []
    },
    validation: {
      requiredFiles: ['master.db'],
      requiredDirs: []
    }
  },
  virtualdj: {
    name: 'Virtual DJ',
    icon: 'virtualdj',
    color: '#FF0000',
    defaultPaths: {
      darwin: ['~/Documents/VirtualDJ'],
      win32: ['~/Documents/VirtualDJ'],
      linux: ['~/Documents/VirtualDJ']
    },
    validation: {
      requiredFiles: ['database.xml'],
      requiredDirs: []
    }
  }
};

module.exports = {
  DJ_SOFTWARE_INFO
};
