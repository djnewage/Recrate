import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';

// Storage keys for ACRCloud credentials
const STORAGE_KEYS = {
  ACCESS_KEY: 'acrcloud_access_key',
  ACCESS_SECRET: 'acrcloud_access_secret',
  HOST: 'acrcloud_host',
};

// Default credentials (built into app)
const DEFAULT_CREDENTIALS = {
  accessKey: 'cb6473506947e456e408817b0b1f766c',
  accessSecret: '8rTTwKOTYaXoveIRqwgSwP1iXwIrGhHt0fLsqkvk',
  host: 'identify-us-west-2.acrcloud.com',
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
  return [
    httpMethod,
    httpUri,
    accessKey,
    dataType,
    signatureVersion,
    timestamp,
  ].join('\n');
};

export const ACRCloudService = {
  /**
   * Save ACRCloud credentials to secure storage
   */
  async saveCredentials(accessKey, accessSecret, host = DEFAULT_HOST) {
    await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_KEY, accessKey);
    await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_SECRET, accessSecret);
    await SecureStore.setItemAsync(STORAGE_KEYS.HOST, host);
  },

  /**
   * Get ACRCloud credentials from secure storage, falling back to defaults
   */
  async getCredentials() {
    const accessKey = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_KEY);
    const accessSecret = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_SECRET);
    const host = await SecureStore.getItemAsync(STORAGE_KEYS.HOST);

    return {
      accessKey: accessKey || DEFAULT_CREDENTIALS.accessKey,
      accessSecret: accessSecret || DEFAULT_CREDENTIALS.accessSecret,
      host: host || DEFAULT_CREDENTIALS.host,
    };
  },

  /**
   * Check if credentials are configured (always true since we have defaults)
   */
  async hasCredentials() {
    return true;
  },

  /**
   * Clear stored credentials
   */
  async clearCredentials() {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_KEY);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.ACCESS_SECRET);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.HOST);
  },

  /**
   * Identify a track from an audio file
   * @param {string} audioUri - Local URI to the audio file
   * @returns {Promise<{success: boolean, track?: object, error?: string}>}
   */
  async identify(audioUri) {
    const credentials = await this.getCredentials();

    if (!credentials.accessKey || !credentials.accessSecret) {
      return {
        success: false,
        error: 'ACRCloud credentials not configured. Please add your API keys in Settings.',
      };
    }

    try {
      // Read audio file info
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

      // Create form data
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

      // Make request
      const response = await fetch(`https://${credentials.host}/v1/identify`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

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
        3001: 'Invalid access key - check your credentials',
        3003: 'API limit exceeded - try again later',
        3006: 'Invalid signature - check your credentials',
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
        artist: music.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
        album: music.album?.name || null,
        releaseDate: music.release_date || null,
        duration: music.duration_ms ? Math.round(music.duration_ms / 1000) : null,
        genres: music.genres?.map(g => g.name) || [],
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
        score: music.score, // Confidence score from ACRCloud
        playOffsetMs: music.play_offset_ms, // Where in the track the sample matched
      },
      raw: music, // Include raw response for debugging
    };
  },
};

export default ACRCloudService;
