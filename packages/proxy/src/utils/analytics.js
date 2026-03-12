/**
 * GA4 Measurement Protocol Analytics
 * Sends events server-side to Google Analytics 4 via the Measurement Protocol.
 * Events appear in the existing Firebase Analytics dashboard.
 */

const logger = require('./logger');

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID;
const API_SECRET = process.env.GA4_API_SECRET;

/**
 * Send an event to GA4 via the Measurement Protocol.
 * Fire-and-forget — errors are logged silently.
 *
 * @param {string} clientId - Unique user/device identifier (Firebase UID or deviceId)
 * @param {string} eventName - GA4 event name (e.g. 'proxy_request')
 * @param {Object} [params={}] - Event parameters
 * @param {string|null} [userId=null] - Optional user ID for GA4 user identity
 */
function trackEvent(clientId, eventName, params = {}, userId = null) {
  if (!MEASUREMENT_ID || !API_SECRET) return;
  if (!clientId || !eventName) return;

  const url = `${GA4_ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`;

  const body = {
    client_id: clientId,
    events: [{
      name: eventName,
      params: {
        session_id: String(Math.floor(Date.now() / 1000)),
        engagement_time_msec: '100',
        ...params,
      },
    }],
  };
  if (userId) body.user_id = userId;

  const jsonBody = JSON.stringify(body);

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonBody,
  }).catch((err) => {
    logger.error('[Analytics] Failed to send event:', err.message);
  });
}

module.exports = { trackEvent };
