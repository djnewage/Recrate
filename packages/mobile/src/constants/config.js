// API Configuration
// Update this with your computer's IP address when running on a physical device
export const API_CONFIG = {
  // For iOS Simulator: use localhost
  // For Android Emulator: use 10.0.2.2
  // For physical device: use your computer's local IP (e.g., 192.168.1.100)
  BASE_URL: __DEV__ ? 'http://localhost:3000' : 'http://localhost:3000',
  // Cloud proxy for subscription/user management (always reachable)
  PROXY_URL: 'https://steadfast-forgiveness-production.up.railway.app',
  TIMEOUT: 30000, // 30 seconds - increased for large library requests
};

export const ENDPOINTS = {
  HEALTH: '/health',
  LIBRARY: '/api/library',
  CRATES: '/api/crates',
  SEARCH: '/api/search',
  STREAM: '/api/stream',
  ARTWORK: '/api/artwork',
  WAVEFORM: '/api/waveform',
  AI: '/api/ai',
  CUEPOINTS: '/api/cuepoints',
};

// Cue point colors, fixed per bank. Mirrors the server's CUE_COLORS
// (packages/server/src/api/routes/cuepoints.js) so offline-queued cue edits
// render identically to server-assigned ones.
export const CUE_COLORS = {
  1: '#EF4444', // Red
  2: '#F97316', // Orange
  3: '#EAB308', // Yellow
  4: '#22C55E', // Green
  5: '#06B6D4', // Cyan
  6: '#3B82F6', // Blue
  7: '#A855F7', // Purple
  8: '#EC4899', // Pink
};
