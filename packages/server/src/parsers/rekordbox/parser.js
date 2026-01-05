const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const crypto = require('crypto');
const os = require('os');
const { BaseParser, LibraryNotFoundError, ParseError, CrateNotFoundError, TrackNotFoundError } = require('../BaseParser');
const logger = require('../../utils/logger');
const LRUCache = require('../../utils/cache');

/**
 * rekordbox Parser - Parse Pioneer rekordbox XML export files
 *
 * Note: rekordbox's native database (master.db) is encrypted with SQLCipher4.
 * This parser uses the XML export feature instead, which users can generate via:
 * File > Export Collection in XML format
 *
 * Default export location: ~/Music/Rekordbox/Rekordbox Library.xml (macOS)
 */
class RekordboxParser extends BaseParser {
  constructor(libraryPath, musicPaths = [], cacheConfig = {}) {
    super(libraryPath, musicPaths, cacheConfig);
    this.cache = new LRUCache(cacheConfig.maxSize || 1000, cacheConfig.ttl || 3600000);
    this.tracksById = new Map();
    this.tracksByPath = new Map();

    // rekordbox key notation mapping (uses Open Key notation internally)
    // rekordbox stores keys in standard notation
    this.camelotMap = {
      'C': '8B', 'Db': '3B', 'D': '10B', 'Eb': '5B', 'E': '12B', 'F': '7B',
      'F#': '2B', 'Gb': '2B', 'G': '9B', 'Ab': '4B', 'A': '11B', 'Bb': '6B', 'B': '1B',
      'Cm': '5A', 'C#m': '12A', 'Dbm': '12A', 'Dm': '7A', 'D#m': '2A', 'Ebm': '2A',
      'Em': '9A', 'Fm': '4A', 'F#m': '11A', 'Gbm': '11A', 'Gm': '6A',
      'G#m': '1A', 'Abm': '1A', 'Am': '8A', 'A#m': '3A', 'Bbm': '3A', 'Bm': '10A'
    };
  }

