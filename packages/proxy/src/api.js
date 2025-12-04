// ============================================================================
// FILE: packages/proxy/src/api.js
// PURPOSE: HTTP API handler that forwards requests via Binary WebSocket
// ============================================================================

const express = require('express');
const router = express.Router();
const logger = require('./utils/logger');

// This will be injected by the main server
let wsManager = null;

function setWebSocketManager(manager) {
  wsManager = manager;
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'recrate-proxy'
  });
});

// ============================================================================
// ACRCloud Track Identification - Credentials API
// These endpoints provide credentials for mobile to call ACRCloud directly
// ============================================================================

/**
 * GET /api/identify/status
 * Check if ACRCloud credentials are configured
 * Note: Router is mounted at /api, so this becomes /api/identify/status
 */
router.get('/identify/status', (req, res) => {
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
 * Note: Router is mounted at /api, so this becomes /api/identify/credentials
 */
router.get('/identify/credentials', (req, res) => {
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY;
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET;
  const host = process.env.ACRCLOUD_HOST;

  if (!accessKey || !accessSecret || !host) {
    return res.status(503).json({
      error: 'Track identification not configured',
    });
  }

  res.json({ accessKey, accessSecret, host });
});

// Check if device is connected
router.get('/device/:deviceId/status', async (req, res) => {
  const { deviceId } = req.params;

  const deviceStatus = wsManager.getDeviceStatus(deviceId);

  if (deviceStatus.connected) {
    res.json({
      connected: true,
      protocol: deviceStatus.protocol,
      connectedAt: deviceStatus.connectedAt
    });
  } else {
    res.json({
      connected: false
    });
  }
});

// Device-specific health check
router.get('/:deviceId/health', async (req, res) => {
  const { deviceId } = req.params;

  const deviceStatus = wsManager.getDeviceStatus(deviceId);

  if (deviceStatus.connected) {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      deviceId,
      protocol: deviceStatus.protocol,
      connectedAt: deviceStatus.connectedAt
    });
  } else {
    res.status(503).json({
      error: 'Device not connected',
      deviceId,
      message: 'Make sure Recrate is running on your computer'
    });
  }
});

// Proxy all requests to desktop (catch-all route must be last)
router.all('/:deviceId/*', async (req, res) => {
  const { deviceId} = req.params;
  const path = '/' + req.params[0]; // Get the path after deviceId
  const rangeHeader = req.headers.range;

  try {
    logger.info(`[${deviceId}] Mobile request: ${req.method} ${path}`);

    // Check if device is connected
    const deviceStatus = wsManager.getDeviceStatus(deviceId);
    if (!deviceStatus.connected) {
      return res.status(503).json({
        error: 'Device not connected',
        deviceId,
        message: 'Make sure Recrate is running on your computer'
      });
    }

    // Determine if this is a streaming request or a general HTTP request
    // Streaming requests: /api/stream/*
    const isStreamingRequest = path.includes('/api/stream/');

    if (isStreamingRequest) {
      // Handle as audio streaming request
      const pathParts = path.split('/').filter(p => p.length > 0);
      const trackId = pathParts[pathParts.length - 1];

      if (!trackId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Track ID is required'
        });
      }

      // Send stream request to Desktop via WebSocket
      const { requestId, promise } = await wsManager.sendStreamRequest(
        deviceId,
        trackId,
        rangeHeader
      );

      logger.info(`[${deviceId}] Stream request dispatched: ${requestId}`);

      // Set up streaming response handler
      // This allows us to send chunks to mobile as they arrive from Desktop
      let headersSent = false;

      wsManager.attachChunkHandler(requestId, (chunk) => {
        if (!headersSent) {
          // Get metadata from Desktop's stream_response message
          const metadata = wsManager.getMetadata(requestId);
          if (metadata) {
            res.status(metadata.status);

            // Set headers from Desktop
            Object.keys(metadata.headers).forEach(key => {
              if (metadata.headers[key] !== undefined) {
                const lowerKey = key.toLowerCase();
                // Skip headers that Express sets automatically
                if (lowerKey !== 'connection' && lowerKey !== 'transfer-encoding' && lowerKey !== 'date') {
                  res.setHeader(key, metadata.headers[key]);
                }
              }
            });

            headersSent = true;
          }
        }

        // Stream chunk to mobile immediately (NO ACCUMULATION, NO BASE64)
        if (headersSent) {
          res.write(chunk);
        }
      });

      // Wait for stream to complete
      const result = await promise;

      // End response
      if (headersSent) {
        res.end();
      } else {
        // If we never sent headers, send the complete buffer now
        res.status(result.metadata.status);
        Object.keys(result.metadata.headers).forEach(key => {
          if (result.metadata.headers[key] !== undefined) {
            const lowerKey = key.toLowerCase();
            if (lowerKey !== 'connection' && lowerKey !== 'transfer-encoding' && lowerKey !== 'date') {
              res.setHeader(key, result.metadata.headers[key]);
            }
          }
        });
        res.send(result.buffer);
      }

      logger.info(`[${deviceId}] Stream completed: ${requestId}, ${result.bytesSent} bytes`);

    } else {
      // Handle as general HTTP request (library, crates, config, etc.)
      logger.info(`[${deviceId}] HTTP request dispatched: ${req.method} ${path}`);

      // Forward HTTP request to Desktop via WebSocket
      const result = await wsManager.sendHttpRequest(
        deviceId,
        req.method,
        path,
        req.headers,
        req.body
      );

      // Send response to mobile
      res.status(result.status);

      // Set headers from Desktop
      Object.keys(result.headers).forEach(key => {
        const lowerKey = key.toLowerCase();
        // Skip headers that Express sets automatically
        if (lowerKey !== 'connection' && lowerKey !== 'transfer-encoding' && lowerKey !== 'date') {
          res.setHeader(key, result.headers[key]);
        }
      });

      // Send body
      res.send(result.body);

      logger.info(`[${deviceId}] HTTP request completed: ${req.method} ${path}, status=${result.status}`);
    }

  } catch (error) {
    logger.error(`[${deviceId}] Request failed:`, error);

    if (!res.headersSent) {
      if (error.message === 'Device not connected') {
        res.status(503).json({
          error: 'Desktop not connected',
          deviceId,
          message: 'Make sure Recrate is running on your computer'
        });
      } else if (error.message === 'Stream request timeout') {
        res.status(504).json({
          error: 'Request timeout',
          deviceId,
          message: 'Desktop took too long to respond'
        });
      } else {
        res.status(500).json({
          error: 'Proxy error',
          deviceId,
          message: error.message
        });
      }
    }
  }
});

module.exports = router;
module.exports.setWebSocketManager = setWebSocketManager;
