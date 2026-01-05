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
 * VirtualDJ Parser - Parse VirtualDJ database.xml files
 *
 * Default location: ~/Documents/VirtualDJ/database.xml
 * VirtualDJ also stores playlists in ~/Documents/VirtualDJ/Playlists/
 */
class VirtualDJParser extends BaseParser {
  constructor(libraryPath, musicPaths = [], cacheConfig = {}) {
    super(libraryPath, musicPaths, cacheConfig);
    this.cache = new LRUCache(cacheConfig.maxSize || 1000, cacheConfig.ttl || 3600000);
    this.tracksById = new Map();
    this.tracksByPath = new Map();

    // VirtualDJ key mapping (uses standard notation)
    this.camelotMap = {
      'C': '8B', 'Db': '3B', 'D': '10B', 'Eb': '5B', 'E': '12B', 'F': '7B',
      'F#': '2B', 'Gb': '2B', 'G': '9B', 'Ab': '4B', 'G#': '4B', 'A': '11B', 'Bb': '6B', 'A#': '6B', 'B': '1B',
      'Cm': '5A', 'C#m': '12A', 'Dbm': '12A', 'Dm': '7A', 'D#m': '2A', 'Ebm': '2A',
      'Em': '9A', 'Fm': '4A', 'F#m': '11A', 'Gbm': '11A', 'Gm': '6A',
      'G#m': '1A', 'Abm': '1A', 'Am': '8A', 'A#m': '3A', 'Bbm': '3A', 'Bm': '10A'
    };
  }

  /**
   * Find the VirtualDJ database file
   */
  findDatabaseFile() {
    // Check if libraryPath is directly the database.xml
    if (this.libraryPath.endsWith('database.xml')) {
      return this.libraryPath;
    }

    // Common database filenames
    const dbNames = ['database.xml', 'local database.xml'];

    for (const name of dbNames) {
      const dbPath = path.join(this.libraryPath, name);
      if (fsSync.existsSync(dbPath)) {
        return dbPath;
      }
    }

    return null;
  }

  /**
   * Verify library path exists and contains VirtualDJ data
   */
  async verifyLibraryPath() {
    try {
      await fs.access(this.libraryPath);

      const dbPath = this.findDatabaseFile();
      if (dbPath) {
        logger.info(`VirtualDJ database found at: ${dbPath}`);
        return true;
      }

      // Check for VirtualDJ folder indicators
      const vdjIndicators = ['Playlists', 'Skins', 'Plugins'];
      for (const indicator of vdjIndicators) {
        const indicatorPath = path.join(this.libraryPath, indicator);
        try {
          await fs.access(indicatorPath);
          logger.warn(`VirtualDJ folder found but database.xml missing at ${this.libraryPath}`);
          throw new LibraryNotFoundError(`VirtualDJ database.xml not found at ${this.libraryPath}`);
        } catch (e) {
          if (e instanceof LibraryNotFoundError) throw e;
        }
      }

      throw new LibraryNotFoundError(`VirtualDJ library not found at ${this.libraryPath}`);
    } catch (error) {
      if (error instanceof LibraryNotFoundError) throw error;
      throw new LibraryNotFoundError(`VirtualDJ library not found at ${this.libraryPath}`);
    }
  }

  /**
   * Convert VirtualDJ BPM format to standard BPM
   * VirtualDJ stores BPM as the period in seconds (time for one beat)
   * Formula: BPM = 60 / period
   */
  convertBpm(bpmValue) {
    if (!bpmValue) return 0;
    const period = parseFloat(bpmValue);
    if (period <= 0) return 0;

    // If value is > 1, it's likely already in BPM format
    if (period > 1) return period;

    // Convert from period to BPM
    return Math.round((60 / period) * 100) / 100;
  }

