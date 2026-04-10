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

  // Inject the standard Meta Pixel base snippet verbatim
  const script = document.createElement('script');
  script.textContent = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init','${pixelId}');
    fbq('track','PageView');
  `;
  document.head.appendChild(script);

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
