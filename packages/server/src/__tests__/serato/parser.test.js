const { SeratoParser, SeratoNotFoundError, ParseError, CrateNotFoundError } = require('../../serato/parser');
const path = require('path');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    access: jest.fn(),
    realpath: jest.fn(),
  },
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
}));

jest.mock('../../utils/cache');
jest.mock('../../audio/metadata');
jest.mock('../../utils/pathResolver', () => ({
  buildIndex: jest.fn().mockResolvedValue(),
  getStats: jest.fn().mockReturnValue({ filenameIndexSize: 0 }),
  resolvePath: jest.fn(),
  generateTrackId: jest.fn().mockReturnValue('mock-track-id'),
}));

const fs = require('fs').promises;

describe('SeratoParser', () => {
  let parser;
  const mockSeratoPath = '/Users/test/Music/_Serato_';
  const mockMusicPaths = ['/Users/test/Music'];

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new SeratoParser(mockSeratoPath, mockMusicPaths);
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(parser.seratoPath).toBe(mockSeratoPath);
      expect(parser.musicPaths).toEqual(mockMusicPaths);
      expect(parser.cratesDir).toBe(path.join(mockSeratoPath, 'Subcrates'));
    });

    it('should handle string musicPath by converting to array', () => {
      const p = new SeratoParser(mockSeratoPath, '/single/path');
      expect(p.musicPaths).toEqual(['/single/path']);
    });

    it('should accept array with valid paths', () => {
      const p = new SeratoParser(mockSeratoPath, ['/valid/path', '/another/path']);
      expect(p.musicPaths).toEqual(['/valid/path', '/another/path']);
    });

    it('should set default audio extensions', () => {
      expect(parser.audioExtensions).toContain('.mp3');
      expect(parser.audioExtensions).toContain('.flac');
      expect(parser.audioExtensions).toContain('.wav');
      expect(parser.audioExtensions).toContain('.aac');
      expect(parser.audioExtensions).toContain('.m4a');
      expect(parser.audioExtensions).toContain('.ogg');
      expect(parser.audioExtensions).toContain('.aiff');
    });
  });

  describe('verifySeratoPath', () => {
    it('should return true if Serato directory exists', async () => {
      fs.stat.mockResolvedValue({ isDirectory: () => true });

      const result = await parser.verifySeratoPath();

      expect(result).toBe(true);
      expect(fs.stat).toHaveBeenCalledWith(mockSeratoPath);
    });

    it('should throw SeratoNotFoundError if path is not a directory', async () => {
      fs.stat.mockResolvedValue({ isDirectory: () => false });

      await expect(parser.verifySeratoPath()).rejects.toThrow(SeratoNotFoundError);
    });

    it('should throw SeratoNotFoundError if path does not exist', async () => {
      fs.stat.mockRejectedValue(new Error('ENOENT'));

      await expect(parser.verifySeratoPath()).rejects.toThrow(SeratoNotFoundError);
    });
  });

  describe('slugify', () => {
    it('should convert to lowercase', () => {
      expect(parser.slugify('UPPERCASE')).toBe('uppercase');
    });

    it('should replace spaces with hyphens', () => {
      expect(parser.slugify('hello world')).toBe('hello-world');
    });

    it('should replace multiple special chars with single hyphen', () => {
      expect(parser.slugify('hello!!!world')).toBe('hello-world');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(parser.slugify('---hello---')).toBe('hello');
    });

    it('should handle mixed special characters', () => {
      expect(parser.slugify('My Crate #1 (2024)')).toBe('my-crate-1-2024');
    });
  });

  describe('setWebSocket', () => {
    it('should set io instance', () => {
      const mockIo = { emit: jest.fn() };
      parser.setWebSocket(mockIo);
      expect(parser.io).toBe(mockIo);
    });
  });

  describe('getIndexingStatus', () => {
    it('should return indexing status with null duration when not started', () => {
      const status = parser.getIndexingStatus();
      expect(status.isIndexing).toBe(false);
      expect(status.isComplete).toBe(false);
      expect(status.duration).toBeNull();
    });

    it('should calculate duration when indexing started', () => {
      parser.indexingStatus.startTime = Date.now() - 1000;
      const status = parser.getIndexingStatus();
      expect(status.duration).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('invalidateCache', () => {
    it('should clear specific cache item', () => {
      parser.cache.delete = jest.fn();
      parser.invalidateCache('library');
      expect(parser.cache.delete).toHaveBeenCalledWith('library');
    });

    it('should clear track cache when invalidating library', () => {
      parser.cache.delete = jest.fn();
      parser.trackCache.clear = jest.fn();
      parser.invalidateCache('library');
      expect(parser.trackCache.clear).toHaveBeenCalled();
    });

    it('should clear all caches when no item specified', () => {
      parser.cache.clear = jest.fn();
      parser.trackCache.clear = jest.fn();
      parser.invalidateCache();
      expect(parser.cache.clear).toHaveBeenCalled();
      expect(parser.trackCache.clear).toHaveBeenCalled();
    });
  });

  describe('getTrackById', () => {
    it('should return cached track if available', async () => {
      const mockTrack = { id: 'test-id', title: 'Test Track' };
      parser.trackCache.set('test-id', mockTrack);

      const result = await parser.getTrackById('test-id');

      expect(result).toBe(mockTrack);
    });

    it('should return null for non-existent track', async () => {
      parser.cache.get = jest.fn().mockReturnValue([]);
      parser.indexingStatus.isComplete = true;

      const result = await parser.getTrackById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('searchTracks', () => {
    beforeEach(() => {
      const mockLibrary = [
        { id: '1', title: 'Test Song', artist: 'Test Artist', album: 'Test Album' },
        { id: '2', title: 'Another Track', artist: 'Other Artist', album: 'Other Album' },
        { id: '3', title: 'Hello World', artist: 'Test Artist', album: 'Best Hits' },
      ];
      parser.cache.get = jest.fn().mockReturnValue(mockLibrary);
      parser.indexingStatus.isComplete = true;
    });

    it('should search all fields by default', async () => {
      const results = await parser.searchTracks('test');
      expect(results.length).toBe(2);
    });

    it('should search by title only', async () => {
      const results = await parser.searchTracks('hello', 'title');
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Hello World');
    });

    it('should search by artist only', async () => {
      const results = await parser.searchTracks('other', 'artist');
      expect(results.length).toBe(1);
      expect(results[0].artist).toBe('Other Artist');
    });

    it('should search by album only', async () => {
      const results = await parser.searchTracks('best', 'album');
      expect(results.length).toBe(1);
      expect(results[0].album).toBe('Best Hits');
    });

    it('should be case insensitive', async () => {
      const results = await parser.searchTracks('TEST');
      expect(results.length).toBe(2);
    });
  });

  describe('_parseCrateFile', () => {
    it('should extract track paths from crate file', () => {
      // Create a simple mock crate file with ptrk marker
      // ptrk (4 bytes) + length (4 bytes BE) + UTF-16BE path
      const pathStr = '/test.mp3';
      const pathBuffer = Buffer.alloc(pathStr.length * 2);
      for (let i = 0; i < pathStr.length; i++) {
        pathBuffer.writeUInt16BE(pathStr.charCodeAt(i), i * 2);
      }

      const marker = Buffer.from('ptrk');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(pathBuffer.length, 0);

      const crateBuffer = Buffer.concat([marker, length, pathBuffer]);

      const paths = parser._parseCrateFile(crateBuffer);

      expect(paths).toContain('/test.mp3');
    });

    it('should handle empty crate file', () => {
      const emptyBuffer = Buffer.from([]);
      const paths = parser._parseCrateFile(emptyBuffer);
      expect(paths).toEqual([]);
    });
  });

  describe('_countTracksInCrate', () => {
    it('should count ptrk markers in buffer', () => {
      const marker = Buffer.from('ptrk');
      const data = Buffer.from('some data');
      const buffer = Buffer.concat([marker, data, marker, data, marker, data]);

      const count = parser._countTracksInCrate(buffer);

      expect(count).toBe(3);
    });

    it('should return 0 for buffer without markers', () => {
      const buffer = Buffer.from('no markers here');
      const count = parser._countTracksInCrate(buffer);
      expect(count).toBe(0);
    });
  });

  describe('_decodeUTF16BE', () => {
    it('should decode UTF-16BE string', () => {
      const str = 'Hello';
      const buffer = Buffer.alloc(str.length * 2);
      for (let i = 0; i < str.length; i++) {
        buffer.writeUInt16BE(str.charCodeAt(i), i * 2);
      }

      const result = parser._decodeUTF16BE(buffer);

      expect(result).toBe('Hello');
    });

    it('should skip null characters', () => {
      const buffer = Buffer.from([0x00, 0x48, 0x00, 0x00, 0x00, 0x69]); // H, null, i
      const result = parser._decodeUTF16BE(buffer);
      expect(result).toBe('Hi');
    });

    it('should trim result', () => {
      const str = '  Hello  ';
      const buffer = Buffer.alloc(str.length * 2);
      for (let i = 0; i < str.length; i++) {
        buffer.writeUInt16BE(str.charCodeAt(i), i * 2);
      }

      const result = parser._decodeUTF16BE(buffer);

      expect(result).toBe('Hello');
    });
  });

  describe('Error classes', () => {
    it('should create SeratoNotFoundError with correct name', () => {
      const error = new SeratoNotFoundError('test');
      expect(error.name).toBe('SeratoNotFoundError');
      expect(error.message).toBe('test');
    });

    it('should create ParseError with correct name', () => {
      const error = new ParseError('test');
      expect(error.name).toBe('ParseError');
      expect(error.message).toBe('test');
    });

    it('should create CrateNotFoundError with correct name', () => {
      const error = new CrateNotFoundError('test');
      expect(error.name).toBe('CrateNotFoundError');
      expect(error.message).toBe('test');
    });
  });
});
