/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    fbq?: (...args: any[]) => void;
    _fbq?: (...args: any[]) => void;
  }
}

export type MetaPixelEvent =
  | 'PageView'
  | 'ViewContent'
  | 'InitiateCheckout'
  | 'Lead'
  | 'Subscribe';

let initialized = false;
let sdkReady = false;
const pendingEvents: Array<[MetaPixelEvent, Record<string, string | number>?]> = [];

/**
 * Initialize the Meta Pixel and fire the initial PageView.
 * Only runs in production when VITE_META_PIXEL_ID is set.
 *
 * Sets up a minimal queue function for init + PageView (which
 * fbevents.js drains on load), then uses the script onload callback
 * to know when the SDK is ready for direct calls. This avoids
 * callMethod dispatch which SES lockdown (MetaMask) breaks.
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

  if (!window.fbq) {
    // Minimal queue for fbevents.js to find and drain on load.
    const q: any = function (...args: any[]) {
      q.queue.push(args);
    };
    q.queue = [] as any[];
    q.push = q;
    q.loaded = true;
    q.version = '2.0';
    window.fbq = q;
    if (!window._fbq) window._fbq = q;
  }

  // Queue init + PageView — fbevents.js drains these on load
  window.fbq!('init', pixelId);
  window.fbq!('track', 'PageView');

  // Load fbevents.js via <script src> (no inline script, avoids SES)
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  s.addEventListener('load', () => {
    sdkReady = true;
    // Drain events that were queued while the SDK was loading
    for (const [eventName, params] of pendingEvents) {
      if (typeof window.fbq === 'function') {
        window.fbq('track', eventName, params);
      }
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
 * Track a Meta Pixel standard event. Queues events until the SDK
 * is loaded, then calls it directly. Fails silently if not initialized.
 */
export function trackEvent(
  eventName: MetaPixelEvent,
  params?: Record<string, string | number>,
): void {
  if (!initialized) return;

  if (sdkReady && typeof window.fbq === 'function') {
    window.fbq('track', eventName, params);
  } else {
    pendingEvents.push([eventName, params]);
  }
}
