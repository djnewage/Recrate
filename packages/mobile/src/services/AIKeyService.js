import * as SecureStore from 'expo-secure-store';

const AI_KEY_STORAGE_KEY = 'recrate_anthropic_api_key';

/**
 * Service for managing user's Anthropic API key
 * Stored securely using expo-secure-store
 */
const AIKeyService = {
  /**
   * Save the user's API key securely
   */
  saveApiKey: async (apiKey) => {
    try {
      if (apiKey && apiKey.trim()) {
        await SecureStore.setItemAsync(AI_KEY_STORAGE_KEY, apiKey.trim());
        return true;
      } else {
        // If empty, remove the key
        await SecureStore.deleteItemAsync(AI_KEY_STORAGE_KEY);
        return true;
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      return false;
    }
  },

  /**
   * Get the user's API key
   */
  getApiKey: async () => {
    try {
      const key = await SecureStore.getItemAsync(AI_KEY_STORAGE_KEY);
      return key || null;
    } catch (error) {
      console.error('Error getting API key:', error);
      return null;
    }
  },

  /**
   * Check if user has their own API key configured
   */
  hasApiKey: async () => {
    const key = await AIKeyService.getApiKey();
    return key !== null && key.length > 0;
  },

  /**
   * Remove the user's API key
   */
  removeApiKey: async () => {
    try {
      await SecureStore.deleteItemAsync(AI_KEY_STORAGE_KEY);
      return true;
    } catch (error) {
      console.error('Error removing API key:', error);
      return false;
    }
  },

  /**
   * Validate API key format (basic check)
   */
  isValidKeyFormat: (apiKey) => {
    if (!apiKey) return false;
    // Anthropic keys start with 'sk-ant-'
    return apiKey.trim().startsWith('sk-ant-');
  },
};

export default AIKeyService;
