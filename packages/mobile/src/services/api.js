import axios from 'axios';
import auth from '@react-native-firebase/auth';
import { API_CONFIG, ENDPOINTS } from '../constants/config';
import AIKeyService from './AIKeyService';

// Create axios instance
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to dynamically set base URL and auth headers
api.interceptors.request.use(
  async (config) => {
    // Use synchronous require to avoid async timing issues
    const { useConnectionStore } = require('../store/connectionStore');
    const { serverURL, deviceId, userId } = useConnectionStore.getState();

    // Use serverURL from connection store if available
    if (serverURL) {
      config.baseURL = serverURL;
    }

    // Add device ID header for device tracking (backwards compatibility)
    if (deviceId) {
      config.headers['X-Device-Id'] = deviceId;
    }

    // Get current Firebase user
    const user = auth().currentUser;

    if (user) {
      try {
        // Get fresh ID token (auto-refreshes if expired)
        // This is the most secure auth method - server verifies the token
        const idToken = await user.getIdToken();
        config.headers['Authorization'] = `Bearer ${idToken}`;
      } catch (error) {
        console.warn('Failed to get ID token:', error.message);
      }

      // Keep X-Firebase-UID as fallback during migration period
      config.headers['X-Firebase-UID'] = user.uid;
      config.headers['X-User-Id'] = user.uid;
    } else if (userId) {
      // Fallback to stored userId if no Firebase user (shouldn't happen normally)
      config.headers['X-Firebase-UID'] = userId;
      config.headers['X-User-Id'] = userId;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// In-flight request tracker for deduplication
const inFlightRequests = new Map();

/**
 * Deduplicated GET request - returns existing promise if an identical request is in flight
 */
function deduplicatedGet(url, config = {}) {
  const key = `GET:${url}:${JSON.stringify(config.params || {})}`;
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }
  const promise = api.get(url, config).finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

// API Service
export const apiService = {
  // Set base URL dynamically
  setBaseUrl: (url) => {
    api.defaults.baseURL = url;
    API_CONFIG.BASE_URL = url; // Update config for getStreamUrl/getArtworkUrl
  },

  // Get current base URL
  getBaseUrl: () => {
    return api.defaults.baseURL;
  },

  // Health check
  checkHealth: async () => {
    const response = await api.get(ENDPOINTS.HEALTH);
    return response.data;
  },

  // Library endpoints
  getLibrary: async (params = {}) => {
    const response = await deduplicatedGet(ENDPOINTS.LIBRARY, {
      params,
      timeout: 120000, // 2 minutes for large libraries
    });
    return response.data;
  },

  getLibraryStatus: async () => {
    const response = await api.get(`${ENDPOINTS.LIBRARY}/status`);
    return response.data;
  },

  getTrack: async (trackId) => {
    const response = await api.get(`${ENDPOINTS.LIBRARY}/${trackId}`);
    return response.data.track;
  },

  // Crates endpoints
  getCrates: async () => {
    // Include track IDs for offline caching
    const response = await deduplicatedGet(`${ENDPOINTS.CRATES}?includeTrackIds=true`);
    return response.data;
  },

  getCrate: async (crateId) => {
    const response = await api.get(`${ENDPOINTS.CRATES}/${crateId}`);
    return response.data.crate;
  },

  createCrate: async (name, color, parentId = null) => {
    const response = await api.post(ENDPOINTS.CRATES, { name, color, parentId });
    return response.data;
  },

  addTracksToCrate: async (crateId, trackIds) => {
    const response = await api.post(`${ENDPOINTS.CRATES}/${crateId}/tracks`, {
      trackIds,
    }, {
      timeout: 60000, // 1 minute for crate write operation
    });
    return response.data;
  },

  removeTrackFromCrate: async (crateId, trackId) => {
    const response = await api.delete(
      `${ENDPOINTS.CRATES}/${crateId}/tracks/${trackId}`
    );
    return response.data;
  },

  deleteCrate: async (crateId) => {
    const response = await api.delete(`${ENDPOINTS.CRATES}/${crateId}`);
    return response.data;
  },

  refreshCrates: async () => {
    const response = await api.post(`${ENDPOINTS.CRATES}/refresh`);
    return response.data;
  },

  // Search endpoint
  searchTracks: async (query, field = 'all', limit = 100) => {
    const response = await api.get(ENDPOINTS.SEARCH, {
      params: { q: query, field, limit },
    });
    return response.data;
  },

  // Config endpoints
  getConfig: async () => {
    const response = await api.get('/api/config');
    return response.data.config;
  },

  updateConfig: async (configData) => {
    const response = await api.post('/api/config', configData);
    return response.data;
  },

  // Get mounted volumes
  getVolumes: async () => {
    const response = await api.get('/api/config/volumes');
    return response.data;
  },

  // Get available Serato installations
  getSeratoInstallations: async () => {
    const response = await api.get('/api/config/serato-installations');
    return response.data;
  },

  // Validate a Serato path
  validateSeratoPath: async (seratoPath) => {
    const response = await api.post('/api/config/validate-path', { seratoPath });
    return response.data;
  },

  // Streaming URLs (synchronous, so we'll use the current base URL)
  getStreamUrl: (trackId) => {
    // Try to get from connection store first
    try {
      // Use require for synchronous import
      const { useConnectionStore } = require('../store/connectionStore');
      const { serverURL } = useConnectionStore.getState();
      const baseURL = serverURL || API_CONFIG.BASE_URL;
      return `${baseURL}${ENDPOINTS.STREAM}/${trackId}`;
    } catch {
      return `${API_CONFIG.BASE_URL}${ENDPOINTS.STREAM}/${trackId}`;
    }
  },

  getArtworkUrl: (trackId) => {
    // Try to get from connection store first
    try {
      // Use require for synchronous import
      const { useConnectionStore } = require('../store/connectionStore');
      const { serverURL } = useConnectionStore.getState();
      const baseURL = serverURL || API_CONFIG.BASE_URL;
      return `${baseURL}${ENDPOINTS.ARTWORK}/${trackId}`;
    } catch {
      return `${API_CONFIG.BASE_URL}${ENDPOINTS.ARTWORK}/${trackId}`;
    }
  },

  // Waveform endpoint
  getWaveform: async (trackId, peakCount = 150) => {
    try {
      const response = await api.get(`${ENDPOINTS.WAVEFORM}/${trackId}`, {
        params: { peakCount },
        timeout: 30000, // 30 seconds for waveform generation
      });
      return response.data;
    } catch (error) {
      // Return null on error (waveform is optional)
      console.warn(`Failed to get waveform for track ${trackId}:`, error.message);
      return null;
    }
  },

  // Spectral waveform endpoint (colored waveform with frequency bands)
  getSpectralWaveform: async (trackId, sampleCount = 800) => {
    try {
      const response = await api.get(`${ENDPOINTS.WAVEFORM}/${trackId}/spectral`, {
        params: { samples: sampleCount },
        timeout: 60000, // 60 seconds for spectral analysis
      });
      return response.data;
    } catch (error) {
      // Return null on error (spectral waveform is optional)
      console.warn(`Failed to get spectral waveform for track ${trackId}:`, error.message);
      return null;
    }
  },

  // AI Crate Builder endpoints
  getAIStatus: async () => {
    const response = await api.get(`${ENDPOINTS.AI}/status`);
    return response.data;
  },

  getAIFilterOptions: async () => {
    const response = await api.get(`${ENDPOINTS.AI}/filter-options`);
    return response.data;
  },

  previewAIFilter: async (filters) => {
    const response = await api.post(`${ENDPOINTS.AI}/preview-filter`, { filters });
    return response.data;
  },

  curateWithAI: async (prompt, filters = {}, limit = 25, options = {}) => {
    // Check if user has their own API key
    const userApiKey = await AIKeyService.getApiKey();

    const response = await api.post(`${ENDPOINTS.AI}/curate`, {
      prompt,
      filters,
      limit,
      options,
      // Include user's API key if they have one configured
      userApiKey: userApiKey || undefined,
    }, {
      timeout: 120000, // 2 minutes for AI curation
    });
    return response.data;
  },

  saveAICrate: async (name, trackIds, parentId = null) => {
    const response = await api.post(`${ENDPOINTS.AI}/save-crate`, {
      name,
      trackIds,
      parentId,
    }, {
      timeout: 60000, // 1 minute for save operation
    });
    return response.data;
  },

  // Cue Points endpoints
  getCuePoints: async (trackId) => {
    const response = await api.get(`${ENDPOINTS.CUEPOINTS}/${trackId}`);
    return response.data;
  },

  setCuePoint: async (trackId, bankNumber, position, label = null) => {
    const response = await api.post(`${ENDPOINTS.CUEPOINTS}/${trackId}`, {
      bankNumber,
      position,
      label,
      syncToSerato: true,
    });
    return response.data;
  },

  deleteCuePoint: async (trackId, bankNumber) => {
    const response = await api.delete(
      `${ENDPOINTS.CUEPOINTS}/${trackId}/${bankNumber}`,
      { params: { syncToSerato: 'true' } }
    );
    return response.data;
  },

  deleteAllCuePoints: async (trackId) => {
    const response = await api.delete(`${ENDPOINTS.CUEPOINTS}/${trackId}`);
    return response.data;
  },

  // Subscription endpoints (server-side source of truth)

  /**
   * Get subscription status from server
   * Server is the authoritative source for subscription/trial state
   * Call this on app launch and after purchases to sync state
   */
  getSubscriptionStatus: async () => {
    const response = await deduplicatedGet('/api/subscription/status');
    return response.data;
  },

  /**
   * Start trial on server
   * Server controls trial start date to prevent manipulation
   */
  startTrial: async () => {
    const response = await api.post('/api/subscription/start-trial');
    return response.data;
  },

  /**
   * Link Firebase account to server user record
   * Call this after Firebase authentication to merge any existing device-based data
   */
  linkFirebaseAccount: async () => {
    const response = await api.post('/api/subscription/link-firebase');
    return response.data;
  },
};

export default apiService;
