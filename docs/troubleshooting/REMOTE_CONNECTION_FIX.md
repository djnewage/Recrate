# Remote Connection Troubleshooting - Action Plan

## Current Status

✅ **Mac Server:** Running correctly on `http://100.111.35.70:3000`
✅ **Server Configuration:** Bound to all interfaces (0.0.0.0) - correct!
✅ **Tailscale on Mac:** Connected with IP `100.111.35.70`
✅ **Local Connection:** Works (confirmed by user)
❓ **Remote Connection:** Not working (needs investigation)

## Diagnostic Results

From Mac:
- ✅ `http://localhost:3000/health` - Works
- ✅ `http://192.168.1.131:3000/health` - Works
- ✅ `http://100.111.35.70:3000/health` - Works

This confirms the server is configured correctly and accepting connections.

## Action Steps (Do in Order)

### Step 1: Test from iPhone Safari (CRITICAL - Do This First!)

1. On your iPhone, open **Safari**
2. Navigate to: `http://100.111.35.70:3000/health`
3. Note what happens:

**Scenario A: You see JSON response (like `{"status":"ok"...}`)**
- ✅ Network is working!
- 🔧 Problem is in the mobile app
- → Go to Step 3

**Scenario B: You get "Cannot connect" or timeout error**
- ❌ Network/Tailscale issue
- → Go to Step 2

### Step 2: Fix Tailscale Connection (If Safari Test Failed)

1. **On iPhone - Open Tailscale App:**
   - Is it installed? (If not, install from App Store)
   - Is status "Connected"? (If not, tap Connect)
   - Are you signed in? (Use same account as Mac)
   - Do you see your Mac in device list?
   - Does it show IP `100.111.35.70`?

2. **If Tailscale shows "Connected" but Safari still fails:**
   - Try disconnecting and reconnecting Tailscale on iPhone
   - Try restarting Tailscale on Mac
   - Check Mac firewall settings (System Preferences → Security & Privacy → Firewall)

3. **Verify both devices on same Tailscale network:**
   - On Mac, open Terminal and run:
     ```bash
     tailscale status
     ```
   - You should see your iPhone listed
   - If iPhone is not listed, they're not on the same Tailscale network

4. **After fixing Tailscale, retry Safari test** (Step 1)

### Step 3: Debug Mobile App (If Safari Test Passed)

Good news! If Safari works, the network is fine and the issue is in the mobile app.

1. **Reload your mobile app:**
   - Shake device → Reload
   - Or close and reopen the app

2. **Use the new Debug Tool:**
   - Open the Recrate mobile app
   - On Connection screen, tap **"🔧 Show Debug Tools"** (new button at bottom)
   - Tap **"Run Connection Tests"**
   - Wait for all tests to complete
   - Screenshot the results and check:
     - Internet test should pass (confirms device has internet)
     - Local IP test might pass (if on same WiFi)
     - Tailscale IP test should pass (this is the critical one!)

3. **If Tailscale test fails in the app but worked in Safari:**
   - Check Metro bundler console logs
   - Look for errors related to network requests
   - Try increasing timeout in `connectionStore.js` line 30 from 5000 to 15000

4. **Try Manual Connection:**
   - Tap "⚙️ Enter IP Address Manually"
   - Enter exactly: `100.111.35.70`
   - Tap "Connect"
   - Watch the console logs in Metro bundler

### Step 4: Common Fixes

#### Fix 1: Clear App Cache
```javascript
// Add this temporarily to clear saved connection data
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.clear();
```

#### Fix 2: Rebuild the Mobile App
Sometimes iOS network permissions need a fresh build:
```bash
cd packages/mobile
# For iOS
npx expo prebuild --clean
npx expo run:ios

# Or if using EAS
eas build --profile development --platform ios
```

#### Fix 3: Check Console Logs
When you try to connect, watch for these logs:
```
[ConnectionStore] Testing connection to: http://100.111.35.70:3000/health
[ConnectionStore] Response status: 200, ok: true
[ConnectionStore] ✅ Manual connection successful!
```

If you see errors, note the error message.

## Most Likely Causes (Ranked)

1. **Tailscale not actually connected on iPhone** (80% probability)
   - Shows "Connected" but needs reconnection
   - Not on same Tailscale account
   - Not seeing Mac in device list

2. **iOS network permissions** (10% probability)
   - App needs rebuild after permission changes
   - Need to accept network permission prompt

3. **Mac firewall blocking Tailscale interface** (5% probability)
   - Less likely since server is bound to 0.0.0.0
   - But worth checking in System Preferences

4. **Mobile app bug** (5% probability)
   - Fetch timeout too short
   - URL formatting issue
   - State management bug

## Quick Commands Reference

### On Mac:
```bash
# Check Tailscale status
tailscale status

# Check server is running
lsof -i :3000

# Test server from Mac
curl http://100.111.35.70:3000/health

# Run diagnostic script
node diagnose-connection.js
```

### On iPhone:
- **Safari:** `http://100.111.35.70:3000/health`
- **Recrate App:** Use "🔧 Show Debug Tools" button

## What Changed Recently?

Based on git status, these files were modified:
- `packages/mobile/app.json` - ✅ Has correct network permissions
- `packages/mobile/src/screens/ConnectionScreen.js` - ✅ Looks good
- `packages/mobile/src/store/connectionStore.js` - ✅ Connection logic looks correct

No obvious bugs in the code.

## Next Steps

1. **Do Safari test NOW** - This is the most important diagnostic
2. **Report back what you see** - Safari pass/fail tells us everything
3. **If Safari works** - Use the Debug Tools in the mobile app
4. **If Safari fails** - Focus on Tailscale connection on iPhone

## Success Criteria

You'll know it's fixed when:
- ✅ Safari on iPhone shows JSON from `http://100.111.35.70:3000/health`
- ✅ Recrate app Debug Tools show "Tailscale: ✅"
- ✅ Manual connection to `100.111.35.70` succeeds in Recrate app
- ✅ You see your library after connecting remotely

---

**Ready?** Start with the Safari test on your iPhone and let me know what happens!
