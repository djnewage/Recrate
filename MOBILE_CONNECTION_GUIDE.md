# Mobile Connection Setup Guide

## ✅ What's Been Implemented

### Backend (MacBook)
- ✅ Server running on `http://0.0.0.0:3000`
- ✅ All API endpoints functional
- ✅ Audio streaming with range support
- ✅ Health check endpoint working

### Mobile App
- ✅ Connection screen with dynamic server URL input
- ✅ AsyncStorage for persistent server URL
- ✅ Dynamic API configuration
- ✅ Settings tab for changing server connection
- ✅ Auto-connection test on app launch

---

## 🚀 How to Connect Your Phone to MacBook

### Step 1: Get Your MacBook's IP Address

Your MacBook's current IP address is shown when the backend starts, or run:

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Look for an IP like `192.168.x.x` or `10.0.x.x`

### Step 2: Start the Backend Server

```bash
# In the project root
npm start
```

The server will display:
```
✅ Server running at http://0.0.0.0:3000
```

### Step 3: Start the Mobile App

```bash
# In the mobile directory
cd mobile
npm start
```

This will show a QR code (Metro Bundler QR code).

### Step 4: Scan QR Code with Expo Go

1. Install **Expo Go** app on your phone:
   - iOS: App Store → "Expo Go"
   - Android: Play Store → "Expo Go"

2. Open Expo Go and scan the QR code shown in your terminal

3. The Recrate app will load on your phone

### Step 5: Connect to Backend

When the app opens, you'll see the **Connection Screen**:

1. **If using iOS Simulator**: Use `http://localhost:3000`
2. **If using Android Emulator**: Use `http://10.0.2.2:3000`
3. **If using Physical Device**:
   - Enter your MacBook's IP: `http://192.168.x.x:3000`
   - Make sure both devices are on the **same WiFi network**

4. Tap **"Connect"**

5. If successful, you'll see:
   ```
   ✓ Connected
   Successfully connected to Recrate server

   Service: Recrate
   Version: 1.0.0
   ```

6. Tap **"OK"** or **"Continue to Library"**

---

## 🎵 Testing the Full Flow

### Test Library Browsing
1. Navigate to **Library** tab
2. You should see your music tracks from Serato
3. Test search functionality

### Test Crates
1. Navigate to **Crates** tab
2. View existing Serato crates
3. Browse crate contents

### Test Audio Streaming
1. Tap a track in the library
2. The mini player should appear
3. Audio should stream from MacBook → Phone
4. Test seeking/scrubbing

### Change Server Connection
1. Navigate to **Settings** tab (⚙️)
2. Enter a different server URL
3. Test reconnection

---

## 🔧 Troubleshooting

### "Connection Failed"

**Possible causes:**
- Backend not running → Run `npm start` in project root
- Wrong IP address → Double-check MacBook's IP
- Different WiFi networks → Connect both to same WiFi
- Firewall blocking → Check macOS Firewall settings

**Test backend manually:**
```bash
# On your phone's browser, visit:
http://[macbook-ip]:3000/health

# Should return:
{"status":"ok", "service":"Recrate", ...}
```

### Can't Find MacBook's IP

```bash
# macOS - Terminal
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or use System Preferences:
# System Preferences → Network → Wi-Fi → Advanced → TCP/IP
```

### Port 3000 Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Then restart backend
npm start
```

### Metro Bundler QR Code Not Showing

```bash
cd mobile
npm start -- --clear

# Then press 'r' to show QR code again
```

---

## 📱 Platform-Specific Notes

### iOS Simulator (on Mac)
- ✅ Use `http://localhost:3000`
- ✅ No IP address needed
- ✅ Fastest for development

### Android Emulator (on Mac)
- ✅ Use `http://10.0.2.2:3000`
- ❌ `localhost` won't work
- ℹ️ `10.0.2.2` is Android emulator's alias for host machine

### Physical Device (iPhone/Android)
- ✅ Use MacBook's actual IP: `http://192.168.x.x:3000`
- ⚠️ **Must be on same WiFi network**
- ℹ️ Recommended for real-world testing

---

## 🎯 What Works Now

✅ **Full Connection Flow**
- MacBook runs backend server
- Phone scans Metro Bundler QR code (Expo)
- App opens with Connection Screen
- Enter MacBook's IP address
- Connect and browse library
- Stream music from MacBook to phone

✅ **Persistent Connection**
- Server URL saved in AsyncStorage
- Auto-reconnects on app restart
- Change server via Settings tab

✅ **Audio Streaming**
- HTTP range requests supported
- Seeking/scrubbing works
- Multiple audio formats (MP3, FLAC, WAV, etc.)

---

## 🔄 Normal Usage Flow

**After initial setup:**

1. Start backend: `npm start` (on MacBook)
2. Open Expo Go on phone
3. App loads and auto-connects to saved server
4. Browse library and stream music

**No need to:**
- ❌ Re-enter IP address every time
- ❌ Re-scan QR code (unless code changes)
- ❌ Manually configure anything

---

## 📝 Implementation Summary

### Files Changed/Created:

**Backend:**
- ✅ All files already implemented and working

**Mobile:**
- ✅ `mobile/src/screens/ConnectionScreen.js` - New connection UI
- ✅ `mobile/src/services/api.js` - Added dynamic base URL support
- ✅ `mobile/App.js` - Added root navigator with connection screen
- ✅ `mobile/package.json` - Added AsyncStorage dependency

---

## 🎉 You're Ready!

The full streaming flow is now implemented:

**MacBook (Backend)** → **Same WiFi** → **Phone (Mobile App)**

Test it out and enjoy streaming your Serato library to your phone! 🎧📱
