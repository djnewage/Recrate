import axios from 'axios';
import { API_CONFIG, ENDPOINTS } from '../constants/config';
import { demoApiService } from './demoApiService';
import { useConnectionStore, CONNECTION_TYPES } from '../store/connectionStore';

// Helper to check if in demo mode
const isDemoMode = () => {
  try {
    return useConnectionStore.getState().connectionType === CONNECTION_TYPES.DEMO;
  } catch {
    return false;
  }
};

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
    if (isDemoMode()) return demoApiService.checkHealth();
    const response = await api.get(ENDPOINTS.HEALTH);
    return response.data;
  },

  // Library endpoints
  getLibrary: async (params = {}) => {
    if (isDemoMode()) return demoApiService.getLibrary(params);
    const response = await api.get(ENDPOINTS.LIBRARY, { params });
    return response.data;
  },

  getLibraryStatus: async () => {
    if (isDemoMode()) return demoApiService.getLibraryStatus();
    const response = await api.get(`${ENDPOINTS.LIBRARY}/status`);
    return response.data;
  },

  getTrack: async (trackId) => {
    if (isDemoMode()) return demoApiService.getTrack(trackId);
    const response = await api.get(`${ENDPOINTS.LIBRARY}/${trackId}`);
    return response.data.track;
  },

  // Crates endpoints
  getCrates: async () => {
    if (isDemoMode()) return demoApiService.getCrates();
    const response = await api.get(ENDPOINTS.CRATES);
    return response.data;
  },

  getCrate: async (crateId) => {
    if (isDemoMode()) return demoApiService.getCrate(crateId);
    const response = await api.get(`${ENDPOINTS.CRATES}/${crateId}`);
    return response.data.crate;
  },

  createCrate: async (name, color, parentId = null) => {
    if (isDemoMode()) return demoApiService.createCrate(name, color, parentId);
    const response = await api.post(ENDPOINTS.CRATES, { name, color, parentId });
    return response.data;
  },

  addTracksToCrate: async (crateId, trackIds) => {
    if (isDemoMode()) return demoApiService.addTracksToCrate(crateId, trackIds);
    const response = await api.post(`${ENDPOINTS.CRATES}/${crateId}/tracks`, {
      trackIds,
    });
    return response.data;
  },

  removeTrackFromCrate: async (crateId, trackId) => {
    if (isDemoMode()) return demoApiService.removeTrackFromCrate(crateId, trackId);
    const response = await api.delete(
      `${ENDPOINTS.CRATES}/${crateId}/tracks/${trackId}`
    );
    return response.data;
  },

  deleteCrate: async (crateId) => {
    if (isDemoMode()) return demoApiService.deleteCrate(crateId);
    const response = await api.delete(`${ENDPOINTS.CRATES}/${crateId}`);
    return response.data;
  },

  // Search endpoint
  searchTracks: async (query, field = 'all', limit = 100) => {
    if (isDemoMode()) return demoApiService.searchTracks(query, field, limit);
    const response = await api.get(ENDPOINTS.SEARCH, {
      params: { q: query, field, limit },
    });
    return response.data;
  },

  // Config endpoints
  getConfig: async () => {
    if (isDemoMode()) return demoApiService.getConfig();
    const response = await api.get('/api/config');
    return response.data.config;
  },

  updateConfig: async (configData) => {
    if (isDemoMode()) return demoApiService.updateConfig(configData);
    const response = await api.post('/api/config', configData);
    return response.data;
  },

  // Get mounted volumes
  getVolumes: async () => {
    if (isDemoMode()) return demoApiService.getVolumes();
    const response = await api.get('/api/config/volumes');
    return response.data;
  },

  // Get available Serato installations
  getSeratoInstallations: async () => {
    if (isDemoMode()) return demoApiService.getSeratoInstallations();
    const response = await api.get('/api/config/serato-installations');
    return response.data;
  },

  // Validate a Serato path
  validateSeratoPath: async (seratoPath) => {
    if (isDemoMode()) return demoApiService.validateSeratoPath(seratoPath);
    const response = await api.post('/api/config/validate-path', { seratoPath });
    return response.data;
  },

  // Streaming URLs (synchronous, so we'll use the current base URL)
  getStreamUrl: (trackId) => {
    // Check demo mode first
    if (isDemoMode()) return demoApiService.getStreamUrl(trackId);

    // Try to get from connection store first
    try {
      const { serverURL } = useConnectionStore.getState();
      const baseURL = serverURL || API_CONFIG.BASE_URL;
      return `${baseURL}${ENDPOINTS.STREAM}/${trackId}`;
    } catch {
      return `${API_CONFIG.BASE_URL}${ENDPOINTS.STREAM}/${trackId}`;
    }
  },

  getArtworkUrl: (trackId) => {
    // Check demo mode first
    if (isDemoMode()) return demoApiService.getArtworkUrl(trackId);

    // Try to get from connection store first
    try {
      const { serverURL } = useConnectionStore.getState();
      const baseURL = serverURL || API_CONFIG.BASE_URL;
      return `${baseURL}${ENDPOINTS.ARTWORK}/${trackId}`;
    } catch {
      return `${API_CONFIG.BASE_URL}${ENDPOINTS.ARTWORK}/${trackId}`;
    }
  },
};

export default apiService;
