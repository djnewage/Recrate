# Recrate Cloud Proxy

Cloud proxy service for seamless remote access between Recrate desktop and mobile apps.

## Overview

The cloud proxy enables remote access without VPN setup. Desktop apps connect to the proxy via WebSocket, and mobile apps make HTTPS requests that are routed to the desktop.

```
Desktop (WebSocket) ↔ Cloud Proxy ↔ Mobile (HTTPS)
```

## Local Development

### Prerequisites
- Node.js 20+
- npm or yarn

### Installation

```bash
cd packages/proxy
npm install
```

### Running Locally

```bash
npm start
# Or with auto-reload:
npm run dev
```

The proxy will start on `http://localhost:3001`:
- **WebSocket endpoint (Desktop):** `ws://localhost:3001/desktop`
- **HTTP API (Mobile):** `http://localhost:3001/api/:deviceId/*`
- **Health check:** `http://localhost:3001/health`

### Testing Locally

1. **Start the proxy:**
   ```bash
   cd packages/proxy
   npm start
   ```

2. **Update desktop app** to use local proxy:
   ```bash
   # In packages/desktop directory
   export PROXY_URL=ws://localhost:3001
   npm start
   ```

3. **Test desktop connection:**
   - Start the desktop app
   - Check logs for "Connected to proxy successfully"
   - Note the device ID from logs

4. **Test mobile connection:**
   - Scan QR code or manually enter: `http://localhost:3001/api/{deviceId}`
   - Mobile and desktop must be on the same WiFi for local testing

## Deployment to Railway

### Option 1: Automatic Deployment (GitHub Actions)

1. **Create Railway account:** https://railway.app

2. **Create new project:**
   - Click "New Project" → "Empty Project"
   - Name it "recrate-proxy"

3. **Create service:**
   - Click "New" → "GitHub Repo"
   - Connect your Recrate repository
   - Select `packages/proxy` as the root directory

4. **Add GitHub secret:**
   - Go to GitHub repo → Settings → Secrets → Actions
   - Add `RAILWAY_TOKEN`:
     - Get token from Railway: Account Settings → Tokens
     - Create new token and copy

5. **Push to trigger deployment:**
   ```bash
   git add .
   git commit -m "feat: add cloud proxy"
   git push origin main
   ```

   GitHub Actions will automatically deploy to Railway.

### Option 2: Manual Deployment

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```

3. **Link project:**
   ```bash
   cd packages/proxy
   railway link
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

5. **Get URL:**
   ```bash
   railway domain
   ```

### Environment Variables

Railway automatically sets `PORT`. Optional variables:

- `NODE_ENV=production` (set by Railway)
- `REDIS_URL` (optional, for multi-instance scaling)

### Post-Deployment

1. **Get proxy URL** from Railway dashboard (e.g., `recrate-proxy.up.railway.app`)

2. **Update desktop app:**
   ```javascript
   // In packages/desktop/main.js
   const PROXY_URL = 'wss://recrate-proxy.up.railway.app';
   ```

3. **Rebuild desktop app:**
   ```bash
   cd packages/desktop
   npm run build
   ```

## Monitoring

### Health Check

```bash
curl https://your-proxy-url.up.railway.app/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "connectedDevices": 1
}
```

### Check Device Status

```bash
curl https://your-proxy-url.up.railway.app/api/device/{deviceId}/status
```

Response:
```json
{
  "connected": true,
  "deviceName": "Johns-MacBook",
  "connectedAt": 1705317000000,
  "lastHeartbeat": 1705317030000
}
```

### Railway Logs

View in Railway dashboard or use CLI:
```bash
railway logs
```

## Architecture

### WebSocket Flow (Desktop → Proxy)

1. Desktop connects: `ws://proxy.app/desktop`
2. Desktop sends registration:
   ```json
   {
     "type": "register",
     "deviceId": "abc-123",
     "deviceName": "Johns-MacBook",
     "version": "1.0.0"
   }
   ```
3. Proxy responds:
   ```json
   {
     "type": "registered",
     "deviceId": "abc-123",
     "timestamp": 1705317000000
   }
   ```
4. Desktop sends heartbeat every 30s:
   ```json
   { "type": "heartbeat" }
   ```

### HTTP Flow (Mobile → Proxy → Desktop)

1. Mobile makes request: `GET https://proxy.app/api/abc-123/api/library`
2. Proxy forwards to desktop via WebSocket:
   ```json
   {
     "type": "request",
     "requestId": "xyz-789",
     "method": "GET",
     "path": "/api/library",
     "headers": {...}
   }
   ```
3. Desktop processes and responds:
   ```json
   {
     "type": "response",
     "requestId": "xyz-789",
     "status": 200,
     "data": {...}
   }
   ```
4. Proxy forwards response to mobile

## Troubleshooting

### Desktop can't connect to proxy

**Issue:** `WebSocket connection failed`

**Solutions:**
- Check proxy URL is correct (ws:// for local, wss:// for production)
- Verify proxy is running: `curl https://proxy-url/health`
- Check firewall/network settings
- View desktop logs for detailed error

### Mobile gets "Device not connected"

**Issue:** `{"error": "Desktop not connected"}`

**Solutions:**
- Ensure desktop app is running and started
- Check desktop logs for "Connected to proxy successfully"
- Verify device ID matches (compare QR code with desktop logs)
- Test proxy health endpoint

### Request timeout

**Issue:** `{"error": "Request timeout"}`

**Solutions:**
- Desktop might be sleeping or slow to respond
- Check local server is running (desktop should start it automatically)
- Increase timeout in proxy (default 30s)
- Check desktop logs for errors processing request

## Cost Estimate

**Railway Pricing:**
- Free tier: $5/month credit (enough for beta with <10 users)
- Paid: ~$5-20/month for 100 active users
- Scaling: ~$100-150/month for 1000 users

**Usage:**
- WebSocket connections: minimal cost
- HTTP requests: ~$0.01 per 100k requests
- Bandwidth: ~$0.10 per GB

## Security Notes

**Current Implementation (MVP):**
- ✅ HTTPS/WSS encryption (provided by Railway)
- ✅ Device IDs are UUIDs (hard to guess)
- ❌ No authentication (anyone with device ID can connect)
- ❌ No request signing

**For Production (TODO):**
- Add device authentication with secret keys
- Implement request signing
- Add rate limiting
- Add end-to-end encryption between mobile and desktop

## Development Tips

1. **Use nodemon for development:**
   ```bash
   npm run dev
   ```

2. **Test WebSocket connections:**
   ```bash
   # Install wscat
   npm install -g wscat

   # Connect
   wscat -c ws://localhost:3001/desktop

   # Send registration
   {"type":"register","deviceId":"test-123","deviceName":"Test","version":"1.0.0"}
   ```

3. **Test API endpoints:**
   ```bash
   # Check health
   curl http://localhost:3001/health

   # Check device status
   curl http://localhost:3001/api/device/test-123/status
   ```

## License

MIT
