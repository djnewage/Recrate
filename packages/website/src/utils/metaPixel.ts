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

/**
 * Initialize the Meta Pixel and fire the initial PageView.
 * Only runs in production when VITE_META_PIXEL_ID is set.
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

  if (window.fbq) return;

  // Set up the fbq queue function directly in this module's scope.
  // Equivalent to Meta's standard snippet but avoids inline script
  // injection which failed under Vite's bundler.
  // Using function() (not arrow) to preserve the arguments keyword.
  const n: any = function () {
    if (n.callMethod) {
      n.callMethod.apply(n, arguments);
    } else {
      n.queue.push(arguments);
    }
  };
  n.queue = [];
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  window.fbq = n;
  if (!window._fbq) window._fbq = n;

  // Load fbevents.js
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const first = document.getElementsByTagName('script')[0];
  if (first?.parentNode) {
    first.parentNode.insertBefore(s, first);
  } else {
    document.head.appendChild(s);
  }

  // Init pixel and fire PageView
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');

  // Inject <noscript> fallback img
  const noscript = document.createElement('noscript');
  const img = document.createElement('img');
  img.height = 1;
  img.width = 1;
  img.style.display = 'none';
  img.src = 'https://www.facebook.com/tr?id=' + pixelId + '&ev=PageView&noscript=1';
  noscript.appendChild(img);
  document.body.appendChild(noscript);

  initialized = true;
  console.log('[MetaPixel] Initialized');
}

/**
 * Track a Meta Pixel standard event. Fails silently if the pixel
 * is not loaded (dev environment, ad blocker, etc.).
 */
export function trackEvent(
  eventName: MetaPixelEvent,
  params?: Record<string, string | number>,
): void {
  if (typeof window.fbq !== 'function') return;
  window.fbq('track', eventName, params);
}
