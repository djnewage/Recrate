/**
 * AI Routes
 * REST API endpoints for AI-powered crate building
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const logger = require("../../utils/logger");
const { getLLMService } = require("../../ai/llm-service");
const CrateCurator = require("../../ai/crate-curator");
const { requireAuth, requireTier, requireQuota } = require("../middleware/auth");
const usageTracker = require("../../utils/usageTracker");
const { isByokAllowed } = require("../../config/tiers");

// AI rate limiter - applies to all AI routes (including BYOK)
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 requests per hour
  keyGenerator: (req) => req.user?.id || req.headers["x-device-id"] || req.ip,
  message: { success: false, error: "Too many AI requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false }, // We use device ID primarily, IP is only fallback
});

/**
 * Create AI routes
 * @param {Object} parser - Serato parser instance
 * @param {Object} writer - Serato writer instance (optional)
 * @returns {express.Router}
 */
function createAIRoutes(parser, writer = null) {
  const router = express.Router();
  const curator = new CrateCurator(parser);

  // Apply auth to all AI routes
  router.use(requireAuth);

  /**
   * GET /api/ai/status
   * Check if AI features are configured and available
   */
  router.get("/status", (req, res) => {
    const llmService = getLLMService();
    const status = llmService.getStatus();

    res.json(status);
  });

  /**
   * GET /api/ai/filter-options
   * Get available filter options from the library
   */
  router.get("/filter-options", async (req, res) => {
    try {
      const options = await curator.getFilterOptions();
      res.json(options);
    } catch (error) {
      logger.error("[AI] Error fetching filter options:", error);
      res.status(500).json({ error: "Failed to fetch filter options" });
    }
  });

  /**
   * POST /api/ai/curate
   * Generate a curated track list using AI
   * Requires authentication, tier check (trial/pro only), and quota check
   *
   * Body: {
   *   prompt: string,           // Natural language description
   *   filters: {
   *     bpmRange?: { min: number, max: number },
   *     selectedKeys?: string[],
   *     selectedGenres?: string[]
   *   },
   *   limit?: number,           // Max tracks to return (default 25)
   *   options?: {
   *     prioritizeMixability?: boolean,
   *     includeVariety?: boolean,
   *     buildEnergy?: boolean
   *   },
   *   userApiKey?: string       // Optional: User's own Anthropic API key (BYOK - Pro only)
   * }
   */
  router.post(
    "/curate",
    aiRateLimiter,
    requireTier(["trial", "pro"]), // Basic tier blocked
    requireQuota("crate_builder"), // BYOK bypasses this for crate_builder
    async (req, res) => {
      try {
        const { prompt, filters = {}, limit = 25, options = {}, userApiKey } = req.body;

        // Determine if BYOK - only allow for Pro users, silently ignore for others
        const isByok = !!userApiKey && isByokAllowed(req.user.tier);

        // Log if BYOK key was provided but ignored (non-pro user)
        if (userApiKey && !isByokAllowed(req.user.tier)) {
          logger.info(`[AI] BYOK key provided but ignored for ${req.user.tier} user ${req.user.id}`);
        }

        if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: "Prompt is required. Describe the kind of crate you want to build.",
          });
        }

        logger.info(
          `[AI] Curation request from ${req.user?.id}: "${prompt.substring(0, 50)}..."${isByok ? " (BYOK)" : ""}`
        );

        const result = await curator.curate(prompt.trim(), filters, {
          limit,
          ...options,
          userApiKey: isByok ? userApiKey : undefined, // Only pass BYOK key if allowed
        });

        if (!result.success) {
          // Determine appropriate status code based on error
          let statusCode = 500;
          if (result.error.includes("not configured")) statusCode = 503;
          if (result.error.includes("No tracks match")) statusCode = 400;
          if (result.error.includes("Rate limit")) statusCode = 429;

          return res.status(statusCode).json({ success: false, error: result.error });
        }

        // Record usage AFTER success
        usageTracker.recordUsage({
          userId: req.user.id,
          deviceId: req.headers["x-device-id"],
          feature: "crate_builder",
          tier: req.user.tier,
          isByok,
          tokensIn: result.tokensUsed?.inputTokens || 0,
          tokensOut: result.tokensUsed?.outputTokens || 0,
        });

        logger.info(
          `[AI] Curation successful: ${result.curation.tracks.length} tracks (quota remaining: ${isByok ? "unlimited" : req.quota.remaining - 1})`
        );

        res.json({
          ...result,
          quota: {
            feature: "crate_builder",
            remaining: isByok ? null : req.quota.remaining - 1,
            limit: isByok ? null : req.quota.limit,
            resetDate: isByok ? null : req.quota.resetDate,
          },
        });
      } catch (error) {
        logger.error("[AI] Error during curation:", error);
        res.status(500).json({ success: false, error: "Failed to generate crate" });
      }
    }
  );

  /**
   * POST /api/ai/preview-filter
   * Preview how many tracks match the given filters (without AI)
   *
   * Body: {
   *   filters: {
   *     bpmRange?: { min: number, max: number },
   *     selectedKeys?: string[],
   *     selectedGenres?: string[]
   *   }
   * }
   */
  router.post("/preview-filter", async (req, res) => {
    try {
      const { filters = {} } = req.body;

      const tracks = await curator.filterTracks(filters);

      res.json({
        matchingTracks: tracks.length,
        // Return a sample of track info for preview
        sample: tracks.slice(0, 10).map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          bpm: t.bpm,
          key: t.key,
          genre: t.genre,
        })),
      });
    } catch (error) {
      logger.error("[AI] Error previewing filter:", error);
      res.status(500).json({ error: "Failed to preview filter" });
    }
  });

  /**
   * POST /api/ai/save-crate
   * Save the curated tracks as a new Serato crate
   * This is a convenience endpoint that wraps crate creation + track addition
   *
   * Body: {
   *   name: string,           // Crate name
   *   trackIds: string[],     // Track IDs to add
   *   parentId?: string       // Optional parent crate ID
   * }
   */
  router.post("/save-crate", async (req, res) => {
    try {
      if (!writer) {
        return res.status(501).json({
          error: "Crate creation not supported (read-only mode)",
        });
      }

      const { name, trackIds, parentId = null } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Crate name is required" });
      }

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        return res.status(400).json({ error: "trackIds array is required" });
      }

      logger.info(`[AI] Saving crate "${name}" with ${trackIds.length} tracks`);

      // Create the crate
      const crate = await writer.createCrate(name.trim(), "#9B59B6", parentId); // Purple color for AI crates

      // Add tracks to the crate
      await writer.addTracksToCrate(crate.id, trackIds);

      // Invalidate cache
      parser.invalidateCache();

      logger.success(`[AI] Crate "${name}" saved successfully`);

      res.status(201).json({
        success: true,
        crate: {
          id: crate.id,
          name: crate.name,
          trackCount: trackIds.length,
        },
      });
    } catch (error) {
      if (error.name === "CrateExistsError") {
        return res.status(409).json({ error: "A crate with this name already exists" });
      }
      if (error.name === "ParentCrateNotFoundError") {
        return res.status(404).json({ error: "Parent crate not found" });
      }

      logger.error("[AI] Error saving crate:", error);
      res.status(500).json({ error: "Failed to save crate" });
    }
  });

  return router;
}

module.exports = createAIRoutes;