  /**
   * Find the rekordbox XML library file
   */
  findLibraryFile() {
    // Check if libraryPath is directly an XML file
    if (this.libraryPath.endsWith('.xml')) {
      return this.libraryPath;
    }

    // Common XML export filenames (check these first)
    const xmlNames = [
      'rekordbox.xml',
      'Rekordbox Library.xml',
      'library.xml'
    ];

    for (const name of xmlNames) {
      const xmlPath = path.join(this.libraryPath, name);
      if (fsSync.existsSync(xmlPath)) {
        return xmlPath;
      }
    }

    // Check parent directory for common XML files
    const parentDir = path.dirname(this.libraryPath);
    for (const name of xmlNames) {
      const xmlPath = path.join(parentDir, name);
      if (fsSync.existsSync(xmlPath)) {
        return xmlPath;
      }
    }

    // Fallback: scan directory for any XML file that looks like a rekordbox export
    try {
      const files = fsSync.readdirSync(this.libraryPath);
      for (const file of files) {
        if (file.endsWith('.xml')) {
          const xmlPath = path.join(this.libraryPath, file);
          // Quick check if it's a rekordbox XML by reading first few bytes
          if (this.isRekordboxXml(xmlPath)) {
            return xmlPath;
          }
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return null;
  }

  /**
   * Check if an XML file is a rekordbox export by looking for DJ_PLAYLISTS tag
   */
  isRekordboxXml(xmlPath) {
    try {
      const fd = fsSync.openSync(xmlPath, 'r');
      const buffer = Buffer.alloc(500);
      fsSync.readSync(fd, buffer, 0, 500, 0);
      fsSync.closeSync(fd);
      const content = buffer.toString('utf-8');
      return content.includes('DJ_PLAYLISTS') || content.includes('rekordbox');
    } catch {
      return false;
    }
  }

  /**
   * Verify library path exists and contains rekordbox data
   */
  async verifyLibraryPath() {
    try {
      await fs.access(this.libraryPath);

      const xmlPath = this.findLibraryFile();
      if (xmlPath) {
        logger.info(`rekordbox XML found at: ${xmlPath}`);
        return true;
      }

      // Check for rekordbox folder structure (even without XML)
      const rekordboxIndicators = ['master.db', 'PIONEER'];
      for (const indicator of rekordboxIndicators) {
        const indicatorPath = path.join(this.libraryPath, indicator);
        try {
          await fs.access(indicatorPath);
          logger.warn(`rekordbox installation found but no XML export. Please export your collection via File > Export Collection in XML format.`);
          throw new LibraryNotFoundError(`rekordbox XML export not found. Please export your collection from rekordbox.`);
        } catch (e) {
          if (e instanceof LibraryNotFoundError) throw e;
        }
      }

      throw new LibraryNotFoundError(`rekordbox library not found at ${this.libraryPath}`);
    } catch (error) {
      if (error instanceof LibraryNotFoundError) throw error;
      throw new LibraryNotFoundError(`rekordbox library not found at ${this.libraryPath}`);
    }
  }

  /**
   * Convert rekordbox file:// URL to OS path
   */
  convertRekordboxPath(location) {
    if (!location) return '';

    // rekordbox uses file://localhost/ URLs
    let filePath = location;

    // Remove file://localhost/ prefix
    if (filePath.startsWith('file://localhost/')) {
      filePath = filePath.replace('file://localhost/', '/');
    } else if (filePath.startsWith('file:///')) {
      filePath = filePath.replace('file:///', '/');
    }

    // URL decode the path
    filePath = decodeURIComponent(filePath);

    // Handle Windows paths (file://localhost/C:/...)
    if (process.platform === 'win32' && filePath.match(/^\/[A-Z]:\//i)) {
      filePath = filePath.substring(1); // Remove leading /
    }

    return filePath;
  }

  /**
   * Parse the rekordbox XML library file
   */
  async parseLibrary(options = {}) {
    const cacheKey = 'rekordbox-library';
    const cached = this.cache.get(cacheKey);
    if (cached && !options.forceRefresh) {
      return cached;
    }

    const xmlPath = this.findLibraryFile();
    if (!xmlPath) {
      throw new ParseError('rekordbox XML file not found. Please export your collection from rekordbox.');
    }

    try {
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['TRACK', 'NODE', 'POSITION_MARK'].includes(name)
      });

      const xml = parser.parse(xmlContent);
      const collection = xml.DJ_PLAYLISTS?.COLLECTION?.TRACK || [];

      const tracks = [];
      this.tracksById.clear();
      this.tracksByPath.clear();

      for (const entry of collection) {
        const track = this.parseTrackEntry(entry);
        if (track) {
          tracks.push(track);
          this.tracksById.set(track.id, track);
          this.tracksByPath.set(track.filePath, track);
        }
      }

      logger.info(`Parsed ${tracks.length} tracks from rekordbox XML`);

      const result = { tracks, total: tracks.length };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('Error parsing rekordbox XML:', error);
      throw new ParseError(`Failed to parse rekordbox XML: ${error.message}`);
    }
  }

  /**
   * Parse a single track TRACK element
   */
  parseTrackEntry(entry) {
    try {
      const location = entry['@_Location'];
      if (!location) return null;

      const filePath = this.convertRekordboxPath(location);
      const id = entry['@_TrackID'] || this.generateTrackId(filePath);

      // Get key and convert to Camelot
      const key = entry['@_Tonality'] || '';
      const camelotKey = this.camelotMap[key] || '';

      // Parse cue points / hot cues
      const cues = [];
      const positionMarks = entry.POSITION_MARK || [];
      for (const mark of positionMarks) {
        cues.push({
          name: mark['@_Name'] || '',
          type: parseInt(mark['@_Type'], 10) || 0,
          start: parseFloat(mark['@_Start']) * 1000 || 0, // Convert to ms
          hotcue: parseInt(mark['@_Num'], 10)
        });
      }

      return {
        id: String(id),
        title: entry['@_Name'] || path.basename(filePath, path.extname(filePath)),
        artist: entry['@_Artist'] || 'Unknown Artist',
        album: entry['@_Album'] || '',
        genre: entry['@_Genre'] || '',
        bpm: parseFloat(entry['@_AverageBpm']) || 0,
        key,
        camelotKey,
        duration: parseFloat(entry['@_TotalTime']) || 0,
        bitrate: parseInt(entry['@_BitRate'], 10) || 0,
        filePath,
        rekordboxLocation: location,
        rating: this.parseRating(entry['@_Rating']),
        comment: entry['@_Comments'] || '',
        year: entry['@_Year'] || '',
        dateAdded: entry['@_DateAdded'] || '',
        playCount: parseInt(entry['@_PlayCount'], 10) || 0,
        color: entry['@_Colour'] || '',
        cues,
        djSoftware: 'rekordbox'
      };
    } catch (error) {
      logger.warn('Error parsing rekordbox track entry:', error.message);
      return null;
    }
  }

  /**
   * Parse rekordbox rating (0-255) to star rating (0-5)
   */
  parseRating(rating) {
    if (!rating) return 0;
    const value = parseInt(rating, 10);
    // rekordbox uses 0, 51, 102, 153, 204, 255 for 0-5 stars
    return Math.round(value / 51);
  }

  /**
   * Generate a unique track ID
   */
  generateTrackId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16);
  }

  /**
   * Get all playlists from the XML
   */
  async getAllCrates() {
    const cacheKey = 'rekordbox-crates';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const xmlPath = this.findLibraryFile();
    if (!xmlPath) {
      return { crates: [] };
    }

    try {
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['NODE', 'TRACK'].includes(name)
      });

      const xml = parser.parse(xmlContent);
      const playlistsRoot = xml.DJ_PLAYLISTS?.PLAYLISTS?.NODE;

      if (!playlistsRoot) {
        return { crates: [] };
      }

      const crates = [];
      this.parsePlaylistNode(playlistsRoot, crates, null, 0);

