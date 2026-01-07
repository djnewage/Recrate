/**
 * Crate Curator
 * Business logic for AI-powered crate curation
 */

const config = require("../utils/config");
const logger = require("../utils/logger");
const { getLLMService, LLMService } = require("./llm-service");
const { CURATION_SYSTEM_PROMPT, buildUserPrompt, parseResponse } = require("./prompts");

class CrateCurator {
  constructor(parser) {
    this.parser = parser;
    this.llmService = getLLMService();
  }

  /**
   * Filter tracks based on user criteria
   * @param {Object} filters - Filter criteria
   * @returns {Promise<Array>} Filtered tracks
   */
  async filterTracks(filters = {}) {
    const library = await this.parser.parseLibrary();
    let tracks = library;

    // Filter by BPM range
    if (filters.bpmRange) {
      const { min, max } = filters.bpmRange;
      tracks = tracks.filter(t => {
        if (!t.bpm) return false;
        return t.bpm >= min && t.bpm <= max;
      });
    }

    // Filter by selected keys
    if (filters.selectedKeys && filters.selectedKeys.length > 0) {
      const keySet = new Set(filters.selectedKeys.map(k => k.toLowerCase()));
      tracks = tracks.filter(t => {
        if (!t.key) return false;
        return keySet.has(t.key.toLowerCase());
      });
    }

    // Filter by selected genres
    if (filters.selectedGenres && filters.selectedGenres.length > 0) {
      const genreSet = new Set(filters.selectedGenres.map(g => g.toLowerCase()));
      tracks = tracks.filter(t => {
        if (!t.genre) return false;
        return genreSet.has(t.genre.toLowerCase());
      });
    }

    return tracks;
  }

  /**
   * Select a representative sample of tracks if library is too large
   * @param {Array} tracks - All tracks
   * @param {number} maxTracks - Maximum tracks to include
   * @returns {Array} Sampled tracks
   */
  selectRepresentativeSample(tracks, maxTracks) {
    if (tracks.length <= maxTracks) {
      return tracks;
    }

    // Sort by various criteria to get a diverse sample
    const byBpm = [...tracks].sort((a, b) => (a.bpm || 0) - (b.bpm || 0));
    const byArtist = [...tracks].sort((a, b) => (a.artist || "").localeCompare(b.artist || ""));

    // Take evenly distributed samples
    const result = [];
    const step = Math.floor(tracks.length / maxTracks);

    for (let i = 0; i < tracks.length && result.length < maxTracks; i += step) {
      result.push(byBpm[i]);
    }

    logger.info(`[CrateCurator] Sampled ${result.length} tracks from ${tracks.length} total`);
    return result;
  }

  /**
   * Get or create an LLM service for the request
   * If userApiKey is provided, creates a temporary service with that key
   * @param {string} userApiKey - Optional user-provided API key (BYOK)
   * @returns {LLMService|null}
   */
  getLLMServiceForRequest(userApiKey) {
    if (userApiKey) {
      // Create a temporary LLM service with user's API key
      logger.info("[CrateCurator] Using user-provided API key");
      const customConfig = {
        ...config.ai,
        provider: "anthropic",
        anthropic: {
          ...config.ai.anthropic,
          apiKey: userApiKey,
        },
      };
      const userLLMService = new LLMService(customConfig);
      if (userLLMService.initialize()) {
        return userLLMService;
      }
      return null;
    }

    // Use default service
    return this.llmService;
  }

