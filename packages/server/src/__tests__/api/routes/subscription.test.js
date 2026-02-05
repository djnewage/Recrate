/**
 * Subscription Routes Tests
 * Tests for subscription status and management endpoints
 */

const express = require('express');

// Mock dependencies before requiring the module
jest.mock('../../../utils/db', () => ({
  get: jest.fn(),
  run: jest.fn(),
  saveDatabase: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../utils/usageTracker', () => ({
  getMonthlyUsage: jest.fn().mockReturnValue({ included: 0, byok: 0 }),
}));

const db = require('../../../utils/db');
const logger = require('../../../utils/logger');
const usageTracker = require('../../../utils/usageTracker');
const createSubscriptionRoutes = require('../../../api/routes/subscription');

describe('Subscription Routes', () => {
  let app;
  let router;

  // Helper to make HTTP requests
  const makeRequest = (app, method, path, options = {}) => {
    return new Promise((resolve) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        const req = require('http').request({
          hostname: 'localhost',
          port,
          path,
          method,
          headers: options.headers || {},
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
          });
        });
        if (options.body) {
          req.write(JSON.stringify(options.body));
        }
        req.end();
      });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh router and app for each test
    router = createSubscriptionRoutes();
    app = express();
    app.use(express.json());
    app.use('/api/subscription', router);
  });

  describe('GET /api/subscription/status', () => {
    it('should return 401 when no authentication header provided', async () => {
      const response = await makeRequest(app, 'GET', '/api/subscription/status');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should return correct tier info for trial user', async () => {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 2); // 2 days from now

      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
      });

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('trial');
      expect(response.body.tierInfo.name).toBe('Free Trial');
      expect(response.body.trial.active).toBe(true);
      expect(response.body.trial.daysRemaining).toBeGreaterThan(0);
      expect(response.body.subscription.active).toBe(false);
    });

    it('should return correct tier info for pro user', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 25); // 25 days from now

      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'pro',
        subscription_product_id: 'pro_monthly',
        subscription_expires_at: expiresAt.toISOString(),
        subscription_will_renew: 1,
      });

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('pro');
      expect(response.body.tierInfo.name).toBe('Pro');
      expect(response.body.tierInfo.byokAllowed).toBe(true);
      expect(response.body.subscription.active).toBe(true);
      expect(response.body.subscription.willRenew).toBe(true);
      expect(response.body.subscription.daysRemaining).toBeGreaterThan(0);
    });

    it('should return correct tier info for expired user', async () => {
      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'expired',
        trial_ends_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
      });

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('expired');
      expect(response.body.tierInfo.name).toBe('Expired');
      expect(response.body.tierInfo.features.audioStreaming).toBe(false);
      expect(response.body.tierInfo.features.crateManagement).toBe(true);
      expect(response.body.trial.active).toBe(false);
      expect(response.body.subscription.active).toBe(false);
    });

    it('should create new user if not found', async () => {
      const newUser = {
        id: 'firebase-new',
        firebase_uid: 'firebase-new',
        tier: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
      };

      // Mock implementation that returns null until INSERT happens, then returns newUser
      let userCreated = false;
      db.get.mockImplementation((sql) => {
        if (userCreated) {
          return newUser;
        }
        return null;
      });
      db.run.mockImplementation((sql) => {
        if (sql.includes('INSERT INTO users')) {
          userCreated = true;
        }
      });

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Firebase-UID': 'firebase-new' },
      });

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('trial');
      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.any(Array)
      );
    });

    it('should auto-expire trial and save to database', async () => {
      // Trial ended yesterday
      const expiredTrial = new Date(Date.now() - 86400000).toISOString();

      const user = {
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'trial',
        trial_ends_at: expiredTrial,
      };

      // The checkExpiration function modifies user.tier in place after db.run
      db.get.mockReturnValue(user);
      db.run.mockImplementation(() => {
        // Simulate what the real code does - updates the user object
        user.tier = 'expired';
      });

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('expired');
      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining("tier = ?"),
        ['expired', 'user-123']
      );
      expect(db.saveDatabase).toHaveBeenCalled();
    });

    it('should return quota information', async () => {
      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'pro',
        subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });

      usageTracker.getMonthlyUsage
        .mockReturnValueOnce({ included: 10, byok: 5 }) // crate_builder
        .mockReturnValueOnce({ included: 20, byok: 0 }); // track_identification

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body.quotas.crate_builder.used).toBe(10);
      expect(response.body.quotas.crate_builder.limit).toBe(50); // Pro tier limit
      expect(response.body.quotas.crate_builder.remaining).toBe(40);
      expect(response.body.quotas.crate_builder.byokUsed).toBe(5);
      expect(response.body.quotas.track_identification.used).toBe(20);
      expect(response.body.quotas.track_identification.limit).toBe(100); // Pro tier limit
    });

    it('should work with X-Device-Id header for backwards compatibility', async () => {
      db.get.mockReturnValue({
        id: 'device-abc',
        device_id: 'device-abc',
        tier: 'trial',
        trial_ends_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const response = await makeRequest(app, 'GET', '/api/subscription/status', {
        headers: { 'X-Device-Id': 'device-abc' },
      });

      expect(response.status).toBe(200);
      expect(response.body.tier).toBe('trial');
    });
  });

  describe('POST /api/subscription/start-trial', () => {
    it('should return 401 when no authentication header provided', async () => {
      const response = await makeRequest(app, 'POST', '/api/subscription/start-trial');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should start trial for new user', async () => {
      // User exists but has no trial started
      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'trial',
        trial_started_at: null,
        trial_ends_at: null,
      });

      const response = await makeRequest(app, 'POST', '/api/subscription/start-trial', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tier).toBe('trial');
      expect(response.body.daysRemaining).toBe(3);
      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining("tier = 'trial'"),
        expect.any(Array)
      );
      expect(db.saveDatabase).toHaveBeenCalled();
    });

    it('should reject if trial already started', async () => {
      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'trial',
        trial_started_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      });

      const response = await makeRequest(app, 'POST', '/api/subscription/start-trial', {
        headers: { 'X-Firebase-UID': 'firebase-123' },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Trial already started');
      expect(response.body.trialEndsAt).toBeDefined();
    });
  });

  describe('POST /api/subscription/link-firebase', () => {
    it('should return 400 when X-Firebase-UID header is missing', async () => {
      const response = await makeRequest(app, 'POST', '/api/subscription/link-firebase', {
        headers: { 'X-Device-Id': 'device-123' },
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('X-Firebase-UID header required');
    });

    it('should return success if Firebase account already linked', async () => {
      db.get.mockReturnValue({
        id: 'user-123',
        firebase_uid: 'firebase-123',
        tier: 'pro',
      });

      const response = await makeRequest(app, 'POST', '/api/subscription/link-firebase', {
        headers: {
          'X-Firebase-UID': 'firebase-123',
          'X-Device-Id': 'device-123',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Firebase account already linked');
    });

    it('should link Firebase UID to existing device user', async () => {
      // First call: no existing Firebase user
      // Second call: find device user
      db.get
        .mockReturnValueOnce(null) // No Firebase user
        .mockReturnValueOnce({
          id: 'device-123',
          device_id: 'device-123',
          firebase_uid: null,
          tier: 'trial',
        });

      const response = await makeRequest(app, 'POST', '/api/subscription/link-firebase', {
        headers: {
          'X-Firebase-UID': 'firebase-new',
          'X-Device-Id': 'device-123',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.merged).toBe(true);
      expect(db.run).toHaveBeenCalledWith(
        expect.stringContaining('firebase_uid = ?'),
        expect.arrayContaining(['firebase-new'])
      );
      expect(db.saveDatabase).toHaveBeenCalled();
    });

    it('should create new account if no existing accounts found', async () => {
      const newUser = {
        id: 'firebase-new',
        firebase_uid: 'firebase-new',
        tier: 'trial',
      };

      // Mock implementation that returns null until INSERT happens, then returns newUser
      let userCreated = false;
      db.get.mockImplementation((sql) => {
        if (userCreated) {
          return newUser;
        }
        return null;
      });
      db.run.mockImplementation((sql) => {
        if (sql.includes('INSERT INTO users')) {
          userCreated = true;
        }
      });

      const response = await makeRequest(app, 'POST', '/api/subscription/link-firebase', {
        headers: {
          'X-Firebase-UID': 'firebase-new',
        },
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.merged).toBe(false);
      expect(response.body.message).toBe('New account created with Firebase');
    });
  });
});
