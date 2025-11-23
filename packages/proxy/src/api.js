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

// Proxy audio stream requests to desktop (catch-all route must be last)
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

    // Parse track ID from path
    // Example: /api/stream/track-123 → track-123
    const pathParts = path.split('/').filter(p => p.length > 0);
    
    if (pathParts.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Track ID is required'
      });
    }

    // Extract track ID and remove query parameters or fragments
    let trackId = pathParts[pathParts.length - 1];
    trackId = trackId.split('?')[0].split('#')[0];

    if (!trackId || trackId.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Track ID is required'
      });
    }

    // Send stream request to Desktop via WebSocket (event-driven, NO POLLING)
    const { requestId, promise } = await wsManager.sendStreamRequest(
      deviceId,
      trackId,
      rangeHeader
    );

    logger.debug(`[${deviceId}] Request dispatched: ${requestId}`);

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

    logger.success(`[${deviceId}] Request completed: ${requestId}, ${result.bytesSent} bytes`);

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
