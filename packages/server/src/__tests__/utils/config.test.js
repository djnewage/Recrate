const path = require('path');
const os = require('os');

/**
 * Config tests - Note: The config module caches values at load time from
 * environment variables and .env files. These tests verify the config
 * structure and some behavior, but full env override testing requires
 * running tests in isolated processes.
 */
describe('config', () => {
  // Load config once - it's already been evaluated
  const config = require('../../utils/config');

  describe('config structure', () => {
    it('should have serato configuration object', () => {
      expect(config.serato).toBeDefined();
      expect(config.serato.path).toBeDefined();
      expect(config.serato.musicPaths).toBeDefined();
      expect(config.serato.databaseFile).toBe('database V2');
      expect(config.serato.cratesDir).toBe('Subcrates');
    });

    it('should have server configuration object', () => {
      expect(config.server).toBeDefined();
      expect(typeof config.server.port).toBe('number');
      expect(typeof config.server.host).toBe('string');
    });

    it('should have cache configuration object', () => {
      expect(config.cache).toBeDefined();
      expect(typeof config.cache.maxSize).toBe('number');
      expect(typeof config.cache.ttl).toBe('number');
    });

    it('should have discovery configuration object', () => {
      expect(config.discovery).toBeDefined();
      expect(typeof config.discovery.enabled).toBe('boolean');
      expect(config.discovery.serviceType).toBe('Recrate');
    });

    it('should have environment flags', () => {
      expect(typeof config.env).toBe('string');
      expect(typeof config.isDevelopment).toBe('boolean');
      expect(typeof config.isProduction).toBe('boolean');
    });

    it('should have musicPaths as an array', () => {
      expect(Array.isArray(config.serato.musicPaths)).toBe(true);
    });
  });

  describe('serato path detection', () => {
    it('should resolve to a path containing _Serato_', () => {
      expect(config.serato.path).toContain('_Serato_');
    });

    it('should have serato path as absolute path', () => {
      expect(path.isAbsolute(config.serato.path)).toBe(true);
    });
  });

  describe('server defaults', () => {
    it('should have valid port number', () => {
      expect(config.server.port).toBeGreaterThan(0);
      expect(config.server.port).toBeLessThan(65536);
    });

    it('should have valid host string', () => {
      expect(config.server.host.length).toBeGreaterThan(0);
    });
  });

  describe('cache defaults', () => {
    it('should have positive max size', () => {
      expect(config.cache.maxSize).toBeGreaterThan(0);
    });

    it('should have positive TTL', () => {
      expect(config.cache.ttl).toBeGreaterThan(0);
    });
  });

  describe('environment consistency', () => {
    it('isDevelopment and isProduction should be mutually exclusive', () => {
      expect(config.isDevelopment !== config.isProduction ||
             (config.env !== 'development' && config.env !== 'production')).toBe(true);
    });
  });
});
