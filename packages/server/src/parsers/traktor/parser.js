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
 * Traktor Parser - Parse Native Instruments Traktor Pro collection.nml files
 */
class TraktorParser extends BaseParser {
  constructor(libraryPath, musicPaths = [], cacheConfig = {}) {
    super(libraryPath, musicPaths, cacheConfig);
    this.collectionPath = path.join(libraryPath, 'collection.nml');
    this.cache = new LRUCache(cacheConfig.maxSize || 1000, cacheConfig.ttl || 3600000);
    this.tracksById = new Map();
    this.tracksByPath = new Map();

    // Traktor key mapping (numeric value to musical key)
    this.keyMap = {
      0: 'C', 1: 'Db', 2: 'D', 3: 'Eb', 4: 'E', 5: 'F',
      6: 'Gb', 7: 'G', 8: 'Ab', 9: 'A', 10: 'Bb', 11: 'B',
      12: 'Cm', 13: 'Dbm', 14: 'Dm', 15: 'Ebm', 16: 'Em', 17: 'Fm',
      18: 'Gbm', 19: 'Gm', 20: 'Abm', 21: 'Am', 22: 'Bbm', 23: 'Bm'
    };

    // Camelot key mapping
    this.camelotMap = {
      'C': '8B', 'Db': '3B', 'D': '10B', 'Eb': '5B', 'E': '12B', 'F': '7B',
      'Gb': '2B', 'G': '9B', 'Ab': '4B', 'A': '11B', 'Bb': '6B', 'B': '1B',
      'Cm': '5A', 'Dbm': '12A', 'Dm': '7A', 'Ebm': '2A', 'Em': '9A', 'Fm': '4A',
      'Gbm': '11A', 'Gm': '6A', 'Abm': '1A', 'Am': '8A', 'Bbm': '3A', 'Bm': '10A'
    };
  }

  /**
   * Verify library path exists and contains collection.nml
   */
  async verifyLibraryPath() {
    try {
      await fs.access(this.libraryPath);
      await fs.access(this.collectionPath);
      logger.info(`Traktor collection found at: ${this.collectionPath}`);
      return true;
    } catch (error) {
      throw new LibraryNotFoundError(`Traktor collection not found at ${this.collectionPath}`);
    }
  }

  /**
   * Convert Traktor path format (/:Users/:name/:Music/:) to OS path
   */
  convertTraktorPath(volume, dir, file) {
    // Remove leading /: and trailing /:, then replace /: with /
    let osPath = dir.replace(/^\/:/, '').replace(/:\/$/, '').replace(/\/:/g, '/');

    // Handle volume
    if (process.platform === 'darwin') {
      if (volume === 'osx' || volume === 'Macintosh HD') {
        osPath = '/' + osPath;
      } else {
        osPath = `/Volumes/${volume}/${osPath}`;
      }
    } else if (process.platform === 'win32') {
      // Windows: volume is drive letter like "C:"
      osPath = `${volume}\\${osPath.replace(/\//g, '\\')}`;
    }

    return path.join(osPath, file);
  }

