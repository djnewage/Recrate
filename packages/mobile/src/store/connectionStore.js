import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONNECTION_TYPES = {
  PROXY: 'proxy',
  TAILSCALE: 'tailscale',
  LOCAL: 'local',
  MANUAL: 'manual',
  OFFLINE: 'offline',
};

export const useConnectionStore = create((set, get) => ({
  // State
  connectionType: CONNECTION_TYPES.OFFLINE,
  serverURL: null,
  isConnected: false,
  isSearching: false,
  lastSuccessfulIP: null,

  // Actions
  setConnectionType: (type) => set({ connectionType: type }),
  setServerURL: (url) => set({ serverURL: url }),
  setConnected: (connected) => set({ isConnected: connected }),
  setSearching: (searching) => set({ isSearching: searching }),

  // Test connection to a URL
  testConnection: async (url) => {
    // Build health URL - all servers have /health endpoint
    const healthURL = `${url}/health`;

    console.log(`[ConnectionStore] Testing connection to: ${healthURL}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`[ConnectionStore] Request timed out after 30 seconds`);
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

      console.log(`[ConnectionStore] Response status: ${response.status}, ok: ${response.ok}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`[ConnectionStore] Response data:`, data);
        return true;
      } else {
        console.error(`[ConnectionStore] HTTP error: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`[ConnectionStore] Connection failed:`, error.name, error.message);
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
        console.log('Trying last known IP:', lastIP);
        const works = await get().testConnection(lastIP);
        if (works) {
          // Determine connection type
          let type = CONNECTION_TYPES.LOCAL;
          if (lastIP.includes('/api/') && lastIP.startsWith('https://')) {
            type = CONNECTION_TYPES.PROXY;
          } else if (lastIP.startsWith('100.')) {
            type = CONNECTION_TYPES.TAILSCALE;
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

      // 2. Scan for Tailscale IP (100.x.x.x range)
      console.log('Scanning for Tailscale server...');
      const tailscaleIP = await get().scanTailscaleRange();
      if (tailscaleIP) {
        await AsyncStorage.setItem('lastServerIP', tailscaleIP);
        set({
          serverURL: tailscaleIP,
          connectionType: CONNECTION_TYPES.TAILSCALE,
          isConnected: true,
          isSearching: false,
          lastSuccessfulIP: tailscaleIP,
        });
        return tailscaleIP;
      }

      // 3. Scan local network (192.168.x.x)
      console.log('Scanning local network...');
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
      console.error('Error finding server:', error);
      set({ isSearching: false });
      return null;
    }
  },

  // Scan Tailscale IP range
  scanTailscaleRange: async () => {
    // Try the HTTPS Tailscale URL
    const tailscaleURL = 'https://tristans-macbook-pro.tailca1b53.ts.net';
    console.log('Trying Tailscale HTTPS URL:', tailscaleURL);

    const works = await get().testConnection(tailscaleURL);
    if (works) {
      console.log('Found Tailscale server via HTTPS');
      return tailscaleURL;
    }

    console.log('Tailscale HTTPS connection failed');
    return null;
  },

  // Scan local network range
  scanLocalRange: async () => {
    // Get device's local IP to determine subnet
    // For now, try common router IPs
    const commonIPs = [
      'http://192.168.1.131:3000', // Tristan's MacBook Pro
      'http://192.168.1.100:3000',
      'http://192.168.0.100:3000',
      'http://192.168.1.2:3000',
      'http://192.168.0.2:3000',
      'http://10.0.0.2:3000',
    ];

    for (const ip of commonIPs) {
      const works = await get().testConnection(ip);
      if (works) {
        console.log('Found local server:', ip);
        return ip;
      }
    }

    return null;
  },

  // Manual connection
  connectManually: async (url) => {
    console.log(`[ConnectionStore] Manual connect attempt with: "${url}"`);

    // Clean the URL
    url = url.trim();

    // Remove trailing slashes
    url = url.replace(/\/+$/, '');

    // Remove /health if present
    url = url.replace('/health', '');

    // Ensure URL has http://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
      console.log(`[ConnectionStore] Added http://, now: ${url}`);
    }

    // Ensure URL has port (check if port is already in URL)
    // Don't add :3000 for HTTPS URLs (they use standard port :443)
    const hasPort = url.match(/:\d+$/);
    const isHttps = url.startsWith('https://');
    if (!hasPort && !isHttps) {
      url = `${url}:3000`;
      console.log(`[ConnectionStore] Added port, final URL: ${url}`);
    }

    console.log(`[ConnectionStore] Final URL for testing: ${url}`);
    const works = await get().testConnection(url);

    if (works) {
      console.log(`[ConnectionStore] ✅ Manual connection successful!`);
      await AsyncStorage.setItem('lastServerIP', url);

      // Determine connection type based on URL pattern
      let connType = CONNECTION_TYPES.MANUAL;
      if (url.includes('/api/') && url.startsWith('https://')) {
        connType = CONNECTION_TYPES.PROXY;
        console.log(`[ConnectionStore] Detected cloud proxy connection`);
      } else if (url.includes('100.')) {
        connType = CONNECTION_TYPES.TAILSCALE;
        console.log(`[ConnectionStore] Detected Tailscale connection`);
      } else if (url.includes('192.168.') || url.includes('10.0.') || url.includes('localhost')) {
        connType = CONNECTION_TYPES.LOCAL;
        console.log(`[ConnectionStore] Detected local network connection`);
      }

      set({
        serverURL: url,
        connectionType: connType,
        isConnected: true,
        lastSuccessfulIP: url,
      });
      return true;
    }

    console.log(`[ConnectionStore] ❌ Manual connection failed`);
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