  /**
   * Curate tracks using AI
   * @param {string} prompt - User's natural language prompt
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Additional options (includes userApiKey for BYOK)
   * @returns {Promise<Object>} Curation result
   */
  async curate(prompt, filters = {}, options = {}) {
    const { userApiKey, ...curateOptions } = options;

    // Get LLM service (either default or with user's key)
    const llmService = this.getLLMServiceForRequest(userApiKey);

    // Check if LLM is configured
    if (!llmService || !llmService.isConfigured()) {
      if (userApiKey) {
        return {
          success: false,
          error: "Invalid API key provided. Please check your Anthropic API key.",
        };
      }
      return {
        success: false,
        error: "AI service not configured. Set ANTHROPIC_API_KEY environment variable or provide your own API key.",
      };
    }

    // Filter tracks based on criteria
    let tracks = await this.filterTracks(filters);

    if (tracks.length === 0) {
      return {
        success: false,
        error: "No tracks match your filters. Try broadening your criteria.",
      };
    }

    logger.info(`[CrateCurator] Found ${tracks.length} tracks matching filters`);

    // Sample if too many tracks
    const maxTracks = config.ai.maxTracksPerRequest;
    if (tracks.length > maxTracks) {
      tracks = this.selectRepresentativeSample(tracks, maxTracks);
    }

    // Build user prompt
    const limit = Math.min(curateOptions.limit || 25, config.ai.maxCurationSize);
    const userPrompt = buildUserPrompt(prompt, tracks, {
      limit,
      prioritizeMixability: curateOptions.prioritizeMixability,
      includeVariety: curateOptions.includeVariety,
      buildEnergy: curateOptions.buildEnergy,
    });

    try {
      // Call LLM
      logger.info(`[CrateCurator] Sending ${tracks.length} tracks to LLM for curation`);
      const response = await llmService.complete(CURATION_SYSTEM_PROMPT, userPrompt, {
        maxTokens: 4096,
        temperature: 0.7,
      });

      // Parse and validate response
      const validTrackIds = tracks.map(t => t.id);
      const curation = parseResponse(response.text, validTrackIds);

      // Enrich tracks with full metadata
      const trackMap = new Map(tracks.map(t => [t.id, t]));
      const enrichedTracks = curation.tracks.map(t => {
        const fullTrack = trackMap.get(t.id);
        return {
          ...fullTrack,
          reason: t.reason,
        };
      });

      // Calculate metadata
      const bpms = enrichedTracks.filter(t => t.bpm).map(t => t.bpm);
      const totalDuration = enrichedTracks.reduce((sum, t) => sum + (t.duration || 0), 0);

      return {
        success: true,
        curation: {
          tracks: enrichedTracks,
          reasoning: curation.reasoning,
          suggestedOrder: curation.suggestedOrder,
          metadata: {
            trackCount: enrichedTracks.length,
            avgBpm: bpms.length > 0 ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null,
            bpmRange: bpms.length > 0 ? { min: Math.min(...bpms), max: Math.max(...bpms) } : null,
            totalDuration: Math.round(totalDuration),
          },
        },
        tokensUsed: response.usage.totalTokens,
        filteredTrackCount: tracks.length,
      };
    } catch (error) {
      logger.error(`[CrateCurator] Error during curation: ${error.message}`);

      // Handle specific error types
      if (error.status === 429) {
        return {
          success: false,
          error: "Rate limit exceeded. Please try again in a moment.",
        };
      }

      if (error.status === 401) {
        return {
          success: false,
          error: "AI service authentication failed. Check your API key.",
        };
      }

      // JSON parse errors
      if (error.message.includes("JSON")) {
        return {
          success: false,
          error: "AI returned an invalid response. Please try again.",
        };
      }

      return {
        success: false,
        error: "Failed to generate crate. Please try again.",
      };
    }
  }

  /**
   * Get available filter options from library
   * @returns {Promise<Object>} Available genres and key statistics
   */
  async getFilterOptions() {
    const library = await this.parser.parseLibrary();

    // Extract unique genres
    const genres = [...new Set(
      library
        .map(t => t.genre)
        .filter(g => g && g.trim() !== "")
    )].sort();

    // Extract unique keys
    const keys = [...new Set(
      library
        .map(t => t.key)
        .filter(k => k && k.trim() !== "")
    )].sort();

    // BPM statistics
    const bpms = library.filter(t => t.bpm).map(t => t.bpm);
    const bpmStats = bpms.length > 0 ? {
      min: Math.min(...bpms),
      max: Math.max(...bpms),
      avg: Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length),
    } : null;

    return {
      genres,
      keys,
      bpmStats,
      totalTracks: library.length,
    };
  }
}

module.exports = CrateCurator;