  /**
   * Parse the collection.nml file
   */
  async parseLibrary(options = {}) {
    const cacheKey = 'traktor-library';
    const cached = this.cache.get(cacheKey);
    if (cached && !options.forceRefresh) {
      return cached;
    }

    try {
      const xmlContent = await fs.readFile(this.collectionPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['ENTRY', 'NODE', 'CUE_V2'].includes(name)
      });

      const nml = parser.parse(xmlContent);
      const collection = nml.NML?.COLLECTION?.ENTRY || [];

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

      logger.info(`Parsed ${tracks.length} tracks from Traktor collection`);

      const result = { tracks, total: tracks.length };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('Error parsing Traktor collection:', error);
      throw new ParseError(`Failed to parse Traktor collection: ${error.message}`);
    }
  }

  /**
   * Parse a single track ENTRY element
   */
  parseTrackEntry(entry) {
    try {
      const location = entry.LOCATION;
      if (!location) return null;

      const volume = location['@_VOLUME'] || '';
      const dir = location['@_DIR'] || '';
      const file = location['@_FILE'] || '';

      const filePath = this.convertTraktorPath(volume, dir, file);
      const id = this.generateTrackId(filePath);

      const info = entry.INFO || {};
      const tempo = entry.TEMPO || {};
      const musicalKey = entry.MUSICAL_KEY || {};

      // Get key from MUSICAL_KEY VALUE or INFO KEY
      let key = '';
      if (musicalKey['@_VALUE'] !== undefined) {
        const keyValue = parseInt(musicalKey['@_VALUE'], 10);
        key = this.keyMap[keyValue] || '';
      } else if (info['@_KEY']) {
        key = info['@_KEY'];
      }

      // Parse cue points
      const cues = [];
      const cueEntries = entry.CUE_V2 || [];
      for (const cue of cueEntries) {
        cues.push({
          name: cue['@_NAME'] || '',
          type: parseInt(cue['@_TYPE'], 10) || 0,
          start: parseFloat(cue['@_START']) || 0,
          hotcue: parseInt(cue['@_HOTCUE'], 10)
        });
      }

      return {
        id,
        title: entry['@_TITLE'] || path.basename(file, path.extname(file)),
        artist: entry['@_ARTIST'] || 'Unknown Artist',
        album: entry.ALBUM?.['@_TITLE'] || '',
        genre: info['@_GENRE'] || '',
        bpm: parseFloat(tempo['@_BPM']) || 0,
        key,
        camelotKey: this.camelotMap[key] || '',
        duration: parseFloat(info['@_PLAYTIME_FLOAT']) || parseFloat(info['@_PLAYTIME']) || 0,
        bitrate: parseInt(info['@_BITRATE'], 10) || 0,
        filePath,
        traktorPath: `${volume}${dir}${file}`,
        rating: this.parseRating(info['@_RANKING']),
        comment: info['@_COMMENT'] || '',
        year: info['@_RELEASE_DATE']?.split('/')[0] || '',
        importDate: info['@_IMPORT_DATE'] || '',
        cues,
        djSoftware: 'traktor'
      };
    } catch (error) {
      logger.warn('Error parsing Traktor track entry:', error.message);
      return null;
    }
  }

  /**
   * Parse Traktor ranking (0-255) to star rating (0-5)
   */
  parseRating(ranking) {
    if (!ranking) return 0;
    const value = parseInt(ranking, 10);
    // Traktor uses 0, 51, 102, 153, 204, 255 for 0-5 stars
    return Math.round(value / 51);
  }

  /**
   * Generate a unique track ID
   */
  generateTrackId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16);
  }

  /**
   * Get all playlists from the collection
   */
  async getAllCrates() {
    const cacheKey = 'traktor-crates';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const xmlContent = await fs.readFile(this.collectionPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['NODE', 'ENTRY'].includes(name)
      });

      const nml = parser.parse(xmlContent);
      const playlistsRoot = nml.NML?.PLAYLISTS?.NODE;

      if (!playlistsRoot) {
        return { crates: [] };
      }

      const crates = [];
      this.parsePlaylistNode(playlistsRoot, crates, null, 0);

      const result = { crates };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('Error parsing Traktor playlists:', error);
      throw new ParseError(`Failed to parse Traktor playlists: ${error.message}`);
    }
  }

  /**
   * Recursively parse playlist nodes
   */
  parsePlaylistNode(node, crates, parentId, depth) {
    if (!node) return;

    const nodes = node.SUBNODES?.NODE || [];

    for (const subNode of nodes) {
      const name = subNode['@_NAME'] || '';
      const type = subNode['@_TYPE'] || '';

      // Skip system playlists starting with _
      if (name.startsWith('_') && name !== '_LOOPS' && name !== '_RECORDINGS') {
        continue;
      }

      const id = this.slugify(parentId ? `${parentId}-${name}` : name);

      if (type === 'PLAYLIST') {
        const playlist = subNode.PLAYLIST;
        const entries = playlist?.ENTRY || [];

        crates.push({
          id,
          name,
          fullPath: parentId ? `${parentId}/${name}` : name,
          parentId,
          depth,
          trackCount: entries.length,
          type: 'playlist',
          djSoftware: 'traktor'
        });
      } else if (type === 'FOLDER') {
        crates.push({
          id,
          name,
          fullPath: parentId ? `${parentId}/${name}` : name,
          parentId,
          depth,
          trackCount: 0,
          type: 'folder',
          djSoftware: 'traktor'
        });

        // Recurse into folder
        this.parsePlaylistNode(subNode, crates, id, depth + 1);
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

    // Parse playlist tracks
    const xmlContent = await fs.readFile(this.collectionPath, 'utf-8');

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['NODE', 'ENTRY'].includes(name)
    });

    const nml = parser.parse(xmlContent);
    const tracks = await this.findPlaylistTracks(nml.NML?.PLAYLISTS?.NODE, crate.fullPath);

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
    let currentNode = rootNode;

    // Navigate to the playlist
    for (const part of pathParts) {
      const nodes = currentNode.SUBNODES?.NODE || [];
      currentNode = nodes.find(n => n['@_NAME'] === part);
      if (!currentNode) return [];
    }

    // Get track references
    const playlist = currentNode.PLAYLIST;
    if (!playlist) return [];

    const entries = playlist.ENTRY || [];
    const tracks = [];

    // Ensure library is parsed
    await this.parseLibrary();

    for (const entry of entries) {
      const primaryKey = entry.PRIMARYKEY?.['@_KEY'];
      if (primaryKey) {
        // primaryKey format: "Volume/:path/:to/:file.mp3"
        // Find matching track
        for (const [filePath, track] of this.tracksByPath) {
          if (primaryKey.includes(path.basename(filePath))) {
            tracks.push(track);
            break;
          }
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
    const track = this.tracksById.get(trackId);
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
  TraktorParser,
  LibraryNotFoundError,
  ParseError,
  CrateNotFoundError,
  TrackNotFoundError
};
