/**
 * Proxy LLM Provider
 *
 * Used in production when the desktop has no local ANTHROPIC_API_KEY. Instead of
 * calling Anthropic directly, it forwards the completion to the cloud proxy's
 * POST /api/llm/complete, which holds the org's key. This keeps the Anthropic key
 * out of the shipped desktop binary while still letting AI "just work" for Pro/trial
 * users.
 *
 * Implements the same interface as AnthropicProvider (complete / isConfigured /
 * getInfo) so LLMService can use either interchangeably.
 */

const logger = require("../../utils/logger");

class ProxyLLMProvider {
  /**
   * @param {Object} config - ai config (expects proxyUrl and anthropic.model)
   */
  constructor(config) {
    if (!config.proxyUrl) {
      throw new Error("Proxy URL is required for ProxyLLMProvider");
    }
    // Normalize to base, then append the LLM path.
    this.endpoint = `${config.proxyUrl.replace(/\/+$/, "")}/api/llm/complete`;
    this.model = config.anthropic?.model || "claude-sonnet-4-6";
    this.name = "proxy";
  }

  /**
   * Send a completion request through the cloud proxy.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {Object} options - { maxTokens, temperature, auth: { firebaseUid, deviceId } }
   * @returns {Promise<Object>} { text, usage, model, stopReason }
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    const maxTokens = options.maxTokens || 4096;
    const temperature = options.temperature ?? 0.7;
    const auth = options.auth || {};

    logger.info(`[ProxyLLM] Forwarding completion to ${this.endpoint}`);

    let response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth.firebaseUid ? { "X-Firebase-UID": auth.firebaseUid } : {}),
          ...(auth.deviceId ? { "X-Device-Id": auth.deviceId } : {}),
        },
        body: JSON.stringify({
          systemPrompt,
          userPrompt,
          options: { maxTokens, temperature, model: this.model },
        }),
      });
    } catch (error) {
      logger.error(`[ProxyLLM] Network error: ${error.message}`);
      const apiError = new Error(`Failed to reach AI service: ${error.message}`);
      apiError.status = 503;
      apiError.provider = "proxy";
      throw apiError;
    }

    if (!response.ok) {
      let message = `AI service error (${response.status})`;
      try {
        const body = await response.json();
        if (body && body.error) message = body.error;
      } catch {
        /* non-JSON error body */
      }
      logger.error(`[ProxyLLM] Error ${response.status}: ${message}`);
      const apiError = new Error(message);
      apiError.status = response.status;
      apiError.provider = "proxy";
      throw apiError;
    }

    const data = await response.json();
    logger.info(
      `[ProxyLLM] Response received - ${data.usage?.inputTokens ?? 0} in, ${data.usage?.outputTokens ?? 0} out`
    );

    return {
      text: data.text || "",
      usage: {
        inputTokens: data.usage?.inputTokens || 0,
        outputTokens: data.usage?.outputTokens || 0,
        totalTokens:
          data.usage?.totalTokens ||
          (data.usage?.inputTokens || 0) + (data.usage?.outputTokens || 0),
      },
      model: data.model || this.model,
      stopReason: data.stopReason,
    };
  }

  /**
   * The proxy provider is "configured" as long as it has an endpoint to call.
   * Actual key presence is validated server-side by the proxy.
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.endpoint;
  }

  /**
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

module.exports = ProxyLLMProvider;
