// ============================================================================
// FILE: packages/desktop/src/binaryProxyClient.js
// PURPOSE: Binary WebSocket relay between Railway and Local Server
// ============================================================================

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

// Protocol-level ping keeps half-open sockets (Windows sleep/resume, Wi-Fi
// power-save) from lingering forever: a missed pong terminates the socket,
// which fires 'close' and drives the normal reconnect path.
const PROXY_PING_INTERVAL_MS = 25000;
const LOCAL_RECONNECT_DELAY_MS = 2000;

class BinaryProxyClient extends EventEmitter {
  constructor(proxyURL, localServerURL, deviceId, logger) {
    super();
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
    this.isShuttingDown = false;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;

    // Heartbeat / reconnect bookkeeping
    this.proxyPingInterval = null;
    this.proxyIsAlive = false;
    this.proxyReconnectTimer = null;
    this.localReconnectTimer = null;
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
        maxPayload: 100 * 1024 * 1024 // 100MB to support large library responses
      });

      this.localWs.on('open', () => {
        this.logger.info('✓ Connected to local server');
        resolve();
      });

      this.localWs.on('message', (data, isBinary) => {
        this.handleLocalServerMessage(data, isBinary);
      });

      this.localWs.on('close', () => {
        this.logger.warn('Local server connection closed');
        this.localWs = null;  // Clear reference to allow GC
        this._scheduleLocalReconnect();
      });

      this.localWs.on('error', (error) => {
        this.logger.error('Local server WebSocket error:', error);
        reject(error);
      });
    });
  }

  _scheduleLocalReconnect() {
    if (this.isShuttingDown || this.localReconnectTimer) return;
    this.logger.info('Reconnecting to local server...');
    this.localReconnectTimer = setTimeout(() => {
      this.localReconnectTimer = null;
      this.connectToLocalServer().catch((err) => {
        this.logger.error('Local server reconnect failed:', err.message);
        this._scheduleLocalReconnect();
      });
    }, LOCAL_RECONNECT_DELAY_MS);
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
      let settled = false;

      this.proxyWs = new WebSocket(this.proxyURL, {
        perMessageDeflate: false,
        maxPayload: 100 * 1024 * 1024 // 100MB to support large library responses
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

        this._startProxyHeartbeat();
        this.emit('connected', { deviceId: this.deviceId });

        if (!settled) {
          settled = true;
          resolve();
        }
      });

      this.proxyWs.on('message', (data, isBinary) => {
        this.handleProxyMessage(data, isBinary);
      });

      this.proxyWs.on('close', () => {
        this.logger.warn('Railway Proxy connection closed');
        this._stopProxyHeartbeat();
        this.proxyWs = null;  // Clear reference to allow GC
        this.isConnecting = false;
        this.rejectAllPending('Connection to Railway closed');
        this.emit('disconnected');
        this._scheduleProxyReconnect();
      });

      this.proxyWs.on('error', (error) => {
        this.logger.error('Railway Proxy WebSocket error:', error);
        this.isConnecting = false;
        // 'close' usually follows 'error', but not on every failure mode —
        // the double-schedule guard makes calling from both safe.
        this._scheduleProxyReconnect();
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
    });
  }

  _startProxyHeartbeat() {
    this._stopProxyHeartbeat();
    const ws = this.proxyWs;
    if (!ws) return;

    this.proxyIsAlive = true;
    ws.on('pong', () => { this.proxyIsAlive = true; });

    this.proxyPingInterval = setInterval(() => {
      if (this.proxyWs !== ws || ws.readyState !== WebSocket.OPEN) {
        this._stopProxyHeartbeat();
        return;
      }
      if (!this.proxyIsAlive) {
        this.logger.warn(`Proxy heartbeat: no pong in ${PROXY_PING_INTERVAL_MS}ms — terminating half-open socket`);
        // terminate() (not close()) — a half-open socket never ACKs a close
        // frame; terminate destroys TCP and fires 'close' immediately.
        ws.terminate();
        return;
      }
      this.proxyIsAlive = false;
      ws.ping();
    }, PROXY_PING_INTERVAL_MS);
  }

  _stopProxyHeartbeat() {
    if (this.proxyPingInterval) {
      clearInterval(this.proxyPingInterval);
      this.proxyPingInterval = null;
    }
  }

  _scheduleProxyReconnect() {
    if (this.isShuttingDown || this.proxyReconnectTimer || this.isConnecting) return;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    this.logger.info(`Reconnecting to Railway in ${this.reconnectDelay}ms...`);
    this.proxyReconnectTimer = setTimeout(() => {
      this.proxyReconnectTimer = null;
      this.connectToProxy().catch((err) => {
        this.logger.error('Proxy reconnect failed:', err.message);
      });
    }, this.reconnectDelay);
  }

  /**
   * Immediately tear down and re-establish the proxy connection.
   * Used on system resume, when the old socket is likely half-open.
   */
  forceReconnect() {
    if (this.isShuttingDown) return;
    this.logger.info('Force reconnect requested');
    if (this.proxyReconnectTimer) {
      clearTimeout(this.proxyReconnectTimer);
      this.proxyReconnectTimer = null;
    }
    this.reconnectDelay = 500; // doubled by _scheduleProxyReconnect → 1s retry
    if (this.proxyWs) {
      this.proxyWs.terminate(); // 'close' handler schedules the reconnect
    } else if (!this.isConnecting) {
      this._scheduleProxyReconnect();
    }
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
    } else if (message.type === 'http_request') {
      // Forward HTTP request to local server
      this.forwardHttpRequest(message);
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

  forwardHttpRequest(message) {
    const { requestId, method, path, headers, body } = message;

    this.logger.info(`Forwarding HTTP request to local server: ${method} ${path}, requestId=${requestId}`);

    // Simply forward the http_request message to local server
    // The local server will handle it and send back http_response
    this.sendToLocalServer(JSON.stringify({
      type: 'http_request',
      requestId,
      method,
      path,
      headers,
      body
    }), false);
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
    this.isShuttingDown = true;  // Prevent reconnection attempts
    this._stopProxyHeartbeat();
    if (this.proxyReconnectTimer) {
      clearTimeout(this.proxyReconnectTimer);
      this.proxyReconnectTimer = null;
    }
    if (this.localReconnectTimer) {
      clearTimeout(this.localReconnectTimer);
      this.localReconnectTimer = null;
    }
    this.rejectAllPending('Client shutting down');

    if (this.localWs) {
      this.localWs.close();
      this.localWs = null;
    }
    if (this.proxyWs) {
      this.proxyWs.close();
      this.proxyWs = null;
    }
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
