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

const axios = require("axios");
const logger = require("../../utils/logger");

// Under the 120s upstream budget (mobile + proxy WS forwarding) so a slow/hung
// call fails with a clear error instead of a silent timeout shown as "Network Error".
const REQUEST_TIMEOUT_MS = 100000;

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
    const startedAt = Date.now();

    // Use axios (not the global fetch) — fetch is unreliable in the packaged
    // Electron main process; axios uses Node's http/https and is proven here.
    let response;
    try {
      response = await axios.post(
        this.endpoint,
        {
          systemPrompt,
          userPrompt,
          options: { maxTokens, temperature, model: this.model },
        },
        {
          headers: {
            "Content-Type": "application/json",
            ...(auth.firebaseUid ? { "X-Firebase-UID": auth.firebaseUid } : {}),
            ...(auth.deviceId ? { "X-Device-Id": auth.deviceId } : {}),
          },
          timeout: REQUEST_TIMEOUT_MS,
          validateStatus: () => true, // handle status codes ourselves
        }
      );
    } catch (error) {
      // No HTTP response (timeout, connection refused, DNS, etc.)
      const timedOut = error.code === "ECONNABORTED";
      const message = timedOut
        ? "AI service timed out. Please try again."
        : `Could not reach the AI service: ${error.message}`;
      logger.error(`[ProxyLLM] Request failed: ${error.code || ""} ${error.message}`);
      const apiError = new Error(message);
      apiError.status = timedOut ? 504 : 503;
      apiError.provider = "proxy";
      throw apiError;
    }

    if (response.status < 200 || response.status >= 300) {
      const message =
        (response.data && response.data.error) || `AI service error (${response.status})`;
      logger.error(`[ProxyLLM] Error ${response.status}: ${message}`);
      const apiError = new Error(message);
      apiError.status = response.status;
      apiError.provider = "proxy";
      throw apiError;
    }

    const data = response.data || {};
    logger.info(
      `[ProxyLLM] Response received in ${Date.now() - startedAt}ms - ${data.usage?.inputTokens ?? 0} in, ${data.usage?.outputTokens ?? 0} out`
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
