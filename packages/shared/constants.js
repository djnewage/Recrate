module.exports = {
  API_ROUTES: {
    HEALTH: '/health',
    LIBRARY: '/api/library',
    CRATES: '/api/crates',
    STREAM: '/api/stream',
    SEARCH: '/api/search',
    ARTWORK: '/api/artwork'
  },

  DEFAULT_PORT: 3000,
  DEFAULT_HOST: '0.0.0.0',

  COLORS: {
    PRIMARY: '#667eea',
    SECONDARY: '#764ba2',
    ACCENT: '#ec4899',
    DARK: '#1a1a2e',
    SUCCESS: '#48bb78',
    ERROR: '#f56565',
    WARNING: '#ed8936'
  },

  CACHE: {
    DEFAULT_MAX_SIZE: 1000,
    DEFAULT_TTL: 3600000 // 1 hour
  },

  SUPPORTED_AUDIO_FORMATS: [
    '.mp3',
    '.flac',
    '.wav',
    '.aac',
    '.m4a',
    '.ogg',
    '.aiff'
  ]
};
