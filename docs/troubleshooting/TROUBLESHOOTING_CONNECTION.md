# Connection Troubleshooting Guide

## Your Current Setup

**Laptop Tailscale IP:** `100.111.35.70`
**Server URL:** `http://100.111.35.70:3000`
**Server Status:** ✅ Running (confirmed accessible locally)

---

## Step-by-Step Debugging

### Step 1: Verify Tailscale on Phone

1. Open **Tailscale app** on your phone
2. Check status - should say **"Connected"**
3. Look for your laptop's name in the device list
4. Tap on your laptop - note the IP address shown (should be `100.111.35.70`)

**If not connected:**
- Sign in to Tailscale on phone
- Make sure it's the SAME account as your laptop
- Toggle connection off/on

---

### Step 2: Test Connection from Phone Browser

Before trying the Recrate app, test with Safari/Chrome on your phone:

1. Open **Safari** or **Chrome** on your phone
2. Enter this URL: `http://100.111.35.70:3000/health`
3. You should see JSON response: `{"status":"ok",...}`

**If this works:** ✅ Network is good, issue is in Recrate app
**If this fails:** ❌ Network/Tailscale issue

---

### Step 3: Check Mobile App Logs

If using Metro bundler:

```bash
# In terminal, watch the logs while you try to connect
cd packages/mobile
npm start
# Watch console output when you tap "Connect"
```

You should see logs like:
```
[ConnectionStore] Manual connect attempt with: "100.111.35.70"
[ConnectionStore] Added http://, now: http://100.111.35.70
[ConnectionStore] Added port, final URL: http://100.111.35.70:3000
[ConnectionStore] Testing connection to: http://100.111.35.70:3000/health
[ConnectionStore] Response status: 200, ok: true
[ConnectionStore] ✅ Manual connection successful!
```

**If you see:** `❌ Manual connection failed` → Network issue
**If you see:** Nothing → App not calling the function

---

### Step 4: Try Manual Connection

In Recrate mobile app:

1. Tap **"⚙️ Enter IP Address Manually"**
2. Enter **exactly**: `100.111.35.70`
3. Tap **"Connect"**
4. Watch console logs (if using Metro)

**What to enter:**
- ✅ Correct: `100.111.35.70`
- ✅ Correct: `100.111.35.70:3000`
- ✅ Correct: `http://100.111.35.70:3000`
- ❌ Wrong: `https://100.111.35.70:3000` (no https!)
- ❌ Wrong: `100.111.35.70/` (no trailing slash!)

---

### Step 5: Check Firewall on Laptop

Your laptop might be blocking connections:

**macOS:**
```bash
# Check if anything is blocking port 3000
sudo pfctl -s rules | grep 3000

# Temporarily disable firewall to test (turn back on after!)
sudo pfctl -d
```

**Alternative - Allow port 3000:**
1. System Preferences → Security & Privacy → Firewall
2. Firewall Options
3. Add Electron.app (or Node)
4. Allow incoming connections

---

### Step 6: Verify Server Binding

Make sure your server is listening on all interfaces:

```bash
# Check what the server is bound to
lsof -i :3000

# Should show: TCP *:hbci (LISTEN)
# * means all interfaces - GOOD
# localhost means local only - BAD
```

Your server shows: `TCP *:hbci (LISTEN)` ✅ This is correct!

---

## Common Issues & Fixes

### Issue 1: "Could not connect to server"

**Possible causes:**
1. Tailscale not connected on phone
2. Wrong IP address entered
3. Laptop firewall blocking connections
4. Server not running

**Fix:**
- Verify Tailscale connected on both devices
- Try browser test (Step 2)
- Check firewall (Step 5)

---

### Issue 2: Connection works on laptop but not phone

**Cause:** Tailscale network issue

**Fix:**
```bash
# On laptop, check Tailscale status
tailscale status

# Should show your phone in the list
# Example output:
# 100.111.35.70   laptop         user@       macOS   -
# 100.111.35.71   iphone         user@       iOS     -
```

If phone not listed → Reconnect Tailscale on phone

---

### Issue 3: Works in Safari but not Recrate app

**Cause:** App networking issue or cache

**Fix:**
1. Kill and restart Recrate app completely
2. Clear AsyncStorage:
```javascript
// In connection screen, add temporary button:
await AsyncStorage.clear();
```
3. Try connection again

---

### Issue 4: Timeout after 3 seconds

**Cause:** Network latency or connectivity

**Fix:** Increase timeout in connectionStore.js:
```javascript
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 sec instead of 3
```

---

## Quick Tests

### Test 1: Laptop can reach itself via Tailscale
```bash
curl http://100.111.35.70:3000/health
```
**Expected:** `{"status":"ok",...}`
**Your result:** ✅ Works!

### Test 2: Phone can reach laptop via Tailscale (in phone browser)
```
http://100.111.35.70:3000/health
```
**Expected:** JSON response
**Your result:** ?

### Test 3: Recrate app can connect
```
Open app → Manual entry → 100.111.35.70 → Connect
```
**Expected:** Connection successful
**Your result:** ?

---

## Debug Checklist

- [ ] Tailscale shows "Connected" on laptop
- [ ] Tailscale shows "Connected" on phone
- [ ] Both devices signed into same Tailscale account
- [ ] Laptop shows Tailscale IP: 100.111.35.70
- [ ] Phone can see laptop in Tailscale device list
- [ ] Browser on phone can access: http://100.111.35.70:3000/health
- [ ] Recrate desktop app shows "Server Running"
- [ ] Firewall not blocking port 3000
- [ ] Server bound to all interfaces (*:3000, not localhost:3000)
- [ ] Mobile app logs show connection attempt
- [ ] No network proxy or VPN interfering

---

## Still Not Working?

### Advanced Debug: Packet Trace

On laptop, watch for incoming connections:
```bash
sudo tcpdump -i any port 3000

# Try connecting from phone
# You should see packets from 100.x.x.x (phone's Tailscale IP)
```

If you see packets → Server receiving them (check server logs)
If no packets → Network routing issue (check Tailscale)

---

## Next Steps

1. **First:** Try browser test (Step 2) - most important!
2. **If browser works:** Issue is in Recrate app
3. **If browser fails:** Issue is Tailscale/network
4. **Report back:** Share what you see in browser test

---

**Ready to test?** Start with Step 2 (browser test) and let me know what happens!