      const result = { crates };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('Error parsing rekordbox playlists:', error);
      throw new ParseError(`Failed to parse rekordbox playlists: ${error.message}`);
    }
  }

  /**
   * Recursively parse playlist nodes
   */
  parsePlaylistNode(nodes, crates, parentId, depth) {
    if (!nodes) return;

    // Handle both single node and array
    const nodeArray = Array.isArray(nodes) ? nodes : [nodes];

    for (const node of nodeArray) {
      const name = node['@_Name'] || '';
      const type = parseInt(node['@_Type'], 10);

      // Skip root node
      if (name === 'ROOT' && type === 0) {
        // Process children of ROOT
        if (node.NODE) {
          this.parsePlaylistNode(node.NODE, crates, null, 0);
        }
        continue;
      }

      const id = this.slugify(parentId ? `${parentId}-${name}` : name);

      if (type === 0) {
        // Folder
        crates.push({
          id,
          name,
          fullPath: parentId ? `${parentId}/${name}` : name,
          parentId,
          depth,
          trackCount: 0,
          type: 'folder',
          djSoftware: 'rekordbox'
        });

        // Recurse into folder
        if (node.NODE) {
          this.parsePlaylistNode(node.NODE, crates, id, depth + 1);
        }
      } else if (type === 1) {
        // Playlist
        const trackEntries = node.TRACK || [];
        crates.push({
          id,
          name,
          fullPath: parentId ? `${parentId}/${name}` : name,
          parentId,
          depth,
          trackCount: trackEntries.length,
          type: 'playlist',
          djSoftware: 'rekordbox'
        });
      }
    }
  }

  /**
   * Get a specific playlist with tracks
   */
  async parseCrate(crateId) {
    const { crates } = await this.getAllCrates();
    const crate = crates.find(c => c.id === crateId);

    if (!crate) {
      throw new CrateNotFoundError(`Playlist not found: ${crateId}`);
    }

    const xmlPath = this.findLibraryFile();
    if (!xmlPath) {
      throw new ParseError('rekordbox XML file not found');
    }

    const xmlContent = await fs.readFile(xmlPath, 'utf-8');

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['NODE', 'TRACK'].includes(name)
    });

    const xml = parser.parse(xmlContent);
    const tracks = await this.findPlaylistTracks(xml.DJ_PLAYLISTS?.PLAYLISTS?.NODE, crate.fullPath);

    return {
      ...crate,
      tracks
    };
  }

  /**
   * Find tracks for a specific playlist by path
   */
  async findPlaylistTracks(rootNode, playlistPath) {
    if (!rootNode) return [];

    const pathParts = playlistPath.split('/');
    let currentNode = Array.isArray(rootNode) ? rootNode : [rootNode];

    // Find the ROOT node first
    let rootFolder = currentNode.find(n => n['@_Name'] === 'ROOT');
    if (rootFolder) {
      currentNode = rootFolder.NODE || [];
    }

    // Navigate to the playlist
    for (const part of pathParts) {
      if (Array.isArray(currentNode)) {
        const found = currentNode.find(n => n['@_Name'] === part);
        if (!found) return [];
        currentNode = found;
      } else {
        if (currentNode['@_Name'] !== part) return [];
      }

      // If this isn't the last part, go into NODE children
      if (pathParts.indexOf(part) < pathParts.length - 1) {
        currentNode = currentNode.NODE || [];
      }
    }

    // Get track references
    const trackEntries = currentNode.TRACK || [];
    const tracks = [];

    // Ensure library is parsed
    await this.parseLibrary();

    for (const entry of trackEntries) {
      const trackKey = entry['@_Key'];
      if (trackKey) {
        const track = this.tracksById.get(String(trackKey));
        if (track) {
          tracks.push(track);
        }
      }
    }

    return tracks;
  }

  /**
   * Get track by ID
   */
  async getTrackById(trackId) {
    await this.parseLibrary();
    const track = this.tracksById.get(String(trackId));
    if (!track) {
      throw new TrackNotFoundError(`Track not found: ${trackId}`);
    }
    return track;
  }

  /**
   * Search tracks
   */
  async searchTracks(query, field = 'all') {
    const { tracks } = await this.parseLibrary();
    const lowerQuery = query.toLowerCase();

    return tracks.filter(track => {
      if (field === 'all') {
        return (
          track.title?.toLowerCase().includes(lowerQuery) ||
          track.artist?.toLowerCase().includes(lowerQuery) ||
          track.album?.toLowerCase().includes(lowerQuery) ||
          track.genre?.toLowerCase().includes(lowerQuery)
        );
      }
      return track[field]?.toString().toLowerCase().includes(lowerQuery);
    });
  }

  /**
   * Invalidate cache
   */
  invalidateCache(key = null) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Convert name to URL-friendly slug
   */
  slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

module.exports = {
  RekordboxParser,
  LibraryNotFoundError,
  ParseError,
  CrateNotFoundError,
  TrackNotFoundError
};
