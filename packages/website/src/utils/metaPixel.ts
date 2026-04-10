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

let pixelIdValue: string | null = null;

/**
 * Initialize the Meta Pixel and fire the initial PageView.
 * Only runs in production when VITE_META_PIXEL_ID is set.
 *
 * Uses a queue function for init + PageView (fbevents.js drains
 * these on load). All subsequent events are sent via direct image
 * beacons to facebook.com/tr, bypassing the SDK's callMethod
 * dispatch which SES lockdown (MetaMask) breaks.
 */
export function initMetaPixel(): void {
  if (pixelIdValue) return;

  const pixelId = import.meta.env.VITE_META_PIXEL_ID;
  if (!pixelId) {
    console.log('[MetaPixel] No Pixel ID configured, skipping initialization');
    return;
  }

  if (!import.meta.env.PROD) {
    console.log('[MetaPixel] Skipping in non-production environment');
    return;
  }

  pixelIdValue = pixelId;

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
 * Track a Meta Pixel event via direct image beacon to facebook.com/tr.
 * This bypasses the fbq SDK entirely, avoiding SES lockdown issues
 * that prevent callMethod from working on the queue function.
 */
export function trackEvent(
  eventName: MetaPixelEvent,
  params?: Record<string, string | number>,
): void {
  if (!pixelIdValue) return;

  // Build the tracking URL with custom data parameters
  let url = 'https://www.facebook.com/tr?id=' + pixelIdValue + '&ev=' + encodeURIComponent(eventName);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url += '&cd[' + encodeURIComponent(key) + ']=' + encodeURIComponent(String(value));
    }
  }

  // Send via image beacon — same mechanism as the noscript fallback
  const img = new Image(1, 1);
  img.src = url;
}
