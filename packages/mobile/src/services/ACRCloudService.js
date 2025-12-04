import * as FileSystem from 'expo-file-system/legacy';
import CryptoJS from 'crypto-js';
import { API_CONFIG } from '../constants/config';

/**
 * Get the current server URL from connection store
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
 * Generate HMAC-SHA1 signature for ACRCloud API
 */
const generateSignature = (stringToSign, accessSecret) => {
  const hash = CryptoJS.HmacSHA1(stringToSign, accessSecret);
  return CryptoJS.enc.Base64.stringify(hash);
};

/**
 * Build the string to sign for ACRCloud authentication
 */
const buildStringToSign = (httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp) => {
  return [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join('\n');
};

export const ACRCloudService = {
  /**
   * Check if track identification is configured on the server
   */
  async hasCredentials() {
    try {
      const serverURL = getServerURL();
      const response = await fetch(`${serverURL}/api/identify/status`);
      const data = await response.json();
      return data.configured === true;
    } catch (error) {
      console.error('Error checking identify status:', error);
      return false;
    }
  },

  /**
   * Fetch ACRCloud credentials from server
   */
  async fetchCredentials() {
    const serverURL = getServerURL();
    const response = await fetch(`${serverURL}/api/identify/credentials`);
    if (!response.ok) {
      throw new Error('Track identification not configured on server');
    }
    return response.json();
  },

  /**
   * Identify a track from an audio file
   * Fetches credentials from server, then calls ACRCloud directly
   * @param {string} audioUri - Local URI to the audio file
   * @returns {Promise<{success: boolean, track?: object, error?: string}>}
   */
  async identify(audioUri) {
    try {
      // Fetch credentials from server
      console.log('Fetching credentials from server...');
      const credentials = await this.fetchCredentials();

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) {
        return { success: false, error: 'Audio file not found' };
      }

      const sampleBytes = fileInfo.size;
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const dataType = 'audio';
      const signatureVersion = '1';
      const httpMethod = 'POST';
      const httpUri = '/v1/identify';

      // Generate signature
      const stringToSign = buildStringToSign(
        httpMethod,
        httpUri,
        credentials.accessKey,
        dataType,
        signatureVersion,
        timestamp
      );
      const signature = generateSignature(stringToSign, credentials.accessSecret);

      // Create form data - React Native will handle file upload
      const formData = new FormData();
      formData.append('sample', {
        uri: audioUri,
        type: 'audio/mp4',
        name: 'sample.m4a',
      });
      formData.append('access_key', credentials.accessKey);
      formData.append('data_type', dataType);
      formData.append('signature_version', signatureVersion);
      formData.append('signature', signature);
      formData.append('sample_bytes', sampleBytes.toString());
      formData.append('timestamp', timestamp);

      console.log(`Calling ACRCloud directly: https://${credentials.host}/v1/identify`);

      // Call ACRCloud directly (not through server proxy)
      const response = await fetch(`https://${credentials.host}/v1/identify`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `ACRCloud error: ${response.status}`,
        };
      }

      const result = await response.json();
      return this.parseResult(result);
    } catch (error) {
      console.error('ACRCloud identify error:', error);
      return {
        success: false,
        error: error.message || 'Failed to identify track',
      };
    }
  },

  /**
   * Parse ACRCloud API response
   */
  parseResult(result) {
    // ACRCloud status codes
    // 0 = Success
    // 1001 = No result
    // 2000 = Recording invalid
    // 2001 = Recording timeout
    // 3000 = Server busy
    // 3001 = Access key does not exist
    // 3003 = Limit exceeded
    // 3006 = Invalid signature

    if (result.status?.code !== 0) {
      const errorMessages = {
        1001: 'No match found - track not recognized',
        2000: 'Invalid recording - please try again',
        2001: 'Recording too short - please record longer',
        3000: 'Service busy - please try again',
        3001: 'Invalid access key - check server credentials',
        3003: 'API limit exceeded - try again later',
        3006: 'Invalid signature - check server credentials',
      };

      return {
        success: false,
        error: errorMessages[result.status?.code] || result.status?.msg || 'Recognition failed',
        errorCode: result.status?.code,
      };
    }

    const music = result.metadata?.music?.[0];
    if (!music) {
      return {
        success: false,
        error: 'No match found',
      };
    }

    // Extract all available metadata
    return {
      success: true,
      track: {
        title: music.title || 'Unknown Title',
        artist: music.artists?.map((a) => a.name).join(', ') || 'Unknown Artist',
        album: music.album?.name || null,
        releaseDate: music.release_date || null,
        duration: music.duration_ms ? Math.round(music.duration_ms / 1000) : null,
        genres: music.genres?.map((g) => g.name) || [],
        label: music.label || null,
        externalIds: {
          isrc: music.external_ids?.isrc,
          upc: music.external_ids?.upc,
        },
        externalMetadata: {
          spotify: music.external_metadata?.spotify?.track?.id,
          deezer: music.external_metadata?.deezer?.track?.id,
          youtube: music.external_metadata?.youtube?.vid,
        },
        score: music.score,
        playOffsetMs: music.play_offset_ms,
      },
      raw: music,
    };
  },

  /**
   * @deprecated Credentials are now managed server-side
   */
  async saveCredentials() {
    console.warn('ACRCloudService.saveCredentials is deprecated. Credentials are managed server-side.');
  },

  /**
   * @deprecated Credentials are now managed server-side
   */
  async getCredentials() {
    console.warn('ACRCloudService.getCredentials is deprecated. Credentials are managed server-side.');
    return {};
  },

  /**
   * @deprecated Credentials are now managed server-side
   */
  async clearCredentials() {
    console.warn('ACRCloudService.clearCredentials is deprecated. Credentials are managed server-side.');
  },
};

export default ACRCloudService;
