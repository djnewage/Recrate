/**
 * Anthropic Claude Provider
 * Handles communication with Anthropic's Claude API
 */

const Anthropic = require("@anthropic-ai/sdk");
const logger = require("../../utils/logger");

class AnthropicProvider {
  constructor(config) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
    this.model = config.model || "claude-sonnet-4-20250514";
    this.name = "anthropic";
  }

  /**
   * Send a completion request to Claude
   * @param {string} systemPrompt - System prompt for context
   * @param {string} userPrompt - User's message/request
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Response with text and usage info
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    const maxTokens = options.maxTokens || 4096;
    const temperature = options.temperature ?? 0.7;

    logger.info(`[Anthropic] Sending request to ${this.model}`);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });

      const textContent = response.content.find(c => c.type === "text");
      const text = textContent ? textContent.text : "";

      logger.info(`[Anthropic] Response received - ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      logger.error(`[Anthropic] API error: ${error.message}`);

      // Re-throw with status for upstream error handling
      const apiError = new Error(error.message);
      apiError.status = error.status || 500;
      apiError.provider = "anthropic";
      throw apiError;
    }
  }

  /**
   * Check if the provider is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.client;
  }

  /**
   * Get provider info
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      model: this.model,
      configured: this.isConfigured(),
    };
  }
}

module.exports = AnthropicProvider;
