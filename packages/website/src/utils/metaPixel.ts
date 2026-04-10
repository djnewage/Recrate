/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
  }
}

export type MetaPixelEvent =
  | 'PageView'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'Lead'
  | 'Subscribe';

let initialized = false;
let fbqReady = false;
const pendingEvents: Array<[MetaPixelEvent, Record<string, string | number>?]> = [];

/**
 * Initialize the Meta Pixel and fire the initial PageView.
 * Only runs in production when VITE_META_PIXEL_ID is set.
 *
 * Loads fbevents.js via <script src> (no inline scripts) to avoid
 * SES lockdown from browser extensions blocking textContent scripts.
 */
export function initMetaPixel(): void {
  if (initialized) return;

  const pixelId = import.meta.env.VITE_META_PIXEL_ID;
  if (!pixelId) {
    console.log('[MetaPixel] No Pixel ID configured, skipping initialization');
    return;
  }

  if (!import.meta.env.PROD) {
    console.log('[MetaPixel] Skipping in non-production environment');
    return;
  }

  initialized = true;

  // Load fbevents.js — the SDK sets up window.fbq itself.
  // No inline script or queue function reconstruction needed.
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  s.addEventListener('load', () => {
    if (typeof window.fbq !== 'function') return;

    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
    fbqReady = true;

    // Drain any events that were queued before the SDK loaded
    for (const [eventName, params] of pendingEvents) {
      window.fbq('track', eventName, params);
    }
    pendingEvents.length = 0;
  });
  document.head.appendChild(s);

  // <noscript> fallback img
  const noscript = document.createElement('noscript');
  const img = document.createElement('img');
  img.height = 1;
  img.width = 1;
  img.style.display = 'none';
  img.src = 'https://www.facebook.com/tr?id=' + pixelId + '&ev=PageView&noscript=1';
  noscript.appendChild(img);
  document.body.appendChild(noscript);
}

/**
 * Track a Meta Pixel standard event. If the SDK hasn't loaded yet,
 * queues the event to be sent once it's ready. Fails silently if
 * the pixel is not configured (dev environment, ad blocker, etc.).
 */
export function trackEvent(
  eventName: MetaPixelEvent,
  params?: Record<string, string | number>,
): void {
  if (!initialized) return;

  if (fbqReady && typeof window.fbq === 'function') {
    window.fbq('track', eventName, params);
  } else {
    pendingEvents.push([eventName, params]);
  }
}
