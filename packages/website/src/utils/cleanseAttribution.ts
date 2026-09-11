/**
 * Attribution + device helpers for the Cleanse landing page.
 *
 * ~90% of paid traffic to /cleanse arrives on a phone (Instagram in-app
 * browser) and cannot install a desktop app. We detect that case so the page
 * can offer "email me the link" instead of a dead-end download button, and we
 * capture UTM parameters so leads and downloads can be traced back to the ad.
 */

export type UtmParams = Partial<
  Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term', string>
>;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const STORAGE_KEY = 'cleanse_utm';

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPod|Android/i.test(ua)) return true;
  if (/iPad/i.test(ua)) return true;
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function getDevicePlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPhone|iPod/i.test(ua)) return 'ios';
  if (/iPad/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ipados';
  if (/Android/i.test(ua)) return 'android';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh/i.test(ua)) return 'mac';
  return 'other';
}

/**
 * Read UTM params from the current URL and remember them for the session, so
 * a lead submitted after scrolling (or after a same-tab navigation) still
 * carries the ad attribution it arrived with.
 */
export function captureUtm(): UtmParams {
  if (typeof window === 'undefined') return {};
  const fromUrl: UtmParams = {};
  const params = new URLSearchParams(window.location.search);
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) fromUrl[key] = v.slice(0, 200);
  }
  // Meta appends fbclid to every ad click even when no UTMs are configured.
  if (!fromUrl.utm_source && params.get('fbclid')) fromUrl.utm_source = 'meta';

  try {
    if (Object.keys(fromUrl).length > 0) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as UtmParams) : {};
  } catch {
    return fromUrl;
  }
}

/** Drop undefined values so the params can be sent as pixel custom data. */
export function utmForTracking(utm: UtmParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(utm)) if (v) out[k] = v;
  return out;
}
