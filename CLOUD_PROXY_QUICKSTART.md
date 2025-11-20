# Cloud Proxy Quick Start Guide

## 🚀 Ready to Test? Start Here!

### Option 1: Test Locally (5 minutes)

**Step 1: Start the Proxy**
```bash
cd packages/proxy
npm start
```

You should see:
```
🚀 Proxy server running on port 3001
📱 Mobile API: http://localhost:3001/api
🖥️  Desktop WebSocket: ws://localhost:3001/desktop
```

**Step 2: Start the Desktop App**
```bash
# In a new terminal
cd packages/desktop
export PROXY_URL=ws://localhost:3001
npm start
```

Watch for these logs:
```
Connecting to proxy: ws://localhost:3001
Connected to proxy successfully
Device ID: abc-123-xyz-789
```

**Step 3: Test the Connection**
```bash
# In a new terminal
curl http://localhost:3001/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "...",
  "connectedDevices": 1
}
```

**Step 4: Connect from Mobile**

- Open the desktop app window
- You'll see a QR code with URL: `http://localhost:3001/api/{deviceId}`
- Scan with mobile app (both must be on same WiFi)
- Mobile should show: "☁️ Cloud Proxy - Works anywhere"

**✅ Success!** If you see the cloud proxy badge on mobile, it's working!

---

### Option 2: Deploy to Production (15 minutes)

**Step 1: Create Railway Account**
1. Go to https://railway.app
2. Sign up with GitHub
3. Verify email

**Step 2: Deploy Proxy**

**Method A: Railway Dashboard (Easiest)**
1. Click "New Project" → "Deploy from GitHub repo"
2. Connect your Recrate repository
3. Railway will ask "Which directory?" → Enter: `packages/proxy`
4. Click "Deploy"
5. Wait 2-3 minutes for deployment

**Method B: Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Go to proxy directory
cd packages/proxy

# Initialize and deploy
railway init
railway up
```

**Step 3: Get Your Proxy URL**

In Railway dashboard:
- Click on your proxy service
- Go to "Settings" → "Domains"
- Click "Generate Domain"
- Copy the URL (e.g., `recrate-proxy.up.railway.app`)

**Step 4: Update Desktop App**

```bash
cd packages/desktop
```

Edit `main.js` line 25:
```javascript
// Change from:
const PROXY_URL = process.env.PROXY_URL || 'ws://localhost:3001';

// To (use your Railway URL):
const PROXY_URL = process.env.PROXY_URL || 'wss://recrate-proxy.up.railway.app';
```

**Step 5: Rebuild Desktop App**

```bash
npm run build:mac    # For macOS
# or
npm run build:win    # For Windows
# or
npm run build:linux  # For Linux
```

**Step 6: Test!**

1. Run the desktop app
2. Check logs for: "Connected to proxy successfully"
3. QR code should show: `https://recrate-proxy.up.railway.app/api/{deviceId}`
4. Scan with mobile from **any network** (cellular, different WiFi, etc.)
5. Mobile should connect and show your library!

**✅ You're Live!** The app now works from anywhere!

---

## 🐛 Troubleshooting

### Desktop won't connect to proxy

**Check 1: Is proxy running?**
```bash
curl https://your-proxy-url.up.railway.app/health
```

Should return: `{"status":"ok",...}`

**Check 2: Is URL correct?**
- Local: `ws://localhost:3001`
- Production: `wss://your-proxy.up.railway.app` (note the 'wss')

**Check 3: Check desktop logs**
Look for errors in Electron console (View → Toggle Developer Tools)

### Mobile says "Desktop not connected"

**Check 1: Is desktop running?**
Desktop app should be open and server should be started (green button)

**Check 2: Is device ID correct?**
Compare QR code URL with what mobile is trying to connect to

**Check 3: Test proxy status**
```bash
curl https://your-proxy-url/api/device/{deviceId}/status
```

Should return: `{"connected":true,...}`

### Proxy logs show errors

**Check Railway logs:**
```bash
# If using Railway CLI:
railway logs

# Or in Railway dashboard:
# Click project → View Logs
```

---

## 📊 Verify It's Working

### Desktop Checklist
- [ ] Server starts successfully
- [ ] Logs show "Connected to proxy successfully"
- [ ] Logs show "Device ID: ..."
- [ ] QR code appears with proxy URL
- [ ] Connection badge shows "☁️ Cloud Proxy"

### Mobile Checklist
- [ ] QR scan successful
- [ ] Connection badge shows "☁️ Cloud Proxy - Works anywhere"
- [ ] Library loads
- [ ] Tracks play
- [ ] Works on cellular (not just WiFi)

### Proxy Checklist
- [ ] Health endpoint returns status ok
- [ ] Shows 1+ connected devices
- [ ] Railway deployment successful
- [ ] Logs show desktop registration

---

## 🎯 What's Different?

**Before (Local/Tailscale):**
```
Desktop: 🏠 Local Network • http://192.168.1.100:3000
Mobile:  Must be on same WiFi or install Tailscale VPN
Setup:   5-10 minutes of configuration
```

**After (Cloud Proxy):**
```
Desktop: ☁️ Cloud Proxy • https://proxy.railway.app/api/xyz
Mobile:  Works from anywhere, any network
Setup:   Scan QR code, done! (0 minutes)
```

---

## 💡 Pro Tips

1. **Development:** Use local proxy (`ws://localhost:3001`) for testing
2. **Production:** Use Railway proxy (`wss://your-proxy.railway.app`)
3. **Fallback:** Tailscale still works if proxy fails
4. **Logs:** Always check proxy logs first when debugging
5. **Testing:** Test mobile on cellular to verify remote access works

---

## 🔄 GitHub Auto-Deploy (Optional)

Want automatic deployments when you push to GitHub?

**Step 1: Get Railway Token**
1. Railway dashboard → Account Settings → Tokens
2. Create new token → Copy it

**Step 2: Add to GitHub**
1. GitHub repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `RAILWAY_TOKEN`
4. Value: (paste your token)

**Step 3: Push to GitHub**
```bash
git add .
git commit -m "feat: cloud proxy integration"
git push origin main
```

GitHub Actions will automatically deploy to Railway!

View deployment: GitHub repo → Actions tab

---

## 📞 Need Help?

**Resources:**
- Full documentation: `packages/proxy/README.md`
- Implementation summary: `CLOUD_PROXY_IMPLEMENTATION_SUMMARY.md`
- Original spec: `CLOUD_PROXY_IMPLEMENTATION.md`

**Common Commands:**
```bash
# Check health
curl https://your-proxy-url/health

# Check device status
curl https://your-proxy-url/api/device/{deviceId}/status

# View Railway logs
railway logs

# Test WebSocket
wscat -c ws://localhost:3001/desktop
```

---

Happy deploying! Your app will now work anywhere, just like PlayStation Remote Play. 🎮🎵
