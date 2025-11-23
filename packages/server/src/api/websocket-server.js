// ============================================================================
// FILE: packages/server/src/api/websocket-server.js
// PURPOSE: WebSocket server for binary audio streaming to Desktop Relay
// ============================================================================

const WebSocket = require('ws');
const logger = require('../utils/logger');
const AudioStreamer = require('../audio/streamer');

class AudioWebSocketServer {
  constructor(server, parser) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws/audio',
      // Binary frame configuration
      perMessageDeflate: false, // Disable compression for audio (already compressed)
      maxPayload: 10 * 1024 * 1024 // 10MB max message size
    });

    this.parser = parser;
    this.streamer = new AudioStreamer(parser);
    this.activeStreams = new Map(); // streamId → { stream, track }

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    logger.info('Audio WebSocket server initialized on /ws/audio');
  }

  handleConnection(ws, req) {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    logger.info(`[${clientId}] Desktop relay connected from ${req.socket.remoteAddress}`);

    ws.on('message', async (data, isBinary) => {
      try {
        if (isBinary) {
          logger.warn(`[${clientId}] Received unexpected binary message`);
          return;
        }

        // Control messages are JSON
        const message = JSON.parse(data.toString());
        await this.handleControlMessage(ws, clientId, message);

      } catch (error) {
        logger.error(`[${clientId}] Error handling message:`, error);
        this.sendError(ws, null, error.message);
      }
    });

    ws.on('close', () => {
      logger.info(`[${clientId}] Desktop relay disconnected`);
      this.cleanup(clientId);
    });

    ws.on('error', (error) => {
      logger.error(`[${clientId}] WebSocket error:`, error);
    });
  }

  async handleControlMessage(ws, clientId, message) {
    const { type, requestId, trackId, range } = message;

    logger.debug(`[${clientId}] Control message: ${type}, requestId: ${requestId}`);

    switch (type) {
      case 'stream_request':
        await this.handleStreamRequest(ws, clientId, requestId, trackId, range);
        break;

      case 'http_request':
        await this.handleHttpRequest(ws, clientId, message);
        break;

      case 'cancel_stream':
        this.handleCancelStream(clientId, requestId);
        break;

      case 'ping':
        this.sendControl(ws, { type: 'pong', requestId });
        break;

      default:
        logger.warn(`[${clientId}] Unknown message type: ${type}`);
    }
  }

  async handleHttpRequest(ws, clientId, message) {
    const { requestId, method, path, headers, body } = message;

    try {
      logger.info(`[${clientId}] HTTP request: ${method} ${path}, requestId=${requestId}`);

      // Make local HTTP request to our own REST API server
      const axios = require('axios');
      const localServerURL = 'http://127.0.0.1:3000'; // Local REST API server

      const response = await axios({
        method: method.toLowerCase(),
        url: `${localServerURL}${path}`,
        headers: {
          ...headers,
          host: '127.0.0.1:3000' // Override host header
        },
        data: body,
        validateStatus: () => true, // Accept any status code
        responseType: 'arraybuffer', // Get raw response
        maxRedirects: 0
      });

      // Send HTTP response back through WebSocket
      this.sendControl(ws, {
        type: 'http_response',
        requestId,
        status: response.status,
        headers: response.headers,
        body: response.data.toString('base64') // Send as base64
      });

    } catch (error) {
      logger.error(`[${clientId}] HTTP request error:`, error);
      this.sendControl(ws, {
        type: 'http_response',
        requestId,
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({
          error: 'Internal server error',
          message: error.message
        })).toString('base64')
      });
    }
  }

  async handleStreamRequest(ws, clientId, requestId, trackId, range) {
    try {
      logger.info(`[${clientId}] Stream request: trackId=${trackId}, range=${range}, requestId=${requestId}`);

      // Get track metadata
      const track = await this.parser.getTrackById(trackId);

      if (!track) {
        this.sendError(ws, requestId, 'Track not found', 404);
        return;
      }

      // Verify file path
      let filePath = track.verifiedPath || track.filePath;
      const fs = require('fs').promises;

      try {
        await fs.access(filePath, require('fs').constants.R_OK);
      } catch (error) {
        // Try path resolution
        const pathResolver = require('../utils/pathResolver');
        const resolvedPath = await pathResolver.resolvePath(track.filePath, track);

        if (resolvedPath) {
          await fs.access(resolvedPath, require('fs').constants.R_OK);
          filePath = resolvedPath;
        } else {
          this.sendError(ws, requestId, 'Audio file not accessible', 404);
          return;
        }
      }

      // Get file stats
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;

      // Parse range header if provided
      let start = 0;
      let end = fileSize - 1;

      if (range) {
        const parsed = this.parseRange(range, fileSize);
        start = parsed.start;
        end = parsed.end;
      }

      const contentLength = end - start + 1;
      const mimeType = this.getMimeType(filePath);

      // Send metadata response (control message)
      this.sendControl(ws, {
        type: 'stream_response',
        requestId,
        status: range ? 206 : 200,
        headers: {
          'content-type': mimeType,
          'content-length': contentLength,
          'accept-ranges': 'bytes',
          'content-range': range ? `bytes ${start}-${end}/${fileSize}` : undefined,
          'cache-control': 'public, max-age=3600',
          'etag': `"${trackId}-${stats.mtime.getTime()}"`,
          'last-modified': stats.mtime.toUTCString()
        },
        contentLength
      });

      // Stream binary audio data
      await this.streamBinaryAudio(ws, clientId, requestId, filePath, start, end);

    } catch (error) {
      logger.error(`[${clientId}] Error streaming track:`, error);
      this.sendError(ws, requestId, error.message, 500);
    }
  }

  async streamBinaryAudio(ws, clientId, requestId, filePath, start, end) {
    const fs = require('fs');

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 256 * 1024 });

      let totalBytesSent = 0;
      const streamId = `${clientId}-${requestId}`;

      // Track active stream for cleanup
      this.activeStreams.set(streamId, { stream, track: filePath });

      stream.on('data', (chunk) => {
        if (ws.readyState !== WebSocket.OPEN) {
          stream.destroy();
          reject(new Error('WebSocket closed during streaming'));
          return;
        }

        // Send binary chunk with requestId prefix
        // Format: [requestId length (4 bytes)] [requestId] [binary audio data]
        const requestIdBuffer = Buffer.from(requestId, 'utf8');
        const requestIdLength = Buffer.allocUnsafe(4);
        requestIdLength.writeUInt32BE(requestIdBuffer.length, 0);

        const message = Buffer.concat([requestIdLength, requestIdBuffer, chunk]);

        ws.send(message, { binary: true }, (error) => {
          if (error) {
            logger.error(`[${clientId}] Error sending chunk:`, error);
            stream.destroy();
            reject(error);
          }
        });

        totalBytesSent += chunk.length;
      });

      stream.on('end', () => {
        logger.info(`[${clientId}] Stream complete: ${totalBytesSent} bytes sent for ${requestId}`);

        // Send end-of-stream marker (control message)
        this.sendControl(ws, {
          type: 'stream_end',
          requestId,
          bytesSent: totalBytesSent
        });

        this.activeStreams.delete(streamId);
        resolve();
      });

      stream.on('error', (error) => {
        logger.error(`[${clientId}] Stream error:`, error);
        this.sendError(ws, requestId, error.message, 500);
        this.activeStreams.delete(streamId);
        reject(error);
      });
    });
  }

  handleCancelStream(clientId, requestId) {
    const streamId = `${clientId}-${requestId}`;
    const activeStream = this.activeStreams.get(streamId);

    if (activeStream) {
      logger.info(`[${clientId}] Canceling stream: ${requestId}`);
      activeStream.stream.destroy();
      this.activeStreams.delete(streamId);
    }
  }

  sendControl(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message), { binary: false });
    }
  }

  sendError(ws, requestId, message, status = 500) {
    this.sendControl(ws, {
      type: 'error',
      requestId,
      error: message,
      status
    });
  }

  parseRange(rangeHeader, fileSize) {
    if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
      throw new Error('Invalid range header');
    }

    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parts[0] ? parseInt(parts[0], 10) : 0;
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start < 0 || end < 0 || start > end) {
      throw new Error('Invalid range values');
    }

    return {
      start: Math.min(start, fileSize - 1),
      end: Math.min(end, fileSize - 1)
    };
  }

  getMimeType(filePath) {
    const path = require('path');
    const ext = path.extname(filePath).toLowerCase();

    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.aiff': 'audio/aiff',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  cleanup(clientId) {
    // Clean up all active streams for this client
    for (const [streamId, activeStream] of this.activeStreams.entries()) {
      if (streamId.startsWith(clientId)) {
        activeStream.stream.destroy();
        this.activeStreams.delete(streamId);
      }
    }
  }
}

module.exports = AudioWebSocketServer;
