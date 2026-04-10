declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
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
 * Initialize the Meta Pixel base snippet and fire the initial PageView.
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

  // Meta Pixel base snippet (standard init code from Meta)
  const f = window;
  const b = document;
  const n = 'script';

  if (f.fbq) return;

  const q: (...args: unknown[]) => void = function (...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q as any).queue.push(args);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (q as any).queue = [] as unknown[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (q as any).loaded = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (q as any).version = '2.0';
  f.fbq = q;

  const s = b.createElement(n);
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const firstScript = b.getElementsByTagName(n)[0];
  firstScript?.parentNode?.insertBefore(s, firstScript);

  window.fbq!('init', pixelId);
  window.fbq!('track', 'PageView');

  // Inject <noscript> fallback img for Meta's validation tools
  const noscript = document.createElement('noscript');
  const img = document.createElement('img');
  img.height = 1;
  img.width = 1;
  img.style.display = 'none';
  img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
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
