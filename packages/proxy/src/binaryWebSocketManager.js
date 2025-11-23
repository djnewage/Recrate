// ============================================================================
// FILE: packages/proxy/src/binaryWebSocketManager.js
// PURPOSE: Event-driven WebSocket manager with binary frame support
// ============================================================================

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');

class BinaryWebSocketManager {
  constructor(server) {
    // WebSocket server for Desktop connections
    this.wss = new WebSocket.Server({
      server,
      path: '/ws/desktop',
      perMessageDeflate: false,
      maxPayload: 10 * 1024 * 1024
    });

    // Device registry: deviceId → { connection, info }
    this.devices = new Map();

    // Promise-based pending requests: requestId → { resolve, reject, timeout }
    this.pendingRequests = new Map();

    // Binary chunk accumulators: requestId → Buffer[]
    this.binaryChunks = new Map();

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    logger.info('Binary WebSocket server initialized on /ws/desktop');
  }

  handleConnection(ws, req) {
    let deviceId = null;
    const tempId = `temp-${Date.now()}`;

    logger.info(`[${tempId}] Desktop device connecting from ${req.socket.remoteAddress}`);

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Binary audio chunk from Desktop
        // Format: [requestId length (4 bytes)] [requestId] [binary audio data]

        const requestIdLength = data.readUInt32BE(0);
        const requestId = data.toString('utf8', 4, 4 + requestIdLength);
        const audioData = data.slice(4 + requestIdLength);

        logger.info(`[${deviceId || tempId}] Binary chunk for ${requestId}: ${audioData.length} bytes`);

        // Accumulate chunks
        if (!this.binaryChunks.has(requestId)) {
          this.binaryChunks.set(requestId, []);
        }
        this.binaryChunks.get(requestId).push(audioData);

        // Also resolve pending request with this chunk immediately
        // (for streaming response to mobile)
        const pending = this.pendingRequests.get(requestId);
        if (pending && pending.onChunk) {
          pending.onChunk(audioData);
        }

      } else {
        // Control message (JSON)
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'register') {
            deviceId = message.deviceId;
            this.devices.set(deviceId, {
              connection: ws,
              protocol: message.protocol || 'legacy',
              connectedAt: new Date()
            });

            logger.info(`[${deviceId}] Desktop registered`);

            // Send registration confirmation
            ws.send(JSON.stringify({
              type: 'registered',
              deviceId,
              timestamp: Date.now()
            }));

          } else if (message.type === 'stream_response') {
            // Stream metadata response
            this.handleStreamResponse(deviceId, message);

          } else if (message.type === 'stream_end') {
            // End of stream
            this.handleStreamEnd(deviceId, message);

          } else if (message.type === 'http_response') {
            // HTTP API response
            this.handleHttpResponse(deviceId, message);

          } else if (message.type === 'error') {
            // Error response
            this.handleStreamError(deviceId, message);
          }

        } catch (error) {
          logger.error(`[${deviceId || tempId}] Error parsing message:`, error);
        }
      }
    });

    ws.on('close', () => {
      if (deviceId) {
        logger.warn(`[${deviceId}] Desktop disconnected`);
        this.devices.delete(deviceId);
        this.rejectPendingForDevice(deviceId);
      }
    });

    ws.on('error', (error) => {
      logger.error(`[${deviceId || tempId}] WebSocket error:`, error);
    });
  }

  // ========================================================================
  // REQUEST DISPATCHING (CALLED FROM HTTP HANDLER)
  // ========================================================================

  async sendStreamRequest(deviceId, trackId, rangeHeader) {
    const device = this.devices.get(deviceId);

    if (!device || device.connection.readyState !== WebSocket.OPEN) {
      throw new Error('Device not connected');
    }

    const requestId = uuidv4();

    logger.info(`[${deviceId}] Sending stream request: trackId=${trackId}, range=${rangeHeader}, requestId=${requestId}`);

    // Create promise that resolves when stream completes
    const streamPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.binaryChunks.delete(requestId);
        reject(new Error('Stream request timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        deviceId,
        metadata: null, // Will be set when stream_response arrives
        chunks: [], // For accumulating binary data
        onChunk: null // Will be set for streaming response
      });
    });

    // Send request to Desktop
    device.connection.send(JSON.stringify({
      type: 'stream_request',
      requestId,
      trackId,
      range: rangeHeader
    }));

    return { requestId, promise: streamPromise };
  }

  async sendHttpRequest(deviceId, method, path, headers, body) {
    const device = this.devices.get(deviceId);

    if (!device || device.connection.readyState !== WebSocket.OPEN) {
      throw new Error('Device not connected');
    }

    const requestId = uuidv4();

    logger.info(`[${deviceId}] Sending HTTP request: ${method} ${path}, requestId=${requestId}`);

    // Create promise that resolves when HTTP response arrives
    const httpPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('HTTP request timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        deviceId,
        type: 'http'
      });
    });

    // Send request to Desktop
    device.connection.send(JSON.stringify({
      type: 'http_request',
      requestId,
      method,
      path,
      headers,
      body
    }));

    return httpPromise;
  }

  // ========================================================================
  // RESPONSE HANDLING (FROM DESKTOP)
  // ========================================================================

  handleStreamResponse(deviceId, message) {
    const { requestId, status, headers, contentLength } = message;

    logger.info(`[${deviceId}] Stream response for ${requestId}: status=${status}, length=${contentLength}`);

    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      // Store metadata
      pending.metadata = {
        status,
        headers,
        contentLength
      };
    }
  }

  handleStreamEnd(deviceId, message) {
    const { requestId, bytesSent } = message;

    logger.info(`[${deviceId}] Stream end for ${requestId}: ${bytesSent} bytes`);

    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);

      // Get all binary chunks
      const chunks = this.binaryChunks.get(requestId) || [];
      const completeBuffer = Buffer.concat(chunks);

      // Resolve promise
      pending.resolve({
        metadata: pending.metadata,
        buffer: completeBuffer,
        bytesSent
      });

      // Cleanup
      this.pendingRequests.delete(requestId);
      this.binaryChunks.delete(requestId);
    }
  }

  handleStreamError(deviceId, message) {
    const { requestId, error, status } = message;

    logger.error(`[${deviceId}] Stream error for ${requestId}: ${error}`);

    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(error));
      this.pendingRequests.delete(requestId);
      this.binaryChunks.delete(requestId);
    }
  }

  handleHttpResponse(deviceId, message) {
    const { requestId, status, headers, body } = message;

    logger.info(`[${deviceId}] HTTP response for ${requestId}: status=${status}`);

    const pending = this.pendingRequests.get(requestId);
    if (pending && pending.type === 'http') {
      clearTimeout(pending.timeout);

      // Decode base64 body
      const responseBody = body ? Buffer.from(body, 'base64') : Buffer.alloc(0);

      // Resolve with HTTP response data
      pending.resolve({
        status,
        headers,
        body: responseBody
      });

      this.pendingRequests.delete(requestId);
    }
  }

  // ========================================================================
  // STREAMING RESPONSE SUPPORT
  // ========================================================================

  attachChunkHandler(requestId, onChunkCallback) {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.onChunk = onChunkCallback;
    }
  }

  getMetadata(requestId) {
    const pending = this.pendingRequests.get(requestId);
    return pending ? pending.metadata : null;
  }

  // ========================================================================
  // CLEANUP
  // ========================================================================

  rejectPendingForDevice(deviceId) {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.deviceId === deviceId) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Device disconnected'));
        this.pendingRequests.delete(requestId);
        this.binaryChunks.delete(requestId);
      }
    }
  }

  getDeviceStatus(deviceId) {
    const device = this.devices.get(deviceId);
    return device ? {
      connected: true,
      protocol: device.protocol,
      connectedAt: device.connectedAt
    } : {
      connected: false
    };
  }
}

module.exports = BinaryWebSocketManager;
