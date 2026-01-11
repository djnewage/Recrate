const express = require('express');
const crypto = require('crypto');
const FormData = require('form-data');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const logger = require('../../utils/logger');
const { requireAuth, requireTier, requireQuota } = require('../middleware/auth');
const usageTracker = require('../../utils/usageTracker');

// Rate limit: 30 identify requests per hour per user
const identifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  keyGenerator: (req) => req.user?.id || req.headers['x-device-id'] || req.ip,
  message: { success: false, error: 'Rate limit exceeded for track identification. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false }, // We use device ID primarily, IP is only fallback
});

/**
 * Validate identify request payload
 */
function validateIdentifyPayload(req, res, next) {
  const { sample, mimeType, durationMs } = req.body;

  if (!sample) {
    return res.status(400).json({ success: false, error: 'No audio sample provided' });
  }

  // Check base64 size (~10MB = ~13.3M base64 chars)
  if (sample.length > 14_000_000) {
    return res.status(400).json({ success: false, error: 'Audio sample too large (max 10MB)' });
  }

  // Check duration if provided
  if (durationMs && durationMs > 30_000) {
    return res.status(400).json({ success: false, error: 'Audio sample too long (max 30 seconds)' });
  }

  // Validate mime type
  const allowedTypes = ['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];
  if (mimeType && !allowedTypes.includes(mimeType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid audio type. Allowed: ${allowedTypes.join(', ')}`,
    });
  }

  next();
}

/**
 * Generate HMAC-SHA1 signature for ACRCloud API
 */
function generateSignature(stringToSign, accessSecret) {
  return crypto
    .createHmac('sha1', accessSecret)
    .update(stringToSign)
    .digest('base64');
}

/**
 * Build the string to sign for ACRCloud authentication
 */
function buildStringToSign(httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp) {
  return [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join('\n');
}

/**
 * Parse ACRCloud API response
 */
function parseACRCloudResult(result) {
  // ACRCloud status codes:
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
}

/**
 * Create identify routes for ACRCloud track identification proxy
 */
function createIdentifyRoutes() {
  const router = express.Router();

  /**
   * GET /api/identify/status
   * Check if ACRCloud credentials are configured
   */
  router.get('/status', (req, res) => {
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;
    const host = process.env.ACRCLOUD_HOST;

    res.json({
      configured: !!(accessKey && accessSecret && host),
      host: host || null,
    });
  });

  // SECURITY: /credentials endpoint REMOVED - credentials must never be exposed to clients
  // Mobile should use POST /api/identify which proxies through the server

  /**
   * POST /api/identify
   * Identify a track from an audio sample
   * Requires authentication and quota check
   * Body: JSON with { sample: base64-encoded audio data, mimeType?: string }
   */
  router.post(
    '/',
    identifyLimiter,
    requireAuth,
    requireTier(['trial', 'pro']), // Basic tier blocked
    requireQuota('track_identification'), // BYOK does NOT bypass this (uses our ACRCloud)
    validateIdentifyPayload,
    async (req, res) => {
      logger.info(`Identify endpoint called by user ${req.user?.id}`);

      try {
        // Check for credentials
        const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
        const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;
        const host = process.env.ACRCLOUD_HOST;

        if (!accessKey || !accessSecret || !host) {
          return res.status(503).json({
            success: false,
            error: 'Track identification not configured on server',
          });
        }

        const { sample, mimeType } = req.body;

        logger.info(`Received base64 sample: ${sample.length} characters`);

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(sample, 'base64');
        const sampleBytes = audioBuffer.length;

        logger.info(`Converted to buffer: ${sampleBytes} bytes`);

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const dataType = 'audio';
        const signatureVersion = '1';
        const httpMethod = 'POST';
        const httpUri = '/v1/identify';

        // Generate signature
        const stringToSign = buildStringToSign(
          httpMethod,
          httpUri,
          accessKey,
          dataType,
          signatureVersion,
          timestamp
        );
        const signature = generateSignature(stringToSign, accessSecret);

        // Create form data for ACRCloud
        const formData = new FormData();
        formData.append('sample', audioBuffer, {
          filename: 'sample.m4a',
          contentType: mimeType || 'audio/mp4',
        });
        formData.append('access_key', accessKey);
        formData.append('data_type', dataType);
        formData.append('signature_version', signatureVersion);
        formData.append('signature', signature);
        formData.append('sample_bytes', sampleBytes.toString());
        formData.append('timestamp', timestamp);

        logger.info(`Sending to ACRCloud: https://${host}/v1/identify`);

        // Make request to ACRCloud
        const response = await axios.post(`https://${host}/v1/identify`, formData, {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 30000, // 30 second timeout
        });

        logger.info(`ACRCloud response status: ${response.status}`);

        const result = parseACRCloudResult(response.data);

        if (result.success) {
          logger.success(`Track identified: ${result.track.artist} - ${result.track.title}`);

          // Record usage AFTER successful identification (server-side only)
          usageTracker.recordUsage({
            userId: req.user.id,
            deviceId: req.headers['x-device-id'],
            feature: 'track_identification',
            tier: req.user.tier,
            isByok: false, // Track ID always uses our ACRCloud, never BYOK
          });
        } else {
          logger.info(`Track identification failed: ${result.error}`);
        }

        // Include quota info in response
        res.json({
          ...result,
          quota: {
            feature: 'track_identification',
            remaining: req.quota.remaining - (result.success ? 1 : 0),
            limit: req.quota.limit,
            resetDate: req.quota.resetDate,
          },
        });
      } catch (error) {
        logger.error('Error identifying track:', error.message);

        // Handle axios errors
        if (error.response) {
          logger.error(
            `ACRCloud response error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
          );
          return res.status(error.response.status).json({
            success: false,
            error: `ACRCloud API error: ${error.response.statusText}`,
          });
        }

        if (error.code === 'ECONNABORTED') {
          return res.status(504).json({
            success: false,
            error: 'Request timed out - please try again',
          });
        }

        res.status(500).json({
          success: false,
          error: 'Failed to identify track',
        });
      }
    }
  );

  return router;
}

module.exports = createIdentifyRoutes;
