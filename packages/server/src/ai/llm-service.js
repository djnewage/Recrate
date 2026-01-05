/**
 * LLM Service
 * Provider-agnostic abstraction for LLM interactions
 */

const config = require("../utils/config");
const logger = require("../utils/logger");
const AnthropicProvider = require("./providers/anthropic");

class LLMService {
  constructor(customConfig = null) {
    this.config = customConfig || config.ai;
    this.provider = null;
    this.initialized = false;
  }

  /**
   * Initialize the LLM provider based on configuration
   * @returns {boolean} True if initialized successfully
   */
  initialize() {
    if (this.initialized) {
      return true;
    }

    const providerName = this.config.provider;

    try {
      switch (providerName) {
        case "anthropic":
          if (!this.config.anthropic?.apiKey) {
            logger.warn("[LLMService] Anthropic API key not configured");
            return false;
          }
          this.provider = new AnthropicProvider(this.config.anthropic);
          break;

        case "openai":
          // OpenAI provider can be added later
          logger.warn("[LLMService] OpenAI provider not yet implemented");
          return false;

        default:
          logger.error(`[LLMService] Unknown provider: ${providerName}`);
          return false;
      }

      this.initialized = true;
      logger.info(`[LLMService] Initialized with ${providerName} provider`);
      return true;
    } catch (error) {
      logger.error(`[LLMService] Failed to initialize: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if the service is configured and ready
   * @returns {boolean}
   */
  isConfigured() {
    if (!this.initialized) {
      this.initialize();
    }
    return this.initialized && this.provider !== null;
  }

  /**
   * Get status information about the LLM service
   * @returns {Object}
   */
  getStatus() {
    const configured = this.isConfigured();

    return {
      configured,
      provider: configured ? this.config.provider : null,
      model: configured ? this.provider.getInfo().model : null,
    };
  }

  /**
   * Send a completion request
   * @param {string} systemPrompt - System prompt
   * @param {string} userPrompt - User message
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    if (!this.isConfigured()) {
      throw new Error("LLM service not configured. Set ANTHROPIC_API_KEY environment variable.");
    }

    return this.provider.complete(systemPrompt, userPrompt, options);
  }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton LLM service instance
 * @returns {LLMService}
 */
function getLLMService() {
  if (!instance) {
    instance = new LLMService();
  }
  return instance;
}

module.exports = {
  LLMService,
  getLLMService,
};
