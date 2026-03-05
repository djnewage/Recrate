import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONNECTION_TYPES = {
  PROXY: 'proxy',
  LOCAL: 'local',
  MANUAL: 'manual',
  OFFLINE: 'offline',
};

const DEVICE_ID_KEY = 'recrate_device_id';

/**
 * Generate a unique device ID
 * Format: device-{timestamp}-{random}
 */
const generateDeviceId = () => {
  return `device-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

export const useConnectionStore = create((set, get) => ({
  // State
  connectionType: CONNECTION_TYPES.OFFLINE,
  serverURL: null,
  isConnected: false,
  isSearching: false,
  lastSuccessfulIP: null,
  networkState: null, // Full NetInfo state object for offline detection
  deviceId: null, // Unique device identifier for API requests
  userId: null, // Firebase UID for user tracking

  // Actions
  setConnectionType: (type) => set({ connectionType: type }),
  setServerURL: (url) => set({ serverURL: url }),
  setConnected: (connected) => set({ isConnected: connected }),
  setSearching: (searching) => set({ isSearching: searching }),
  setNetworkState: (state) => set({ networkState: state }),
  setUserId: (uid) => set({ userId: uid }),

  // Check if currently on cellular (for bandwidth-aware decisions)
  isCellular: () => {
    const { networkState } = get();
    return networkState?.type === 'cellular';
  },

  // Check if device has any network connectivity
  hasNetworkConnectivity: () => {
    const { networkState } = get();
    return networkState?.isConnected ?? false;
  },

  // Initialize device ID (call on app start)
  initializeDeviceId: async () => {
    try {
      let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = generateDeviceId();
        await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
      set({ deviceId });
      return deviceId;
    } catch (error) {
      // Generate a temporary ID for this session
      const tempId = generateDeviceId();
      set({ deviceId: tempId });
      return tempId;
    }
  },

  // Get device ID synchronously (for use in headers)
  getDeviceId: () => get().deviceId,

  // Get user ID synchronously (for use in headers)
  getUserId: () => get().userId,

  // Check if device has network connectivity (regardless of server connection)
  hasNetworkConnectivity: () => {
    const { networkState } = get();
    return networkState?.isConnected ?? false;
  },

  // Test connection to a URL
  testConnection: async (url) => {
    // Build health URL - all servers have /health endpoint
    const healthURL = `${url}/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 30000); // Increased to 30 seconds for slow cellular

      const response = await fetch(healthURL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
        // Important for iOS VPN routing
        credentials: 'omit',
        // Add keepalive for better cellular performance
        keepalive: true,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        await response.json();
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  },

  // Quick test with shorter timeout for reconnection attempts
  quickTestConnection: async (url) => {
    const healthURL = `${url}/health`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(healthURL, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  // Smart connection detection
  findServer: async () => {
    set({ isSearching: true });

    try {
      // 1. Try last successful IP
      const lastIP = await AsyncStorage.getItem('lastServerIP');
      if (lastIP) {
        const works = await get().testConnection(lastIP);
        if (works) {
          // Determine connection type
          let type = CONNECTION_TYPES.LOCAL;
          if (lastIP.includes('/api/') && lastIP.startsWith('https://')) {
            type = CONNECTION_TYPES.PROXY;
          }

          set({
            serverURL: lastIP,
            connectionType: type,
            isConnected: true,
            isSearching: false,
            lastSuccessfulIP: lastIP,
          });
          return lastIP;
        }
      }

      // 2. Scan local network (192.168.x.x)
      const localIP = await get().scanLocalRange();
      if (localIP) {
        await AsyncStorage.setItem('lastServerIP', localIP);
        set({
          serverURL: localIP,
          connectionType: CONNECTION_TYPES.LOCAL,
          isConnected: true,
          isSearching: false,
          lastSuccessfulIP: localIP,
        });
        return localIP;
      }

      // 4. Nothing found
      set({
        serverURL: null,
        connectionType: CONNECTION_TYPES.OFFLINE,
        isConnected: false,
        isSearching: false,
      });
      return null;
    } catch (error) {
      set({ isSearching: false });
      return null;
    }
  },

  // Scan local network range
  scanLocalRange: async () => {
    // Get device's local IP to determine subnet
    // For now, try common router IPs
    // Common local network patterns - no hardcoded specific IPs
    const commonIPs = [
      'http://localhost:3000',     // iOS Simulator uses localhost
      'http://127.0.0.1:3000',     // Alternative localhost
      // Common router-assigned IPs (generic patterns)
      'http://192.168.1.100:3000',
      'http://192.168.0.100:3000',
      'http://192.168.1.2:3000',
      'http://192.168.0.2:3000',
      'http://10.0.0.2:3000',
    ];

    for (const ip of commonIPs) {
      const works = await get().testConnection(ip);
      if (works) {
        return ip;
      }
    }

    return null;
  },

  // Manual connection
  connectManually: async (url) => {
    // Clean the URL
    url = url.trim();

    // Remove trailing slashes
    url = url.replace(/\/+$/, '');

    // Remove /health if present
    url = url.replace('/health', '');

    // Ensure URL has http://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    // Ensure URL has port (check if port is already in URL)
    // Don't add :3000 for HTTPS URLs (they use standard port :443)
    const hasPort = url.match(/:\d+$/);
    const isHttps = url.startsWith('https://');
    if (!hasPort && !isHttps) {
      url = `${url}:3000`;
    }

    const works = await get().testConnection(url);

    if (works) {
      await AsyncStorage.setItem('lastServerIP', url);

      // Determine connection type based on URL pattern
      let connType = CONNECTION_TYPES.MANUAL;
      if (url.includes('/api/') && url.startsWith('https://')) {
        connType = CONNECTION_TYPES.PROXY;
      } else if (url.includes('192.168.') || url.includes('10.0.') || url.includes('localhost')) {
        connType = CONNECTION_TYPES.LOCAL;
      }

      set({
        serverURL: url,
        connectionType: connType,
        isConnected: true,
        lastSuccessfulIP: url,
      });
      return true;
    }

    return false;
  },

  // Disconnect
  disconnect: () => {
    set({
      serverURL: null,
      connectionType: CONNECTION_TYPES.OFFLINE,
      isConnected: false,
    });
  },
}));

export { CONNECTION_TYPES };
