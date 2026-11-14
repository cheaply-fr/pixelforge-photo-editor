/**
 * The non-modal analytics consent banner. Its markup carries its own scoped
 * styles because the app's global reset strips button styling, and it is
 * placed so it covers no tool button and never the zoom control: in the
 * editor on wide screens it sits over the canvas area (right of the toolbar,
 * left of the properties sidebar), at its bottom-left and lifted above the
 * zoom control when they would meet; on the landing page, bottom-left. On
 * phones it is one compact row along the bottom (short message, then the
 * buttons) that leaves the properties sheet handle above it, and the page
 * gains room below its end so its last content can scroll clear of it.
 * It sits above the editor's own surfaces (z-index 30) but below menus,
 * flyouts and popovers, so they are never covered by it.
 */
export const CONSENT_BANNER_ID = 'cheaply-analytics-consent';
/** Viewports at or below this width use the phone placement. */
export const CONSENT_BANNER_PHONE_WIDTH = 680;
/** The banner's width on wide screens (26rem). */
export const CONSENT_BANNER_WIDTH = 416;
/** Narrowest fit over the canvas area; a narrower one falls back to the window's bottom-left. */
const MIN_AREA_WIDTH = 260;
const MARGIN = 16;
/** Gap to the screen edges on phones. */
const PHONE_MARGIN = 8;
/** Room for the editor's 28 px status bar below the banner. */
const STATUS_BAR = 40;

const css = `#${CONSENT_BANNER_ID}{position:fixed;left:${MARGIN}px;bottom:${STATUS_BAR}px;z-index:30;box-sizing:border-box;width:min(${CONSENT_BANNER_WIDTH}px,calc(100vw - ${MARGIN * 2}px));margin:0;padding:14px 16px;border:1px solid #d8dee8;border-radius:12px;background:#fff;color:#172033;box-shadow:0 10px 30px #17203333;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:left;pointer-events:none}
#${CONSENT_BANNER_ID} strong{display:block;margin:0 0 4px;font-size:14px;font-weight:700}
#${CONSENT_BANNER_ID} p{margin:0 0 12px;font-size:13px}
#${CONSENT_BANNER_ID} .cheaply-consent-short{display:none}
#${CONSENT_BANNER_ID} .cheaply-consent-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}
#${CONSENT_BANNER_ID} button{box-sizing:border-box;min-width:104px;min-height:40px;margin:0;padding:0 18px;border-radius:8px;font:600 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;pointer-events:auto}
#${CONSENT_BANNER_ID} button[data-choice="deny"]{border:1px solid #8b95a7;background:#fff;color:#172033}
#${CONSENT_BANNER_ID} button[data-choice="deny"]:hover{background:#f1f3f7}
#${CONSENT_BANNER_ID} button[data-choice="accept"]{border:1px solid #172033;background:#172033;color:#fff}
#${CONSENT_BANNER_ID} button[data-choice="accept"]:hover{background:#2b3752}
#${CONSENT_BANNER_ID} button:focus-visible{outline:3px solid #2f6fed;outline-offset:2px}
@media (max-width:${CONSENT_BANNER_PHONE_WIDTH}px){#${CONSENT_BANNER_ID}{left:${PHONE_MARGIN}px;width:calc(100vw - ${PHONE_MARGIN * 2}px);display:flex;align-items:center;gap:10px;padding:7px 8px 7px 12px;font-size:12px;line-height:1.3}#${CONSENT_BANNER_ID} strong,#${CONSENT_BANNER_ID} .cheaply-consent-long{display:none}#${CONSENT_BANNER_ID} .cheaply-consent-short{display:inline}#${CONSENT_BANNER_ID} p{flex:1 1 0;min-width:0;margin:0;font-size:12px}#${CONSENT_BANNER_ID} .cheaply-consent-actions{flex:none;flex-wrap:nowrap;gap:8px}#${CONSENT_BANNER_ID} button{min-width:80px;padding:0 12px}}`;

/**
 * Inner markup of the banner `aside`, scoped styles included. Phones show
 * only the short message (the title and the long message are hidden there).
 */
