/**
 * The non-modal analytics consent banner. Its markup carries its own scoped
 * styles because the app's global reset strips button styling, and it is
 * placed so it never covers the editor's zoom control: bottom-left above the
 * status bar on wide screens, at the top of the canvas stage on phones (where
 * the bottom of the screen holds the properties sheet).
 */
export const CONSENT_BANNER_ID = 'cheaply-analytics-consent';
/** Viewports at or below this width use the phone placement. */
export const CONSENT_BANNER_PHONE_WIDTH = 680;
const MARGIN = 16;
/** Room for the editor's 28 px status bar below the banner. */
const STATUS_BAR = 40;

const css = `#${CONSENT_BANNER_ID}{position:fixed;left:${MARGIN}px;bottom:${STATUS_BAR}px;z-index:1000;box-sizing:border-box;width:min(26rem,calc(100vw - ${MARGIN * 2}px));margin:0;padding:14px 16px;border:1px solid #d8dee8;border-radius:12px;background:#fff;color:#172033;box-shadow:0 10px 30px #17203333;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;pointer-events:none}
#${CONSENT_BANNER_ID} strong{display:block;margin:0 0 4px;font-size:14px;font-weight:700}
#${CONSENT_BANNER_ID} p{margin:0 0 12px;font-size:13px}
#${CONSENT_BANNER_ID} .cheaply-consent-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}
#${CONSENT_BANNER_ID} button{box-sizing:border-box;min-width:104px;min-height:40px;margin:0;padding:0 18px;border-radius:8px;font:600 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;pointer-events:auto}
#${CONSENT_BANNER_ID} button[data-choice="deny"]{border:1px solid #8b95a7;background:#fff;color:#172033}
#${CONSENT_BANNER_ID} button[data-choice="deny"]:hover{background:#f1f3f7}
#${CONSENT_BANNER_ID} button[data-choice="accept"]{border:1px solid #172033;background:#172033;color:#fff}
#${CONSENT_BANNER_ID} button[data-choice="accept"]:hover{background:#2b3752}
#${CONSENT_BANNER_ID} button:focus-visible{outline:3px solid #2f6fed;outline-offset:2px}`;

/** Inner markup of the banner `aside`, scoped styles included. */
export function consentBannerMarkup(): string {
  return `<style>${css}</style><strong>Help improve Cheaply Photo Editor</strong><p>Allow anonymous usage statistics to improve PixelForge. Your photos, projects, and file names never leave this device.</p><div class="cheaply-consent-actions"><button type="button" data-choice="deny">No thanks</button><button type="button" data-choice="accept">Allow</button></div>`;
}

type Box = { left: number; top: number; right: number; bottom: number };
export type ConsentBannerPlacement = { top?: number; bottom?: number };

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where the banner goes. `stage` is the editor's canvas area and `avoid` its
 * zoom control (both absent on the landing page). Pure.
 */
export function consentBannerPlacement(
  viewport: { width: number; height: number },
  banner: { width: number; height: number },
  stage?: Box,
  avoid?: Box,
): ConsentBannerPlacement {
  if (viewport.width <= CONSENT_BANNER_PHONE_WIDTH && stage)
    return { top: Math.max(MARGIN, Math.min(stage.top + 8, viewport.height - banner.height - MARGIN)) };
  const bottom = viewport.width <= CONSENT_BANNER_PHONE_WIDTH ? MARGIN : STATUS_BAR;
  const box = { left: MARGIN, right: MARGIN + banner.width, bottom: viewport.height - bottom, top: viewport.height - bottom - banner.height };
  if (avoid && overlaps(box, avoid)) return { bottom: Math.max(bottom, viewport.height - avoid.top + 8) };
  return { bottom };
}

/** Apply `consentBannerPlacement` to the live banner. Browser only. */
export function placeConsentBanner(banner: HTMLElement): void {
  const rectOf = (selector: string): Box | undefined => {
    const element = document.querySelector(selector);
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    return rect.width && rect.height ? rect : undefined;
  };
  const size = banner.getBoundingClientRect();
  const placed = consentBannerPlacement(
    { width: window.innerWidth, height: window.innerHeight },
    { width: size.width, height: size.height },
    rectOf('.stage-shell'),
    rectOf('[data-testid="zoom-control"]'),
  );
  banner.style.top = placed.top === undefined ? 'auto' : `${placed.top}px`;
  banner.style.bottom = placed.bottom === undefined ? 'auto' : `${placed.bottom}px`;
}

/**
 * Create, place and keep placing the banner while it is shown (the editor
 * mounts after the banner and its layout changes with the viewport). The
 * returned function stops the placement updates.
 */
export function showConsentBanner(onChoice: (choice: 'granted' | 'denied') => void): () => void {
  const banner = document.createElement('aside');
  banner.id = CONSENT_BANNER_ID;
  // This is a non-modal informational region. A generic dialog role would
  // collide with the editor's real dialogs and confuse assistive technology.
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Analytics consent');
  banner.innerHTML = consentBannerMarkup();
  banner.querySelector('[data-choice="deny"]')?.addEventListener('click', () => onChoice('denied'));
  banner.querySelector('[data-choice="accept"]')?.addEventListener('click', () => onChoice('granted'));
  document.body.append(banner);
  const place = () => {
    if (banner.isConnected) placeConsentBanner(banner);
  };
  place();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : undefined;
  observer?.observe(document.body);
  window.addEventListener('resize', place);
  const timers = [100, 500, 1500, 4000].map((delay) => window.setTimeout(place, delay));
  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', place);
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}
