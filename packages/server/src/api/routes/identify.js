const express = require('express');
const crypto = require('crypto');
const FormData = require('form-data');
const axios = require('axios');
const logger = require('../../utils/logger');

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

  /**
   * GET /api/identify/credentials
   * Returns ACRCloud credentials for direct API calls from mobile
   * This allows mobile to call ACRCloud directly without proxying through the server
   */
  router.get('/credentials', (req, res) => {
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;
    const host = process.env.ACRCLOUD_HOST;

    if (!accessKey || !accessSecret || !host) {
      return res.status(503).json({
        error: 'Track identification not configured on server',
      });
    }

    res.json({ accessKey, accessSecret, host });
  });

  /**
   * POST /api/identify
   * Identify a track from an audio sample
   * Body: JSON with { sample: base64-encoded audio data, mimeType?: string }
   */
  router.post('/', async (req, res) => {
    logger.info('Identify endpoint called');
    logger.info(`Request headers: ${JSON.stringify(req.headers['content-type'])}`);

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

      // Check for base64 audio data in JSON body
      const { sample, mimeType } = req.body;
      if (!sample) {
        return res.status(400).json({
          success: false,
          error: 'No audio sample provided. Send JSON with { sample: base64Data }',
        });
      }

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
      } else {
        logger.info(`Track identification failed: ${result.error}`);
      }

      res.json(result);
    } catch (error) {
      logger.error('Error identifying track:', error.message);

      // Handle axios errors
      if (error.response) {
        logger.error(`ACRCloud response error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
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
  });

  return router;
}

module.exports = createIdentifyRoutes;
