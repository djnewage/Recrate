import * as FileSystem from 'expo-file-system/legacy';
import { API_CONFIG } from '../constants/config';

// Cloud API URL for track identification
const CLOUD_API_URL = 'https://steadfast-forgiveness-production.up.railway.app';

/**
 * Create a fetch with timeout (React Native compatible)
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Get the current server URL from connection store (desktop server)
 */
const getServerURL = () => {
  try {
    const { useConnectionStore } = require('../store/connectionStore');
    const { serverURL } = useConnectionStore.getState();
    return serverURL || API_CONFIG.BASE_URL;
  } catch {
    return API_CONFIG.BASE_URL;
  }
};

/**
 * Get device ID for auth header
 */
const getDeviceId = () => {
  try {
    const { useConnectionStore } = require('../store/connectionStore');
    return useConnectionStore.getState().deviceId;
  } catch {
    return null;
  }
};

/**
 * Get the appropriate API base URL based on connection type
 */
const getApiBaseUrl = () => {
  try {
    const { useConnectionStore } = require('../store/connectionStore');
    const { connectionType, serverURL } = useConnectionStore.getState();

    if (connectionType === 'cloud') {
      return CLOUD_API_URL;
    }
    return serverURL || API_CONFIG.BASE_URL;
  } catch {
    return API_CONFIG.BASE_URL;
  }
};

export const ACRCloudService = {
  /**
   * Check if track identification is available
   * Checks server status endpoint
   */
  async hasCredentials() {
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetchWithTimeout(`${baseUrl}/api/identify/status`, {}, 5000);
      const data = await response.json();
      return data.configured === true;
    } catch (error) {
      console.error('Error checking identify status:', error);
      return false;
    }
  },

  /**
   * Identify a track from an audio file
   * Sends audio to server which proxies to ACRCloud (credentials never exposed)
   * @param {string} audioUri - Local URI to the audio file
   * @returns {Promise<{success: boolean, track?: object, error?: string, quota?: object}>}
   */
  async identify(audioUri) {
    try {
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) {
        return { success: false, error: 'Audio file not found' };
      }

      // Check file size (max 10MB)
      if (fileInfo.size > 10 * 1024 * 1024) {
        return { success: false, error: 'Audio file too large (max 10MB)' };
      }

      console.log(`Reading audio file: ${audioUri} (${fileInfo.size} bytes)`);

      // Read file as base64
      const base64Audio = await FileSystem.readAsStringAsync(audioUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log(`Converted to base64: ${base64Audio.length} characters`);

      // Get API URL and device ID
      const baseUrl = getApiBaseUrl();
      const deviceId = getDeviceId();

      // Build headers
      const headers = {
        'Content-Type': 'application/json',
      };
      if (deviceId) {
        headers['X-Device-Id'] = deviceId;
      }

      console.log(`Sending to server: ${baseUrl}/api/identify`);

      // Send to server (server proxies to ACRCloud)
      const response = await fetchWithTimeout(
        `${baseUrl}/api/identify`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sample: base64Audio,
            mimeType: 'audio/mp4',
          }),
        },
        60000 // 60 second timeout for identification
      );

      const result = await response.json();

      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 401) {
          return { success: false, error: 'Authentication required. Please restart the app.' };
        }
        if (response.status === 403) {
          return { success: false, error: result.error || 'Track identification not available on your plan.' };
        }
        if (response.status === 429) {
          return {
            success: false,
            error: result.error || 'Rate limit or quota exceeded.',
            quota: result.quota,
          };
        }
        return { success: false, error: result.error || `Server error: ${response.status}` };
      }

      // Server returns the parsed result directly
      return result;
    } catch (error) {
      console.error('Track identification error:', error);

      if (error.name === 'AbortError') {
        return { success: false, error: 'Request timed out - please try again' };
      }

      return {
        success: false,
        error: error.message || 'Failed to identify track',
      };
    }
  },
};

export default ACRCloudService;
