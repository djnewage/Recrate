// API Configuration
// Update this with your computer's IP address when running on a physical device
export const API_CONFIG = {
  // For iOS Simulator: use localhost
  // For Android Emulator: use 10.0.2.2
  // For physical device: use your computer's local IP (e.g., 192.168.1.100)
  BASE_URL: __DEV__ ? 'http://localhost:3000' : 'http://localhost:3000',
  TIMEOUT: 30000, // 30 seconds - increased for large library requests
};

export const ENDPOINTS = {
  HEALTH: '/health',
  LIBRARY: '/api/library',
  CRATES: '/api/crates',
  SEARCH: '/api/search',
  STREAM: '/api/stream',
  ARTWORK: '/api/artwork',
};
