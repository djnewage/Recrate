# Recrate Mobile App

React Native mobile app for browsing and managing your Serato DJ library remotely.

## Features

- 📚 Browse your entire music library
- 🔍 Search tracks by title, artist, or album
- 📦 View and manage crates
- ➕ Create new crates
- 🎵 Add tracks to crates
- 🎧 Stream and preview tracks
- 📊 View track metadata (BPM, key, duration)
- 🎨 Modern purple/pink gradient theme

## Prerequisites

- Node.js 18+
- Expo Go app on your phone (for testing)
- Recrate backend service running

## Installation

```bash
# Install dependencies
npm install
```

## Configuration

Before running the app, you need to configure the backend API URL:

1. Open `src/constants/config.js`
2. Update the `BASE_URL` with your backend server address:

```javascript
export const API_CONFIG = {
  // For iOS Simulator: use 'http://localhost:3000'
  // For Android Emulator: use 'http://10.0.2.2:3000'
  // For physical device: use your computer's local IP (e.g., 'http://192.168.1.100:3000')
  BASE_URL: 'http://YOUR_IP_ADDRESS:3000',
  TIMEOUT: 10000,
};
```

### Finding Your Computer's IP Address

**On macOS:**
```bash
ipconfig getifaddr en0
# Or for Wi-Fi: ipconfig getifaddr en1
```

**On Linux:**
```bash
hostname -I | awk '{print $1}'
```

**On Windows:**
```bash
ipconfig
# Look for IPv4 Address under your active network adapter
```

## Running the App

### Start the Backend Service First

Make sure your Recrate backend is running:

```bash
# In the root directory (not mobile/)
npm start
```

### Start the Mobile App

```bash
# In the mobile/ directory
npm start
```

This will start Expo and give you options:

- Press `w` to open in web browser
- Press `i` to open in iOS Simulator (requires Xcode on macOS)
- Press `a` to open in Android Emulator (requires Android Studio)
- Scan QR code with Expo Go app on your physical device

## Testing with Expo Go (Recommended)

1. Install Expo Go on your phone:
   - [iOS](https://apps.apple.com/app/expo-go/id982107779)
   - [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Make sure your phone and computer are on the same Wi-Fi network

3. Update the API URL in `src/constants/config.js` with your computer's local IP

4. Run `npm start` and scan the QR code with Expo Go

## Project Structure

```
mobile/
├── App.js                      # Main app entry with navigation
├── src/
│   ├── screens/                # App screens
│   │   ├── LibraryScreen.js    # Browse library
│   │   ├── CratesScreen.js     # View crates
│   │   └── CrateDetailScreen.js # View crate details
│   ├── components/             # Reusable components
│   │   ├── TrackItem.js        # Track list item
│   │   └── MiniPlayer.js       # Mini player component
│   ├── services/               # API services
│   │   └── api.js              # Backend API client
│   ├── store/                  # State management
│   │   └── useStore.js         # Zustand store
│   └── constants/              # App constants
│       ├── config.js           # API configuration
│       └── theme.js            # Theme colors and styles
```

## Usage

### Browsing Library

1. Open the app to the **Library** tab
2. Search tracks using the search bar
3. Sort by title, artist, or BPM
4. Tap a track to play it
5. Long press to select multiple tracks

### Managing Crates

1. Switch to the **Crates** tab
2. Tap "Create New Crate" to create a crate
3. Tap a crate to view its tracks
4. To add tracks to a crate:
   - Go to Library
   - Long press to select tracks
   - Tap "Add to Crate"
   - Select the target crate

### Playing Music

- Tap any track to start playing
- Use the mini player at the bottom to:
  - Play/pause
  - View current position
  - Stop playback

## Troubleshooting

### Can't connect to backend

1. Verify the backend is running (`npm start` in root directory)
2. Check that your phone and computer are on the same Wi-Fi network
3. Verify the IP address in `src/constants/config.js` is correct
4. Try accessing `http://YOUR_IP:3000/health` in your phone's browser
5. Check firewall settings on your computer

### Audio won't play

1. Verify audio files exist in your Serato library
2. Check file permissions on your music directory
3. Try a different track
4. Check the backend logs for errors

### App crashes on startup

1. Clear cache: `npm start -- --clear`
2. Reinstall dependencies: `rm -rf node_modules && npm install`
3. Check console for error messages

## Development

### Available Scripts

- `npm start` - Start Expo development server
- `npm run android` - Start on Android emulator
- `npm run ios` - Start on iOS simulator
- `npm run web` - Start in web browser

### State Management

The app uses Zustand for state management. The store is located in `src/store/useStore.js`.

### Adding New Features

1. Create components in `src/components/`
2. Create screens in `src/screens/`
3. Add API methods in `src/services/api.js`
4. Update state management in `src/store/useStore.js`
5. Update navigation in `App.js`

## Notes

- Currently in read-only mode for crate modifications (write support coming soon)
- Audio streaming requires the device to have network access to the backend
- Large libraries may take a moment to load initially

## Future Enhancements

- Offline mode with cached tracks
- Playlist creation
- Advanced search filters
- Waveform display
- BPM detection
- Key detection

## License

MIT
