const AudioStreamer = require('../../audio/streamer');

// Mock dependencies
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
}));

jest.mock('../../audio/metadata', () => {
  return jest.fn().mockImplementation(() => ({
    extractMetadata: jest.fn(),
    getArtwork: jest.fn(),
  }));
});

jest.mock('../../utils/pathResolver', () => ({
  resolvePath: jest.fn(),
}));

describe('AudioStreamer', () => {
  let streamer;
  let mockParser;

  beforeEach(() => {
    mockParser = {
      getTrackById: jest.fn(),
    };
    streamer = new AudioStreamer(mockParser);
  });

  describe('constructor', () => {
    it('should initialize with parser and default chunk size', () => {
      expect(streamer.parser).toBe(mockParser);
      expect(streamer.chunkSize).toBe(256 * 1024);
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME type for mp3', () => {
      expect(streamer.getMimeType('/path/to/file.mp3')).toBe('audio/mpeg');
    });

    it('should return correct MIME type for flac', () => {
      expect(streamer.getMimeType('/path/to/file.flac')).toBe('audio/flac');
    });

    it('should return correct MIME type for wav', () => {
      expect(streamer.getMimeType('/path/to/file.wav')).toBe('audio/wav');
    });

    it('should return correct MIME type for aac', () => {
      expect(streamer.getMimeType('/path/to/file.aac')).toBe('audio/aac');
    });

    it('should return correct MIME type for m4a', () => {
      expect(streamer.getMimeType('/path/to/file.m4a')).toBe('audio/mp4');
    });

    it('should return correct MIME type for ogg', () => {
      expect(streamer.getMimeType('/path/to/file.ogg')).toBe('audio/ogg');
    });

    it('should return correct MIME type for aiff', () => {
      expect(streamer.getMimeType('/path/to/file.aiff')).toBe('audio/aiff');
    });

    it('should return octet-stream for unknown extensions', () => {
      expect(streamer.getMimeType('/path/to/file.xyz')).toBe('application/octet-stream');
    });

    it('should handle uppercase extensions', () => {
      expect(streamer.getMimeType('/path/to/file.MP3')).toBe('audio/mpeg');
    });
  });

  describe('parseRange', () => {
    const fileSize = 1000;

    it('should parse valid range header', () => {
      const result = streamer.parseRange('bytes=0-499', fileSize);
      expect(result.start).toBe(0);
      expect(result.end).toBe(499);
    });

    it('should handle range with missing end', () => {
      const result = streamer.parseRange('bytes=500-', fileSize);
      expect(result.start).toBe(500);
      expect(result.end).toBe(999);
    });

    it('should handle range with missing start', () => {
      const result = streamer.parseRange('bytes=-500', fileSize);
      expect(result.start).toBe(0);
      expect(result.end).toBe(500);
    });

    it('should cap end at file size', () => {
      const result = streamer.parseRange('bytes=0-2000', fileSize);
      expect(result.end).toBe(999);
    });

    it('should throw for invalid range header format', () => {
      expect(() => streamer.parseRange('invalid', fileSize)).toThrow('Range header must start with "bytes="');
    });

    it('should throw for null range header', () => {
      expect(() => streamer.parseRange(null, fileSize)).toThrow('Invalid range header');
    });

    it('should throw for range with start greater than end', () => {
      expect(() => streamer.parseRange('bytes=500-100', fileSize)).toThrow('Range start must be less than or equal to end');
    });

    it('should throw for negative values', () => {
      expect(() => streamer.parseRange('bytes=-5--10', fileSize)).toThrow();
    });

    it('should throw for non-numeric values', () => {
      expect(() => streamer.parseRange('bytes=abc-def', fileSize)).toThrow('Range values must be valid numbers');
    });
  });

  describe('streamTrack', () => {
    let mockReq;
    let mockRes;

    beforeEach(() => {
      mockReq = {
        headers: {},
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        writeHead: jest.fn(),
        on: jest.fn(),
        headersSent: false,
      };
    });

    it('should return 404 if track not found', async () => {
      mockParser.getTrackById.mockResolvedValue(null);

      await streamer.streamTrack('nonexistent', mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Track not found' });
    });
  });

  describe('getArtwork', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        writeHead: jest.fn(),
        end: jest.fn(),
      };
    });

    it('should return 404 if track not found', async () => {
      mockParser.getTrackById.mockResolvedValue(null);

      await streamer.getArtwork('nonexistent', mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Track not found' });
    });
  });
});
