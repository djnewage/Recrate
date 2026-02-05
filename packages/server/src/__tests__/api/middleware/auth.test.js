/**
 * Auth Middleware Tests
 * Tests for requireAuth, optionalAuth, requireTier, and requireQuota
 */

// Mock dependencies before requiring the module
jest.mock('../../../utils/db', () => ({
  get: jest.fn(),
  run: jest.fn(),
  isInitialized: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../utils/usageTracker', () => ({
  checkQuota: jest.fn(),
}));

jest.mock('../../../utils/firebase', () => ({
  verifyIdToken: jest.fn(),
}));

jest.mock('../../../config/tiers', () => ({
  getTier: jest.fn().mockReturnValue({ name: 'Trial', limits: {} }),
  isByokAllowed: jest.fn().mockReturnValue(false),
}));

const db = require('../../../utils/db');
const logger = require('../../../utils/logger');
const usageTracker = require('../../../utils/usageTracker');
const { verifyIdToken } = require('../../../utils/firebase');
const { getTier, isByokAllowed } = require('../../../config/tiers');
const { requireAuth, optionalAuth, requireTier, requireQuota } = require('../../../api/middleware/auth');

// Helper to create mock request/response
const createMockReq = (headers = {}, body = {}) => ({
  headers,
  body,
  user: null,
  decodedToken: null,
  quota: null,
  isByok: null,
});

