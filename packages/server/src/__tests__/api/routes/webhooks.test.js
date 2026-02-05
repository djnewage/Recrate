/**
 * Webhook Routes Tests
 * Tests for RevenueCat webhook handling
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

const db = require('../../../utils/db');
const logger = require('../../../utils/logger');
const createWebhookRoutes = require('../../../api/routes/webhooks');

describe('Webhook Routes', () => {
  let app;
  let router;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment variables
    delete process.env.REVENUECAT_WEBHOOK_AUTH_KEY;

    // Create fresh router and app for each test
    router = createWebhookRoutes();
    app = express();
    app.use('/api/webhooks', router);
  });

  describe('POST /api/webhooks/revenuecat', () => {
    const validAuthKey = 'test-webhook-auth-key';

    beforeEach(() => {
      process.env.REVENUECAT_WEBHOOK_AUTH_KEY = validAuthKey;
    });

    describe('Authorization', () => {
      it('should reject requests with missing Authorization header', async () => {
        const request = require('http').request;
        const { createServer } = require('http');

        // Use supertest-like approach
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
                req.write(options.body);
              }
              req.end();
            });
          });
        };

        const response = await makeRequest(app, 'POST', '/api/webhooks/revenuecat', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: { type: 'TEST' } }),
        });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Unauthorized');
      });

      it('should reject requests with invalid Authorization header', async () => {
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
                req.write(options.body);
              }
              req.end();
            });
          });
        };

        const response = await makeRequest(app, 'POST', '/api/webhooks/revenuecat', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer wrong-key',
          },
          body: JSON.stringify({ event: { type: 'TEST' } }),
        });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Unauthorized');
      });

      it('should accept requests with valid Authorization header', async () => {
        // Mock db.get to return an existing user
        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-123',
          tier: 'trial',
        });

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
                req.write(options.body);
              }
              req.end();
            });
          });
        };

        const response = await makeRequest(app, 'POST', '/api/webhooks/revenuecat', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthKey}`,
          },
          body: JSON.stringify({
            event: {
              type: 'INITIAL_PURCHASE',
              app_user_id: 'firebase-123',
              product_id: 'pro_monthly',
              expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
              purchased_at_ms: Date.now(),
              transaction_id: 'txn-123',
            },
          }),
        });

        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
      });

      it('should return 200 with error when webhook auth key is not configured', async () => {
        delete process.env.REVENUECAT_WEBHOOK_AUTH_KEY;

        // Need to recreate router after changing env
        router = createWebhookRoutes();
        app = express();
        app.use('/api/webhooks', router);

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
                req.write(options.body);
              }
              req.end();
            });
          });
        };

        const response = await makeRequest(app, 'POST', '/api/webhooks/revenuecat', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: { type: 'TEST' } }),
        });

        expect(response.status).toBe(200);
        expect(response.body.error).toBe('Webhook not configured');
        expect(logger.error).toHaveBeenCalledWith(
          '[Webhook] REVENUECAT_WEBHOOK_AUTH_KEY not configured'
        );
      });
    });

    describe('Event Handling', () => {
      const makeAuthenticatedRequest = (app, payload) => {
        return new Promise((resolve) => {
          const server = app.listen(0, () => {
            const port = server.address().port;
            const req = require('http').request({
              hostname: 'localhost',
              port,
              path: '/api/webhooks/revenuecat',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${validAuthKey}`,
              },
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                server.close();
                resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
              });
            });
            req.write(JSON.stringify(payload));
            req.end();
          });
        });
      };

      beforeEach(() => {
        // Default: user exists
        db.get.mockReturnValue({
          id: 'user-123',
          firebase_uid: 'firebase-123',
          tier: 'trial',
        });
      });

      it('should handle INITIAL_PURCHASE event', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: 'firebase-123',
            product_id: 'pro_monthly',
            expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
            purchased_at_ms: Date.now(),
            transaction_id: 'txn-123',
          },
        });

        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
        expect(db.run).toHaveBeenCalled();
        expect(db.saveDatabase).toHaveBeenCalled();
        expect(logger.success).toHaveBeenCalledWith(
          expect.stringContaining('subscription activated')
        );
      });

      it('should handle RENEWAL event', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'RENEWAL',
            app_user_id: 'firebase-123',
            product_id: 'pro_monthly',
            expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
            purchased_at_ms: Date.now(),
            transaction_id: 'txn-456',
          },
        });

        expect(response.status).toBe(200);
        expect(db.run).toHaveBeenCalled();
        expect(db.saveDatabase).toHaveBeenCalled();
      });

      it('should handle CANCELLATION event', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'CANCELLATION',
            app_user_id: 'firebase-123',
            expiration_at_ms: Date.now() + 15 * 24 * 60 * 60 * 1000,
            cancellation_reason: 'CUSTOMER_SUPPORT',
          },
        });

        expect(response.status).toBe(200);
        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining('subscription_will_renew = 0'),
          expect.any(Array)
        );
        expect(db.saveDatabase).toHaveBeenCalled();
      });

      it('should handle EXPIRATION event', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'EXPIRATION',
            app_user_id: 'firebase-123',
          },
        });

        expect(response.status).toBe(200);
        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining("tier = 'expired'"),
          expect.any(Array)
        );
        expect(db.saveDatabase).toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('subscription expired')
        );
      });

      it('should handle BILLING_ISSUE event', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'BILLING_ISSUE',
            app_user_id: 'firebase-123',
            expiration_at_ms: Date.now() + 7 * 24 * 60 * 60 * 1000,
            grace_period_expires_at_ms: Date.now() + 3 * 24 * 60 * 60 * 1000,
          },
        });

        expect(response.status).toBe(200);
        expect(db.run).toHaveBeenCalled();
        expect(db.saveDatabase).toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('billing issue')
        );
      });

      it('should handle UNCANCELLATION event', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'UNCANCELLATION',
            app_user_id: 'firebase-123',
            expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
          },
        });

        expect(response.status).toBe(200);
        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining('subscription_will_renew = 1'),
          expect.any(Array)
        );
        expect(db.saveDatabase).toHaveBeenCalled();
      });

      it('should handle unknown event types gracefully', async () => {
        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'UNKNOWN_EVENT_TYPE',
            app_user_id: 'firebase-123',
          },
        });

        expect(response.status).toBe(200);
        expect(response.body.received).toBe(true);
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining('Unhandled event type: UNKNOWN_EVENT_TYPE')
        );
      });

      it('should return 400 when event is missing from payload', async () => {
        const response = await makeAuthenticatedRequest(app, {
          // No event property
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('No event in payload');
      });

      it('should create user if not found during INITIAL_PURCHASE', async () => {
        // First call: user not found
        // Second call: return the newly created user
        db.get
          .mockReturnValueOnce(null) // No user by firebase_uid
          .mockReturnValueOnce(null) // No user by legacy id
          .mockReturnValueOnce({ id: 'user-new', firebase_uid: 'firebase-123', tier: 'trial' });

        const response = await makeAuthenticatedRequest(app, {
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: 'firebase-123',
            product_id: 'pro_monthly',
            expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
            purchased_at_ms: Date.now(),
            transaction_id: 'txn-123',
          },
        });

        expect(response.status).toBe(200);
        // Should have created user
        expect(db.run).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO users'),
          expect.any(Array)
        );
      });
    });
  });

  describe('GET /api/webhooks/health', () => {
    it('should return configured: false when auth key not set', async () => {
      const makeRequest = (app, method, path) => {
        return new Promise((resolve) => {
          const server = app.listen(0, () => {
            const port = server.address().port;
            const req = require('http').request({
              hostname: 'localhost',
              port,
              path,
              method,
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                server.close();
                resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
              });
            });
            req.end();
          });
        });
      };

      const response = await makeRequest(app, 'GET', '/api/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.configured).toBe(false);
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return configured: true when auth key is set', async () => {
      process.env.REVENUECAT_WEBHOOK_AUTH_KEY = 'test-key';

      // Recreate router after setting env
      router = createWebhookRoutes();
      app = express();
      app.use('/api/webhooks', router);

      const makeRequest = (app, method, path) => {
        return new Promise((resolve) => {
          const server = app.listen(0, () => {
            const port = server.address().port;
            const req = require('http').request({
              hostname: 'localhost',
              port,
              path,
              method,
            }, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                server.close();
                resolve({ status: res.statusCode, body: JSON.parse(data || '{}') });
              });
            });
            req.end();
          });
        });
      };

      const response = await makeRequest(app, 'GET', '/api/webhooks/health');

      expect(response.status).toBe(200);
      expect(response.body.configured).toBe(true);
    });
  });
});
