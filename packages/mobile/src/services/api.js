import axios from 'axios';
import { API_CONFIG, ENDPOINTS } from '../constants/config';

// Create axios instance
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to dynamically set base URL from connection store
api.interceptors.request.use(
  async (config) => {
    // Dynamically import to avoid circular dependencies
    const { useConnectionStore } = await import('../store/connectionStore');
    const { serverURL } = useConnectionStore.getState();

    // Use serverURL from connection store if available
    if (serverURL) {
      config.baseURL = serverURL;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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
    const response = await api.get(ENDPOINTS.LIBRARY, { params });
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
    const response = await api.get(ENDPOINTS.CRATES);
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
    const response = await api.post(`${ENDPOINTS.AI}/curate`, {
      prompt,
      filters,
      limit,
      options,
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
};

export default apiService;
