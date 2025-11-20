# Railway Deployment Guide - Recrate Cloud Proxy

## 🎯 Goal
Deploy the cloud proxy to Railway so mobile can connect from anywhere (cellular, any WiFi, worldwide).

---

## 📋 Prerequisites

- ✅ Local proxy working (you've tested this!)
- ✅ GitHub account
- ✅ Recrate code pushed to GitHub

---

## 🚀 Option 1: Deploy via Railway Dashboard (Easiest)

### Step 1: Create Railway Account
1. Go to **https://railway.app**
2. Click **"Start a New Project"** or **"Login"**
3. Sign up with **GitHub** (recommended - one click)
4. Authorize Railway to access your repositories

### Step 2: Create New Project
1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your **Recrate** repository
4. Railway will scan your repo

### Step 3: Configure Service
1. Railway detects it's a monorepo
2. Click **"Add Service"**
3. Set **Root Directory**: `packages/proxy`
4. Railway auto-detects `package.json` and Node.js
5. Click **"Deploy"**

### Step 4: Wait for Deployment (~2 minutes)
Railway will:
- Install dependencies (`npm install`)
- Start the server (`npm start`)
- Show build logs in real-time

### Step 5: Generate Public Domain
1. Click on your **proxy service** card
2. Go to **Settings** → **Networking**
3. Click **"Generate Domain"**
4. Copy the URL (example: `recrate-proxy-production.up.railway.app`)

### Step 6: Verify Deployment
Test the health endpoint:
```bash
curl https://your-proxy-url.up.railway.app/health
```

Should return:
```json
{"status":"ok","timestamp":"...","connectedDevices":0}
```

---

## 🚀 Option 2: Deploy via Railway CLI

### Step 1: Create Railway Account
Same as Option 1 above.

### Step 2: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 3: Login
```bash
railway login
```
This opens your browser to authorize the CLI.

### Step 4: Initialize Project
```bash
cd /path/to/Recrate/packages/proxy
railway init
```
- Select **"Create new project"**
- Name it: `recrate-proxy`

### Step 5: Deploy
```bash
railway up
```
This uploads your code and deploys it.

### Step 6: Generate Domain
```bash
railway domain
```
Copy the generated URL.

---

## 🔧 Update Desktop App for Production

### Step 1: Edit main.js
```bash
cd packages/desktop
```

Edit `main.js` line 25:
```javascript
// Before (local testing):
const PROXY_URL = process.env.PROXY_URL || 'ws://localhost:3001';

// After (production):
const PROXY_URL = process.env.PROXY_URL || 'wss://your-proxy-url.up.railway.app';
```

**Important:** Use `wss://` (secure WebSocket) not `ws://`!

### Step 2: Rebuild Desktop App (Optional)
For distribution:
```bash
cd packages/desktop
npm run build:mac    # or build:win / build:linux
```

For development testing:
```bash
cd packages/desktop
npm start
```

### Step 3: Restart Desktop App
The app will now connect to Railway proxy instead of localhost.

---

## 🧪 Testing Production Deployment

### Test 1: Desktop Connects
**Desktop logs should show:**
```
Connecting to proxy: wss://your-proxy-url.up.railway.app
Connected to proxy successfully
Device ID: 8db4d9aa-9c99-45e5-ad67-a9934631be53
```

**Check Railway logs:**
```bash
railway logs
```
Should show:
```
[INFO] Desktop registered: 8db4d9aa-... (YourMacBook)
```

### Test 2: Check Proxy Health
```bash
curl https://your-proxy-url.up.railway.app/health
```
Should show `"connectedDevices": 1`

### Test 3: Check Device Status
```bash
curl https://your-proxy-url.up.railway.app/api/device/YOUR-DEVICE-ID/status
```
Should return:
```json
{
  "connected": true,
  "deviceName": "YourMacBook",
  "connectedAt": 1234567890,
  "lastHeartbeat": 1234567890
}
```

### Test 4: Mobile from Anywhere
**Desktop shows:**
```
☁️ Cloud Proxy
https://your-proxy-url.up.railway.app/api/YOUR-DEVICE-ID
☁️ Works anywhere - Tap to copy
```

**Test mobile on:**
- ✅ Same WiFi → should work
- ✅ **Cellular data** → should work! 🎉
- ✅ Different WiFi → should work!
- ✅ Coffee shop WiFi → should work!

---

## 🔍 Monitoring & Debugging

### View Railway Logs
**Dashboard:**
- Click your service → View → Logs

**CLI:**
```bash
railway logs
# Or follow live:
railway logs -f
```

### Common Issues

**Issue: Desktop shows "Failed to connect to proxy"**
- Check Railway URL is correct (`wss://` not `ws://`)
- Verify Railway deployment is running
- Check Railway logs for errors

**Issue: Mobile gets "Desktop not connected"**
- Desktop app must be running
- Check Railway logs show device registered
- Verify device ID matches

**Issue: "connectedDevices: 0"**
- Desktop app not connecting
- Check `PROXY_URL` in desktop main.js
- Restart desktop app

---

## 💰 Railway Pricing

**Free Tier:**
- $5 credit per month
- Enough for: ~750 server hours/month
- Perfect for beta testing with <10 users

**Hobby Plan ($5/month):**
- Unlimited projects
- $5 credit included
- Good for: 100-500 active users

**Estimated Costs:**
- 100 users: ~$10-20/month
- 1000 users: ~$100-150/month

**Free tier is enough to start!**

---

## 🔐 Environment Variables (Optional)

If needed, set in Railway dashboard:
- `PORT` (auto-set by Railway)
- `NODE_ENV=production` (auto-set)
- `REDIS_URL` (for scaling - add later)

---

## 🎉 Success Checklist

- [ ] Railway account created
- [ ] Proxy deployed to Railway
- [ ] Domain generated and copied
- [ ] Desktop main.js updated with Railway URL (`wss://...`)
- [ ] Desktop app restarted
- [ ] Desktop logs show "Connected to proxy successfully"
- [ ] Railway health endpoint returns ok
- [ ] Desktop window shows Railway URL (not localhost)
- [ ] Mobile connects on same WiFi
- [ ] **Mobile connects on cellular** 🎊

---

## 📞 Support

**Railway Docs:** https://docs.railway.app
**Railway Discord:** https://discord.gg/railway
**Railway Status:** https://status.railway.app

**Troubleshooting:**
1. Check Railway deployment status
2. View Railway logs: `railway logs`
3. Test health endpoint
4. Check device status endpoint
5. Verify desktop logs show connection

---

## 🔄 Re-deploying After Changes

**Option 1: Auto-deploy (Recommended)**
1. Push to GitHub
2. Railway auto-deploys (if connected to GitHub)

**Option 2: Manual via CLI**
```bash
cd packages/proxy
railway up
```

---

## 📝 Next Steps After Deployment

1. **Test from different locations**
   - Home WiFi ✓
   - Cellular data ✓
   - Coffee shop ✓

2. **Share with beta testers**
   - Send them the desktop app
   - They scan QR code
   - Works immediately!

3. **Monitor usage**
   - Check Railway dashboard
   - Watch costs
   - Review logs

4. **Add GitHub Actions** (optional)
   - Auto-deploy on push
   - See `.github/workflows/deploy-proxy.yml`

---

**You're done!** The proxy now works from anywhere in the world! 🌍🎉
