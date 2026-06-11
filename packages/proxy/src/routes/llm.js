/**
 * LLM Routes
 *
 * Central Anthropic endpoint. The proxy holds the org's ANTHROPIC_API_KEY so the
 * packaged desktop app never needs to ship one. The desktop's ProxyLLMProvider
 * (packages/server/src/ai/providers/proxy-llm.js) calls POST /api/llm/complete
 * and gets back the same { text, usage, model } shape AnthropicProvider returns.
 *
 * Auth: this endpoint spends OUR key, so it is gated to entitled (trial/pro, or
 * beta) users identified by X-Firebase-UID (falling back to X-Device-Id). The
 * desktop forwards the end user's identity from the original mobile request.
 *
 * Note: per-request crate-builder quota is still counted on the desktop path
 * (packages/server ai.js -> usageTracker). Fully centralizing quota here is a
 * follow-up; the entitlement check + lightweight rate limit below protect the
 * shared key from non-subscribers and direct abuse in the meantime.
 */

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const firestore = require('../utils/firestore');
const logger = require('../utils/logger');
const { getBetaMode } = require('../utils/remoteConfig');

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const ENTITLED_TIERS = ['trial', 'pro'];

// Lightweight in-memory rate limit per identity (backstop against direct abuse).
// Slightly above the desktop's 30/hour so it never double-blocks the legit path.
const RATE_LIMIT = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const rateHits = new Map();

function isRateLimited(id) {
  if (!id) return false;
  const now = Date.now();
  const recent = (rateHits.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  rateHits.set(id, recent);
  return recent.length > RATE_LIMIT;
}

let anthropicClient = null;
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

/**
 * Resolve a user record by Firebase UID (preferred) or device ID (fallback).
 */
async function resolveUser(firebaseUid, deviceId) {
  if (firebaseUid) {
    const user = await firestore.getUser(firebaseUid);
    if (user) return user;
  }
  if (deviceId) {
    let user = await firestore.getUserByDeviceId(deviceId);
    if (user) return user;
    user = await firestore.getUserByLegacyId(deviceId);
    if (user) return user;
  }
  return null;
}

/**
 * Whether a user is currently entitled to spend the shared key.
 * Mirrors the trial/subscription expiry logic used by the subscription route.
 */
function isEntitled(user) {
  if (!user || !ENTITLED_TIERS.includes(user.tier)) return false;
  const now = new Date();
  if (user.tier === 'pro') {
    return !user.subscription_expires_at || new Date(user.subscription_expires_at) > now;
  }
  // trial
  return !!user.trial_ends_at && new Date(user.trial_ends_at) > now;
}

function createLLMRoutes() {
  const router = express.Router();

  /**
   * POST /api/llm/complete
   * Body: { systemPrompt, userPrompt, options?: { maxTokens, temperature, model } }
   * Returns: { text, usage: { inputTokens, outputTokens, totalTokens }, model }
   */
  router.post('/complete', async (req, res) => {
    const client = getAnthropicClient();
    if (!client) {
      logger.error('[LLM] ANTHROPIC_API_KEY not set on proxy');
      return res.status(503).json({ error: 'AI service not configured' });
    }

    const firebaseUid = req.headers['x-firebase-uid'];
    const deviceId = req.headers['x-device-id'];

    if (!firebaseUid && !deviceId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Beta testers always pass; otherwise require an active trial/pro user.
      const betaMode = await getBetaMode();
      if (!betaMode) {
        const user = await resolveUser(firebaseUid, deviceId);
        if (!isEntitled(user)) {
          return res.status(403).json({
            error: 'AI features require an active Free Trial or Pro subscription.',
          });
        }
      }

      const identity = firebaseUid || deviceId;
      if (isRateLimited(identity)) {
        return res.status(429).json({ error: 'Too many AI requests. Please try again later.' });
      }

      const { systemPrompt, userPrompt, options = {} } = req.body || {};
      if (!userPrompt || typeof userPrompt !== 'string') {
        return res.status(400).json({ error: 'userPrompt is required' });
      }

      const model = options.model || DEFAULT_MODEL;
      const maxTokens = options.maxTokens || 4096;
      const temperature = options.temperature ?? 0.7;

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt || undefined,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textContent = response.content.find((c) => c.type === 'text');
      const text = textContent ? textContent.text : '';

      logger.info(
        `[LLM] ${identity} -> ${model}: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`
      );

      return res.json({
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
        model: response.model,
        stopReason: response.stop_reason,
      });
    } catch (error) {
      const status = error.status || 500;
      logger.error(`[LLM] Anthropic error (${status}): ${error.message}`);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error.message || 'AI request failed',
      });
    }
  });

  return router;
}

module.exports = createLLMRoutes;
