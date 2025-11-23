// ============================================================================
// FILE: packages/desktop/src/binaryProxyClient.js
// PURPOSE: Binary WebSocket relay between Railway and Local Server
// ============================================================================

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

class BinaryProxyClient {
  constructor(proxyURL, localServerURL, deviceId, logger) {
    this.proxyURL = proxyURL; // wss://recrate-proxy.railway.app
    this.localServerURL = localServerURL; // ws://127.0.0.1:3000/ws/audio
    this.deviceId = deviceId;
    this.logger = logger || console; // Use provided logger or fallback to console

    // Promise-based correlation ID map
    this.pendingRequests = new Map(); // requestId → { resolve, reject, timeout, chunks }

    // WebSocket connections
    this.proxyWs = null;
    this.localWs = null;

    // Connection state
    this.isConnecting = false;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
  }

  async start() {
    this.logger.info('Starting Binary Proxy Client...');
    await this.connectToLocalServer();
    await this.connectToProxy();
  }

  // ========================================================================
  // CONNECTION TO LOCAL SERVER
  // ========================================================================

  async connectToLocalServer() {
    return new Promise((resolve, reject) => {
      this.logger.info(`Connecting to local server: ${this.localServerURL}`);

      this.localWs = new WebSocket(this.localServerURL, {
        perMessageDeflate: false,
        maxPayload: 10 * 1024 * 1024
      });

      this.localWs.on('open', () => {
        this.logger.info('✓ Connected to local server');
        resolve();
      });

      this.localWs.on('message', (data, isBinary) => {
        this.handleLocalServerMessage(data, isBinary);
      });

      this.localWs.on('close', () => {
        this.logger.warn('Local server connection closed, reconnecting...');
        setTimeout(() => this.connectToLocalServer(), 2000);
      });

      this.localWs.on('error', (error) => {
        this.logger.error('Local server WebSocket error:', error);
        reject(error);
      });
    });
  }

  handleLocalServerMessage(data, isBinary) {
    if (isBinary) {
      // Binary audio chunk with requestId prefix
      // Format: [requestId length (4 bytes)] [requestId] [binary audio data]

      const requestIdLength = data.readUInt32BE(0);
      const requestId = data.toString('utf8', 4, 4 + requestIdLength);
      const audioData = data.slice(4 + requestIdLength);

      this.logger.debug(`Received binary chunk for ${requestId}: ${audioData.length} bytes`);

      // Accumulate chunks for this request
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        pending.chunks.push(audioData);
      }

      // Forward to Railway Proxy (binary frame)
      this.sendToProxy(data, true);

    } else {
      // Control message (JSON)
      const message = JSON.parse(data.toString());
      this.logger.debug(`Local server control message: ${message.type}, requestId: ${message.requestId}`);

      if (message.type === 'stream_end') {
        // Stream complete - resolve promise with all chunks
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          const completeBuffer = Buffer.concat(pending.chunks);
          pending.resolve({
            ...message,
            buffer: completeBuffer
          });
          this.pendingRequests.delete(message.requestId);
        }
      } else if (message.type === 'error') {
        // Error - reject promise
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error(message.error));
          this.pendingRequests.delete(message.requestId);
        }
      }

      // Forward control message to Railway
      this.sendToProxy(data, false);
    }
  }

  // ========================================================================
  // CONNECTION TO RAILWAY PROXY
  // ========================================================================

  async connectToProxy() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      this.logger.info(`Connecting to Railway Proxy: ${this.proxyURL}`);

      this.proxyWs = new WebSocket(this.proxyURL, {
        perMessageDeflate: false,
        maxPayload: 10 * 1024 * 1024
      });

      this.proxyWs.on('open', () => {
        this.logger.info('✓ Connected to Railway Proxy');
        this.isConnecting = false;
        this.reconnectDelay = 1000;

        // Register device
        this.sendToProxy(JSON.stringify({
          type: 'register',
          deviceId: this.deviceId,
          protocol: 'binary' // Indicate binary protocol support
        }), false);

        resolve();
      });

      this.proxyWs.on('message', (data, isBinary) => {
        this.handleProxyMessage(data, isBinary);
      });

      this.proxyWs.on('close', () => {
        this.logger.warn('Railway Proxy connection closed, reconnecting...');
        this.isConnecting = false;
        this.rejectAllPending('Connection to Railway closed');
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        setTimeout(() => this.connectToProxy(), this.reconnectDelay);
      });

      this.proxyWs.on('error', (error) => {
        this.logger.error('Railway Proxy WebSocket error:', error);
        this.isConnecting = false;
        reject(error);
      });
    });
  }

  handleProxyMessage(data, isBinary) {
    if (isBinary) {
      // This shouldn't happen - Railway should only send control messages to Desktop
      this.logger.warn('Received unexpected binary message from Railway Proxy');
      return;
    }

    // Control message from Railway (request from mobile)
    const message = JSON.parse(data.toString());
    this.logger.info(`Railway request: ${message.type}, requestId: ${message.requestId}`);

    if (message.type === 'stream_request') {
      // Forward to local server
      this.forwardStreamRequest(message);
    } else if (message.type === 'cancel_stream') {
      // Forward cancellation
      this.sendToLocalServer(JSON.stringify(message), false);

      // Also cleanup local pending
      const pending = this.pendingRequests.get(message.requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Stream canceled by client'));
        this.pendingRequests.delete(message.requestId);
      }
    }
  }

  // ========================================================================
  // REQUEST FORWARDING
  // ========================================================================

  forwardStreamRequest(message) {
    const { requestId, trackId, range } = message;

    // Create pending promise for this request
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        chunks: [] // Accumulate binary chunks
      });
    });

    // Forward to local server
    this.sendToLocalServer(JSON.stringify({
      type: 'stream_request',
      requestId,
      trackId,
      range
    }), false);

    // Note: We don't await the promise here - it resolves when stream_end arrives
  }

  sendToLocalServer(data, isBinary) {
    if (this.localWs && this.localWs.readyState === WebSocket.OPEN) {
      this.localWs.send(data, { binary: isBinary });
    } else {
      this.logger.error('Cannot send to local server - not connected');
    }
  }

  sendToProxy(data, isBinary) {
    if (this.proxyWs && this.proxyWs.readyState === WebSocket.OPEN) {
      this.proxyWs.send(data, { binary: isBinary });
    } else {
      this.logger.error('Cannot send to Railway Proxy - not connected');
    }
  }

  // ========================================================================
  // CLEANUP
  // ========================================================================

  rejectAllPending(reason) {
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  shutdown() {
    this.logger.info('Shutting down Binary Proxy Client...');
    this.rejectAllPending('Client shutting down');

    if (this.localWs) this.localWs.close();
    if (this.proxyWs) this.proxyWs.close();
  }

  // ========================================================================
  // UI COMPATIBILITY METHODS
  // ========================================================================

  getDeviceId() {
    return this.deviceId;
  }

  isConnected() {
    return this.proxyWs && this.proxyWs.readyState === 1; // 1 = WebSocket.OPEN
  }
}

module.exports = BinaryProxyClient;
