import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CONNECTION_TYPES = {
  LOCAL: 'local',
  TAILSCALE: 'tailscale',
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
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${url}/health`, {
        signal: controller.signal,
        method: 'GET',
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
        console.log('Trying last known IP:', lastIP);
        const works = await get().testConnection(lastIP);
        if (works) {
          const type = lastIP.startsWith('100.')
            ? CONNECTION_TYPES.TAILSCALE
            : CONNECTION_TYPES.LOCAL;

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
    // Try common Tailscale IPs
    // In production, you'd use mDNS or Tailscale API
    // For now, try the most common pattern
    const baseIPs = ['100.101.102', '100.100.100', '100.64.0'];

    for (const base of baseIPs) {
      for (let i = 1; i < 255; i++) {
        const ip = `http://${base}.${i}:3000`;
        const works = await get().testConnection(ip);
        if (works) {
          console.log('Found Tailscale server:', ip);
          return ip;
        }

        // Only try first 10 IPs for speed
        if (i > 10) break;
      }
    }

    return null;
  },

  // Scan local network range
  scanLocalRange: async () => {
    // Get device's local IP to determine subnet
    // For now, try common router IPs
    const commonIPs = [
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
    // Ensure URL has http://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    // Ensure URL has port
    if (!url.includes(':3000')) {
      url = `${url}:3000`;
    }

    const works = await get().testConnection(url);
    if (works) {
      await AsyncStorage.setItem('lastServerIP', url);
      set({
        serverURL: url,
        connectionType: CONNECTION_TYPES.MANUAL,
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
