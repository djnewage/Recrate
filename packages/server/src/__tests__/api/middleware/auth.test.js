/**
 * Auth Middleware Tests
 * Tests for requireAuth, optionalAuth, requireTier, and requireQuota
 */

// Mock dependencies before requiring the module
jest.mock('../../../utils/firestore', () => ({
  getUser: jest.fn(),
  getUserByDeviceId: jest.fn(),
  getDeviceUserWithoutFirebase: jest.fn(),
  getUserByLegacyId: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  linkFirebaseUid: jest.fn(),
  isAvailable: jest.fn().mockReturnValue(true),
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

const firestore = require('../../../utils/firestore');
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
    firestore.isAvailable.mockReturnValue(true);
  });

  describe('requireAuth', () => {
    describe('authentication methods', () => {
      it('should authenticate with valid Bearer token', async () => {
        const req = createMockReq({ authorization: 'Bearer valid-token' });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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

        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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

        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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

        firestore.getUser.mockResolvedValue(null);
        firestore.getUserByDeviceId.mockResolvedValue({
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
        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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

        firestore.getUser
          .mockResolvedValueOnce(null) // First lookup - not found
          .mockResolvedValueOnce(newUser); // After create
        firestore.getUserByDeviceId.mockResolvedValue(null);
        firestore.getUserByLegacyId.mockResolvedValue(null);

        await requireAuth(req, res, next);

        expect(firestore.createUser).toHaveBeenCalledWith(
          'new-firebase-uid',
          expect.objectContaining({ firebase_uid: 'new-firebase-uid', tier: 'trial' })
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
          id: 'new-firebase-uid',
          firebase_uid: 'new-firebase-uid',
          device_id: 'existing-device-id',
          tier: 'pro',
        };

        firestore.getUser
          .mockResolvedValueOnce(null) // No Firebase user
          .mockResolvedValueOnce(migratedUser); // After migration
        firestore.getDeviceUserWithoutFirebase.mockResolvedValue({
          id: 'device:existing-device-id',
          device_id: 'existing-device-id',
          firebase_uid: null,
          tier: 'pro',
        });

        await requireAuth(req, res, next);

        expect(firestore.linkFirebaseUid).toHaveBeenCalledWith(
          'device:existing-device-id',
          'new-firebase-uid'
        );
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Migrated device user')
        );
        expect(next).toHaveBeenCalled();
      });

      it('should lookup by device_id', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.getUserByDeviceId.mockResolvedValue({
          id: 'device-123',
          device_id: 'device-123',
          tier: 'trial',
        });

        await requireAuth(req, res, next);

        expect(firestore.getUserByDeviceId).toHaveBeenCalledWith('device-123');
        expect(next).toHaveBeenCalled();
      });
    });

    describe('subscription/trial expiration', () => {
      it('should expire subscription when past expiration date', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        const user = {
          id: 'firebase-uid',
          firebase_uid: 'firebase-uid',
          tier: 'pro',
          subscription_expires_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        };

        firestore.getUser.mockResolvedValue(user);

        await requireAuth(req, res, next);

        expect(firestore.updateUser).toHaveBeenCalledWith(
          'firebase-uid',
          expect.objectContaining({ tier: 'expired' })
        );
        expect(req.user.tier).toBe('expired');
        expect(next).toHaveBeenCalled();
      });

      it('should expire trial when past trial end date', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        const user = {
          id: 'firebase-uid',
          firebase_uid: 'firebase-uid',
          tier: 'trial',
          trial_ends_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        };

        firestore.getUser.mockResolvedValue(user);

        await requireAuth(req, res, next);

        expect(firestore.updateUser).toHaveBeenCalledWith(
          'firebase-uid',
          expect.objectContaining({ tier: 'expired' })
        );
        expect(req.user.tier).toBe('expired');
        expect(next).toHaveBeenCalled();
      });

      it('should not expire active subscription', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid',
          firebase_uid: 'firebase-uid',
          tier: 'pro',
          subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 days from now
        });

        await requireAuth(req, res, next);

        expect(req.user.tier).toBe('pro');
        expect(next).toHaveBeenCalled();
      });
    });

    describe('Firestore not available', () => {
      it('should allow request with default trial user when Firestore not available', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.isAvailable.mockReturnValue(false);

        await requireAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.tier).toBe('trial');
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Firestore not available')
        );
        expect(next).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should return 500 on unexpected error', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.getUser.mockRejectedValue(new Error('Firestore error'));

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
        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
          firebase_uid: 'firebase-uid-123',
          tier: 'pro',
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.firebaseUid).toBe('firebase-uid-123');
        expect(req.user.verifiedByToken).toBe(true);
        expect(next).toHaveBeenCalled();
      });

      it('should set basic user info when token valid but user not in Firestore', async () => {
        const req = createMockReq({ authorization: 'Bearer valid-token' });
        const res = createMockRes();
        const next = jest.fn();

        verifyIdToken.mockResolvedValue({ uid: 'firebase-uid-123' });
        firestore.getUser.mockResolvedValue(null); // User not found

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
        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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

        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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

        firestore.getUser.mockResolvedValue(null);
        firestore.getUserByDeviceId.mockResolvedValue({
          id: 'device-123',
          device_id: 'device-123',
          tier: 'trial',
        });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.deviceId).toBe('device-123');
        expect(next).toHaveBeenCalled();
      });

      it('should lookup device by legacy id as fallback', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.getUser.mockResolvedValue(null);
        firestore.getUserByDeviceId.mockResolvedValue(null);
        firestore.getUserByLegacyId.mockResolvedValue({ id: 'device-123', tier: 'trial' });

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(next).toHaveBeenCalled();
      });
    });

    describe('Firestore not available', () => {
      it('should set basic user info when Firestore not available', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.isAvailable.mockReturnValue(false);

        await optionalAuth(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.id).toBe('firebase-uid-123');
        expect(req.user.tier).toBe('trial');
        expect(next).toHaveBeenCalled();
      });

      it('should use device ID when Firebase UID not available and Firestore not available', async () => {
        const req = createMockReq({ 'x-device-id': 'device-123' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.isAvailable.mockReturnValue(false);

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

        firestore.getUser.mockRejectedValue(new Error('Firestore error'));

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
      it('should include all expected fields from Firestore user', async () => {
        const req = createMockReq({ 'x-firebase-uid': 'firebase-uid-123' });
        const res = createMockRes();
        const next = jest.fn();

        firestore.getUser.mockResolvedValue({
          id: 'firebase-uid-123',
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
          internalId: 'firebase-uid-123',
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
    it('should return 401 if no user', async () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      const res = createMockRes();
      const next = jest.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if BYOK not allowed for tier', async () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({}, { userApiKey: 'user-api-key' });
      req.user = { id: 'user-123', tier: 'trial' };
      const res = createMockRes();
      const next = jest.fn();

      isByokAllowed.mockReturnValue(false);

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.error).toContain('BYOK');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 429 if quota exceeded', async () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      req.user = { id: 'user-123', tier: 'trial' };
      const res = createMockRes();
      const next = jest.fn();

      usageTracker.checkQuota.mockResolvedValue({
        allowed: false,
        limit: 5,
        remaining: 0,
        resetDate: '2024-02-01T00:00:00Z',
      });

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.jsonData.error).toContain('quota exceeded');
      expect(res.jsonData.quota).toBeDefined();
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 429 with upgrade message if limit is 0', async () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      req.user = { id: 'user-123', tier: 'expired' };
      const res = createMockRes();
      const next = jest.fn();

      usageTracker.checkQuota.mockResolvedValue({
        allowed: false,
        limit: 0,
        remaining: 0,
      });

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.jsonData.error).toContain('Upgrade to Pro');
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow request if quota available', async () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({});
      req.user = { id: 'user-123', tier: 'pro' };
      const res = createMockRes();
      const next = jest.fn();

      usageTracker.checkQuota.mockResolvedValue({
        allowed: true,
        limit: 50,
        remaining: 45,
      });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.quota).toBeDefined();
      expect(req.quota.remaining).toBe(45);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set isByok flag on request', async () => {
      const middleware = requireQuota('crate_builder');
      const req = createMockReq({}, { userApiKey: 'user-api-key' });
      req.user = { id: 'user-123', tier: 'pro' };
      const res = createMockRes();
      const next = jest.fn();

      isByokAllowed.mockReturnValue(true);
      usageTracker.checkQuota.mockResolvedValue({
        allowed: true,
        limit: 50,
        remaining: 45,
      });

      await middleware(req, res, next);

      expect(req.isByok).toBe(true);
      expect(next).toHaveBeenCalled();
    });
  });
});