const createMockRes = () => {
  const res = {
    statusCode: null,
    jsonData: null,
    status: jest.fn().mockImplementation((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation((data) => {
      res.jsonData = data;
      return res;
    }),
  };
  return res;
};

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.isInitialized.mockReturnValue(true);
  });

  describe('requireAuth', () => {
    describe('authentication methods', () => {
      it('should authenticate with valid Bearer token', async () => {
        const req = createMockReq({ authorization: 'Bearer valid-token' });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'pro',
        });

        await requireAuth(req, res, next);

        expect(verifyIdToken).toHaveBeenCalledWith('valid-token');
        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.verifiedByToken).toBe(true);
        expect(next).toHaveBeenCalled();
      });

      it('should authenticate with X-Firebase-UID header', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'trial',
        });

        await requireAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.verifiedByToken).toBe(false);
        expect(next).toHaveBeenCalled();
      });

      it('should authenticate with X-User-Id header (alias)', async () => {
        const req = createMockReq({ 'x-user-id': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'trial',
        });

        await requireAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(next).toHaveBeenCalled();
      });

      it('should authenticate with X-Device-Id header (backwards compat)', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'device-123',
          device_id: 'device-123',
          tier: 'trial',
        });

        await requireAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.deviceId).toBe('device-123');
        expect(next).toHaveBeenCalled();
      });

      it('should return 401 when no auth headers provided', async () => {
        const req = createMockReq({});
        const res = createMockRes();
        const next = jest.fn();

        await requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.jsonData.error).toContain('Authentication required');
        expect(next).not.toHaveBeenCalled();
      });

      it('should fall back to header auth when Bearer token invalid', async () => {
        const req = createMockReq({
          authorization: 'Bearer invalid-token',
          'x-firebase-uid': 'firebase-uid-123',
        });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue(null);
        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'trial',
        });

        await requireAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.verifiedByToken).toBe(false);
        expect(next).toHaveBeenCalled();
      });
    });

    describe('user lookup and creation', () => {
      it('should create new user if not found', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'new-firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        const newUser = {
          id: 'new-firebase-uid',
          firebase_uid: 'new-firebase-uid',
          tier: 'trial',
          trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        };

        db.get
          .mockReturnValueOnce(null) // First lookup - not found
          .mockReturnValueOnce(newUser); // After insert

        await requireAuth(req, res, next);

        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO users'),
          expect.any(Array)
        );
        expect(req.user).toBeDefined();
        expect(next).toHaveBeenCalled();
      });

      it('should migrate device user to Firebase UID', async () => {
        const req = createMockReq({
          'x-firebase-uid': 'new-firebase-uid',
          'x-device-id': 'existing-device-id',
        });
        const res = createMockRes();
        const next = jest.fn();

        const migratedUser = {
          id: 'user-123',
          firebase_uid: 'new-firebase-uid',
          device_id: 'existing-device-id',
          tier: 'pro',
        };

        db.get
          .mockReturnValueOnce(null) // No Firebase user
          .mockReturnValueOnce({ id: 'user-123', device_id: 'existing-device-id', firebase_uid: null, tier: 'pro' }) // Device user
          .mockReturnValueOnce(migratedUser); // After migration

        await requireAuth(req, res, next);

        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE users SET firebase_uid'),
          expect.arrayContaining(['new-firebase-uid'])
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Migrated device user')
        );
        expect(next).toHaveBeenCalled();
      });

      it('should lookup by device_id column', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'user-123',
          device_id: 'device-123',
          tier: 'trial',
        });

        await requireAuth(req, res, next);

        expect(db.get).toHaveBeenCalledWith(
          expect.stringContaining('device_id = ?'),
          ['device-123']
        );
        expect(next).toHaveBeenCalled();
      });
    });

    describe('subscription/trial expiration', () => {
      it('should expire subscription when past expiration date', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        const user = {
          id: 'user-123',
          firebase_uid: 'firebase-uid',
          tier: 'pro',
          subscription_expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        };

        db.get.mockReturnValue(user);

        await requireAuth(req, res, next);

        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining("tier = 'expired'"),
          expect.any(Array)
        );
        expect(req.user.tier).toBe('expired');
        expect(next).toHaveBeenCalled();
      });

      it('should expire trial when past trial end date', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        const user = {
          id: 'user-123',
          firebase_uid: 'firebase-uid',
          tier: 'trial',
          trial_ends_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        };

        db.get.mockReturnValue(user);

        await requireAuth(req, res, next);

        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining("tier = 'expired'"),
          expect.any(Array)
        );
        expect(req.user.tier).toBe('expired');
        expect(next).toHaveBeenCalled();
      });

      it('should not expire active subscription', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid',
          tier: 'pro',
          subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 days from now
        });

        await requireAuth(req, res, next);

        expect(req.user.tier).toBe('pro');
        expect(next).toHaveBeenCalled();
      });
    });

    describe('database not initialized', () => {
      it('should allow request with default trial user when DB not initialized', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        db.isInitialized.mockReturnValue(false);

        await requireAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.tier).toBe('trial');
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Database not initialized')
        );
        expect(next).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return 500 on unexpected error', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockImplementation(() => {
          throw new Error('Database error');
        });

        await requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.jsonData.error).toBe('Authentication error');
        expect(logger.error).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
      });
    });
  });

  describe('optionalAuth', () => {
    describe('no auth headers', () => {
      it('should set req.user to null and continue', async () => {
        const req = createMockReq({});
        const res = createMockRes();
        const next = jest.fn();

        await optionalAuth(req, res, next);

        expect(req.user).toBeNull();
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    describe('Bearer token authentication', () => {
      it('should authenticate with valid Bearer token', async () => {
        const req = createMockReq({ authorization: 'Bearer valid-token' });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'pro',
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.verifiedByToken).toBe(true);
        expect(next).toHaveBeenCalled();
      });

      it('should set basic user info when token valid but user not in DB', async () => {
        const req = createMockReq({ authorization: 'Bearer valid-token' });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
        db.get.mockReturnValue(null); // User not found

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.id).toBe('firebase-uid-123');
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.tier).toBe('trial');
        expect(req.user.verifiedByToken).toBe(true);
        expect(next).toHaveBeenCalled();
      });

      it('should fall back to header auth when Bearer token invalid', async () => {
        const req = createMockReq({
          authorization: 'Bearer invalid-token',
          'x-firebase-uid': 'firebase-uid-123',
        });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue(null);
        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'trial',
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.verifiedByToken).toBe(false);
        expect(next).toHaveBeenCalled();
      });
    });

    describe('header-based authentication', () => {
      it('should authenticate with X-Firebase-UID header', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'trial',
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(next).toHaveBeenCalled();
      });

      it('should authenticate with X-Device-Id header', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'device-123',
          device_id: 'device-123',
          tier: 'trial',
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.deviceId).toBe('device-123');
        expect(next).toHaveBeenCalled();
      });

      it('should lookup device by id column as fallback', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get
          .mockReturnValueOnce(null) // No firebase_uid match
          .mockReturnValueOnce(null) // No device_id match
          .mockReturnValueOnce({ id: 'device-123', tier: 'trial' }); // Match by id

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(next).toHaveBeenCalled();
      });
    });

    describe('database not initialized', () => {
      it('should set basic user info when DB not initialized', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.isInitialized.mockReturnValue(false);

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.id).toBe('firebase-uid-123');
        expect(req.user.tier).toBe('trial');
        expect(next).toHaveBeenCalled();
      });

      it('should use device ID when Firebase UID not available and DB not initialized', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.isInitialized.mockReturnValue(false);

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.id).toBe('device-123');
        expect(req.user.deviceId).toBe('device-123');
        expect(req.user.tier).toBe('trial');
        expect(next).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should set req.user to null on error and continue', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockImplementation(() => {
          throw new Error('Database error');
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeNull();
        expect(logger.debug).toHaveBeenCalledWith(
          expect.stringContaining('optionalAuth failed'),
          expect.any(String)
        );
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('should not fail on verifyIdToken error', async () => {
        const req = createMockReq({ authorization: 'Bearer bad-token' });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockRejectedValue(new Error('Token verification failed'));

        await optionalAuth(req, res, next);

        expect(req.user).toBeNull();
        expect(next).toHaveBeenCalled();
      });
    });

    describe('user object structure', () => {
      it('should include all expected fields from DB user', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-uid-123',
          device_id: 'device-456',
          tier: 'pro',
          byok_key_hash: 'hash123',
          trial_ends_at: '2024-01-01T00:00:00Z',
          subscription_expires_at: '2025-01-01T00:00:00Z',
          subscription_will_renew: 1,
        });

        await optionalAuth(req, res, next);

        expect(req.user).toEqual({
          id: 'firebase-uid-123',
          internalId: 'user-123',
          firebaseUid: 'firebase-uid-123',
          deviceId: 'device-456',
          tier: 'pro',
          byokKeyHash: 'hash123',
          trialEndsAt: '2024-01-01T00:00:00Z',
          subscriptionExpiresAt: '2025-01-01T00:00:00Z',
          subscriptionWillRenew: true,
          verifiedByToken: false,
        });
      });
    });
  });

  describe('requireTier', () => {
    it('should return 401 if no user', () => {
      const middleware = requireTier(['pro']);
      const req = createMockReq({});
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.error).toBe('Authentication required');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if user tier not allowed', () => {
      const middleware = requireTier(['pro']);
      const req = createMockReq({});
      req.user = { tier: 'trial' };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.currentTier).toBe('trial');
      expect(res.jsonData.requiredTiers).toEqual(['pro']);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow if user tier is in allowed list', () => {
      const middleware = requireTier(['trial', 'pro']);
      const req = createMockReq({});
      req.user = { tier: 'trial' };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireQuota', () => {
    it('should return 401 if no user', () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if BYOK not allowed for tier', () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({}, { userApiKey: 'user-api-key' });
      req.user = { id: 'user-123', tier: 'trial' };
      const res = createMockRes();
      const next = jest.fn();

      isByokAllowed.mockReturnValue(false);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.error).toContain('BYOK');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 429 if quota exceeded', () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      req.user = { id: 'user-123', tier: 'trial' };
      const res = createMockRes();
      const next = jest.fn();

      usageTracker.checkQuota.mockReturnValue({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetDate: '2024-02-01T00:00:00Z',
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.jsonData.error).toContain('quota exceeded');
      expect(res.jsonData.quota).toBeDefined();
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 429 with upgrade message if limit is 0', () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      req.user = { id: 'user-123', tier: 'expired' };
      const res = createMockRes();
      const next = jest.fn();

      usageTracker.checkQuota.mockReturnValue({
        allowed: false,
        limit: 0,
        remaining: 0,
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.jsonData.error).toContain('Upgrade to Pro');
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request if quota available', () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      req.user = { id: 'user-123', tier: 'pro' };
      const res = createMockRes();
      const next = jest.fn();

      usageTracker.checkQuota.mockReturnValue({
        allowed: true,
        limit: 50,
        remaining: 45,
      });

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.quota).toBeDefined();
      expect(req.quota.remaining).toBe(45);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set isByok flag on request', () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({}, { userApiKey: 'user-api-key' });
      req.user = { id: 'user-123', tier: 'pro' };
      const res = createMockRes();
      const next = jest.fn();

      isByokAllowed.mockReturnValue(true);
      usageTracker.checkQuota.mockReturnValue({
        allowed: true,
        limit: 50,
        remaining: 45,
      });

      middleware(req, res, next);

      expect(req.isByok).toBe(true);
      expect(next).toHaveBeenCalled();
    });
  });
});