  /**
   * Parse the VirtualDJ database.xml file
   */
  async parseLibrary(options = {}) {
    const cacheKey = 'virtualdj-library';
    const cached = this.cache.get(cacheKey);
    if (cached && !options.forceRefresh) {
      return cached;
    }

    const dbPath = this.findDatabaseFile();
    if (!dbPath) {
      throw new ParseError('VirtualDJ database.xml not found');
    }

    try {
      const xmlContent = await fs.readFile(dbPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['Song', 'Poi'].includes(name)
      });

      const xml = parser.parse(xmlContent);
      const songs = xml.VirtualDJ_Database?.Song || [];

      const tracks = [];
      this.tracksById.clear();
      this.tracksByPath.clear();

      for (const entry of songs) {
        const track = this.parseTrackEntry(entry);
        if (track) {
          tracks.push(track);
          this.tracksById.set(track.id, track);
          this.tracksByPath.set(track.filePath, track);
        }
      }

      logger.info(`Parsed ${tracks.length} tracks from VirtualDJ database`);

      const result = { tracks, total: tracks.length };
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('Error parsing VirtualDJ database:', error);
      throw new ParseError(`Failed to parse VirtualDJ database: ${error.message}`);
    }
  }

  /**
   * Parse a single Song element
   */
  parseTrackEntry(entry) {
    try {
      const filePath = entry['@_FilePath'];
      if (!filePath) return null;

      const id = this.generateTrackId(filePath);
      const tags = entry.Tags || {};
      const infos = entry.Infos || {};
      const scan = entry.Scan || {};

      // Get key and convert to Camelot
      const key = tags['@_Key'] || '';
      const camelotKey = this.camelotMap[key] || '';

      // Parse cue points / POIs (Points of Interest)
      const cues = [];
      const pois = entry.Poi || [];
      for (const poi of pois) {
        cues.push({
          name: poi['@_Name'] || '',
          type: poi['@_Type'] || 'cue',
          start: parseFloat(poi['@_Pos']) * 1000 || 0, // Convert to ms
          hotcue: parseInt(poi['@_Num'], 10) || -1
        });
      }

      return {
        id,
        title: tags['@_Title'] || path.basename(filePath, path.extname(filePath)),
        artist: tags['@_Artist'] || 'Unknown Artist',
        album: tags['@_Album'] || '',
        genre: tags['@_Genre'] || '',
        bpm: this.convertBpm(scan['@_Bpm']),
        key,
        camelotKey,
        duration: parseFloat(infos['@_SongLength']) || 0,
        bitrate: parseInt(infos['@_Bitrate'], 10) || 0,
        filePath,
        rating: this.parseRating(tags['@_Stars']),
        comment: tags['@_Comment'] || '',
        year: tags['@_Year'] || '',
        playCount: parseInt(infos['@_PlayCount'], 10) || 0,
        lastPlayed: infos['@_LastPlay'] || '',
        firstSeen: infos['@_FirstSeen'] || '',
        color: tags['@_Color'] || '',
        cues,
        djSoftware: 'virtualdj'
      };
    } catch (error) {
      logger.warn('Error parsing VirtualDJ track entry:', error.message);
      return null;
    }
  }

  /**
   * Parse VirtualDJ star rating (0-5)
   */
  parseRating(stars) {
    if (!stars) return 0;
    return Math.min(5, Math.max(0, parseInt(stars, 10)));
  }

  /**
   * Generate a unique track ID
   */
  generateTrackId(filePath) {
    return crypto.createHash('md5').update(filePath).digest('hex').substring(0, 16);
  }

  /**
   * Get all playlists from VirtualDJ
   * VirtualDJ stores playlists as separate .m3u files in the Playlists folder
   */
  async getAllCrates() {
    const cacheKey = 'virtualdj-crates';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const crates = [];

    // Find playlists folder
    const playlistsDir = path.join(this.libraryPath, 'Playlists');

    try {
      await this.scanPlaylistFolder(playlistsDir, crates, null, 0);
    } catch (error) {
      logger.debug('No Playlists folder found or error scanning:', error.message);
    }

    // Also check for virtual folders in the database
    await this.parseVirtualFolders(crates);

    const result = { crates };
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Recursively scan playlist folder for .m3u files
   */
  async scanPlaylistFolder(folderPath, crates, parentId, depth) {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
          const id = this.slugify(parentId ? `${parentId}-${entry.name}` : entry.name);

          crates.push({
            id,
            name: entry.name,
            fullPath: parentId ? `${parentId}/${entry.name}` : entry.name,
            parentId,
            depth,
            trackCount: 0,
            type: 'folder',
            djSoftware: 'virtualdj'
          });

          // Recurse into folder
          await this.scanPlaylistFolder(entryPath, crates, id, depth + 1);
        } else if (entry.name.endsWith('.m3u') || entry.name.endsWith('.m3u8')) {
          const playlistName = path.basename(entry.name, path.extname(entry.name));
          const id = this.slugify(parentId ? `${parentId}-${playlistName}` : playlistName);

          // Count tracks in playlist
          const trackCount = await this.countPlaylistTracks(entryPath);

          crates.push({
            id,
            name: playlistName,
            fullPath: parentId ? `${parentId}/${playlistName}` : playlistName,
            parentId,
            depth,
            trackCount,
            type: 'playlist',
            playlistPath: entryPath,
            djSoftware: 'virtualdj'
          });
        }
      }
    } catch (error) {
      // Folder doesn't exist or can't be read
    }
  }

  /**
   * Parse virtual folders from database.xml
   */
  async parseVirtualFolders(crates) {
    const dbPath = this.findDatabaseFile();
    if (!dbPath) return;

    try {
      const xmlContent = await fs.readFile(dbPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['Folder', 'Song'].includes(name)
      });

      const xml = parser.parse(xmlContent);
      const folders = xml.VirtualDJ_Database?.Folder || [];

      for (const folder of folders) {
        const name = folder['@_Name'];
        if (!name) continue;

        const id = this.slugify(`vf-${name}`);
        const songs = folder.Song || [];

        crates.push({
          id,
          name,
          fullPath: name,
          parentId: null,
          depth: 0,
          trackCount: songs.length,
          type: 'virtual-folder',
          djSoftware: 'virtualdj'
        });
      }
    } catch (error) {
      logger.debug('Error parsing virtual folders:', error.message);
    }
  }

  /**
   * Count tracks in an M3U playlist
   */
  async countPlaylistTracks(playlistPath) {
    try {
      const content = await fs.readFile(playlistPath, 'utf-8');
      const lines = content.split('\n').filter(line =>
        line.trim() && !line.startsWith('#')
      );
      return lines.length;
    } catch {
      return 0;
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

    let tracks = [];

    if (crate.playlistPath) {
      // Parse M3U file
      tracks = await this.parseM3UPlaylist(crate.playlistPath);
    } else if (crate.type === 'virtual-folder') {
      // Parse from database
      tracks = await this.parseVirtualFolderTracks(crate.name);
    }

    return {
      ...crate,
      tracks
    };
  }

  /**
   * Parse tracks from an M3U playlist file
   */
  async parseM3UPlaylist(playlistPath) {
    await this.parseLibrary();

    try {
      const content = await fs.readFile(playlistPath, 'utf-8');
      const lines = content.split('\n');
      const tracks = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Try to find track by path
        const track = this.tracksByPath.get(trimmed);
        if (track) {
          tracks.push(track);
        } else {
          // Try with normalized path
          const normalizedPath = path.normalize(trimmed);
          const trackByNormalized = this.tracksByPath.get(normalizedPath);
          if (trackByNormalized) {
            tracks.push(trackByNormalized);
          }
        }
      }

      return tracks;
    } catch (error) {
      logger.warn('Error parsing M3U playlist:', error.message);
      return [];
    }
  }

  /**
   * Parse tracks from a virtual folder in the database
   */
  async parseVirtualFolderTracks(folderName) {
    await this.parseLibrary();

    const dbPath = this.findDatabaseFile();
    if (!dbPath) return [];

    try {
      const xmlContent = await fs.readFile(dbPath, 'utf-8');

      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        isArray: (name) => ['Folder', 'Song'].includes(name)
      });

      const xml = parser.parse(xmlContent);
      const folders = xml.VirtualDJ_Database?.Folder || [];
      const folder = folders.find(f => f['@_Name'] === folderName);

      if (!folder) return [];

      const songs = folder.Song || [];
      const tracks = [];

      for (const song of songs) {
        const filePath = song['@_FilePath'];
        if (filePath) {
          const track = this.tracksByPath.get(filePath);
          if (track) {
            tracks.push(track);
          }
        }
      }

      return tracks;
    } catch (error) {
      logger.warn('Error parsing virtual folder tracks:', error.message);
      return [];
    }
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
  VirtualDJParser,
  LibraryNotFoundError,
  ParseError,
  CrateNotFoundError,
  TrackNotFoundError
};