export function consentBannerMarkup(): string {
  return `<style>${css}</style><strong>Help improve Cheaply Photo Editor</strong><p><span class="cheaply-consent-long">Allow anonymous usage statistics to improve PixelForge. Your photos, projects, and file names never leave this device.</span><span class="cheaply-consent-short">Allow anonymous usage stats? Your photos stay on this device.</span></p><div class="cheaply-consent-actions"><button type="button" data-choice="deny">No thanks</button><button type="button" data-choice="accept">Allow</button></div>`;
}

type Box = { left: number; top: number; right: number; bottom: number };
/**
 * `bottom` is the distance from the viewport bottom. `left` and `width` are
 * set when the banner goes over the editor's canvas area (otherwise the
 * stylesheet's own left and width apply). `reserve` is, on phones, the room
 * the page needs below its end so its last content can scroll above it.
 */
export type ConsentBannerPlacement = { bottom: number; left?: number; width?: number; reserve?: number };

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where the banner goes. `avoid` is the editor's zoom control and `area` its
 * canvas area (both absent on the landing page); `banner.height` is the
 * banner's height at the width it will get. Pure.
 */
export function consentBannerPlacement(
  viewport: { width: number; height: number },
  banner: { width: number; height: number },
  avoid?: Box,
  area?: Box,
): ConsentBannerPlacement {
  const phone = viewport.width <= CONSENT_BANNER_PHONE_WIDTH;
  const reserve = phone ? { reserve: Math.ceil(banner.height) + PHONE_MARGIN * 2 } : {};
  const overArea = !phone && area !== undefined && area.right - area.left - MARGIN * 2 >= MIN_AREA_WIDTH ? area : undefined;
  const frame = overArea
    ? {
        left: Math.round(overArea.left + MARGIN),
        width: Math.min(CONSENT_BANNER_WIDTH, Math.floor(overArea.right - overArea.left - MARGIN * 2)),
        bottom: Math.max(STATUS_BAR, Math.round(viewport.height - overArea.bottom + MARGIN)),
      }
    : { left: phone ? PHONE_MARGIN : MARGIN, width: banner.width, bottom: phone ? PHONE_MARGIN : STATUS_BAR };
  const box = {
    left: frame.left,
    right: frame.left + frame.width,
    bottom: viewport.height - frame.bottom,
    top: viewport.height - frame.bottom - banner.height,
  };
  const bottom = avoid && overlaps(box, avoid) ? Math.max(frame.bottom, Math.round(viewport.height - avoid.top + 8)) : frame.bottom;
  return overArea ? { bottom, left: frame.left, width: frame.width, ...reserve } : { bottom, ...reserve };
}

/** Apply `consentBannerPlacement` to the live banner. Browser only. */
export function placeConsentBanner(banner: HTMLElement): void {
  const rectOf = (selector: string): Box | undefined => {
    const element = document.querySelector(selector);
    if (!element) return undefined;
    const rect = element.getBoundingClientRect();
    return rect.width && rect.height ? rect : undefined;
  };
  const measure = () => {
    const size = banner.getBoundingClientRect();
    return consentBannerPlacement(
      { width: window.innerWidth, height: window.innerHeight },
      { width: size.width, height: size.height },
      rectOf('[data-testid="zoom-control"]'),
      rectOf('.editor-shell .stage-shell'),
    );
  };
  const set = (property: 'left' | 'width', value?: number) => {
    const next = value === undefined ? '' : `${value}px`;
    if (banner.style[property] !== next) banner.style[property] = next;
  };
  let placed = measure();
  set('left', placed.left);
  set('width', placed.width);
  // The height follows the width, so measure again at the final width.
  placed = measure();
  banner.style.bottom = `${placed.bottom}px`;
  const reserve = placed.reserve ? `${placed.reserve}px` : '';
  if (document.body.style.paddingBottom !== reserve) document.body.style.paddingBottom = reserve;
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
    document.body.style.paddingBottom = '';
  };
}
