const BinaryProxyClient = require('../binaryProxyClient');

// Mock WebSocket
jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1
  }));
});

describe('BinaryProxyClient', () => {
  let client;
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    client = new BinaryProxyClient(
      'wss://proxy.example.com',
      'ws://localhost:3000',
      'test-device',
      mockLogger
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(client.proxyURL).toBe('wss://proxy.example.com');
      expect(client.localServerURL).toBe('ws://localhost:3000');
      expect(client.deviceId).toBe('test-device');
      expect(client.isShuttingDown).toBe(false);
      expect(client.pendingRequests).toBeInstanceOf(Map);
    });
  });

  describe('shutdown', () => {
    it('should set isShuttingDown flag', () => {
      client.shutdown();
      expect(client.isShuttingDown).toBe(true);
    });

    it('should clear pending requests', () => {
      const mockReject = jest.fn();
      client.pendingRequests.set('test-id', {
        resolve: jest.fn(),
        reject: mockReject,
        timeout: setTimeout(() => {}, 1000),
        chunks: []
      });

      client.shutdown();

      expect(client.pendingRequests.size).toBe(0);
      expect(mockReject).toHaveBeenCalledWith(new Error('Client shutting down'));
    });

    it('should close WebSocket connections', () => {
      const mockLocalClose = jest.fn();
      const mockProxyClose = jest.fn();
      client.localWs = { close: mockLocalClose };
      client.proxyWs = { close: mockProxyClose };

      client.shutdown();

      expect(mockLocalClose).toHaveBeenCalled();
      expect(mockProxyClose).toHaveBeenCalled();
      expect(client.localWs).toBeNull();
      expect(client.proxyWs).toBeNull();
    });

    it('should handle null WebSocket connections gracefully', () => {
      client.localWs = null;
      client.proxyWs = null;

      expect(() => client.shutdown()).not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return falsy when proxyWs is null', () => {
      client.proxyWs = null;
      expect(client.isConnected()).toBeFalsy();
    });

    it('should return falsy when readyState is not OPEN', () => {
      client.proxyWs = { readyState: 0 }; // CONNECTING
      expect(client.isConnected()).toBeFalsy();
    });

    it('should return truthy when connected', () => {
      client.proxyWs = { readyState: 1 }; // OPEN
      expect(client.isConnected()).toBeTruthy();
    });
  });

  describe('getDeviceId', () => {
    it('should return the device ID', () => {
      expect(client.getDeviceId()).toBe('test-device');
    });
  });

  describe('rejectAllPending', () => {
    it('should reject all pending requests with given reason', () => {
      const mockReject1 = jest.fn();
      const mockReject2 = jest.fn();
      const timeout1 = setTimeout(() => {}, 1000);
      const timeout2 = setTimeout(() => {}, 1000);

      client.pendingRequests.set('req-1', {
        resolve: jest.fn(),
        reject: mockReject1,
        timeout: timeout1,
        chunks: []
      });
      client.pendingRequests.set('req-2', {
        resolve: jest.fn(),
        reject: mockReject2,
        timeout: timeout2,
        chunks: []
      });

      client.rejectAllPending('Test reason');

      expect(mockReject1).toHaveBeenCalledWith(new Error('Test reason'));
      expect(mockReject2).toHaveBeenCalledWith(new Error('Test reason'));
      expect(client.pendingRequests.size).toBe(0);
    });
  });
});
