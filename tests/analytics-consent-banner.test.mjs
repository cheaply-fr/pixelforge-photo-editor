import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { CONSENT_BANNER_ID, consentBannerMarkup, consentBannerPlacement } from '../src/analyticsConsentBanner.ts';

test('the banner keeps its consent semantics, storage key and real styled buttons', async () => {
  const markup = consentBannerMarkup();
  assert.equal(CONSENT_BANNER_ID, 'cheaply-analytics-consent');
  assert.match(markup, /<button type="button" data-choice="deny">No thanks<\/button><button type="button" data-choice="accept">Allow<\/button>/);
  // The global reset strips button styles, so the banner scopes its own.
  assert.match(markup, /#cheaply-analytics-consent button\{[^}]*min-height:40px/);
  assert.match(markup, /#cheaply-analytics-consent \.cheaply-consent-actions\{[^}]*gap:10px/);
  assert.match(markup, /button\[data-choice="accept"\]\{[^}]*background:#172033;color:#fff/);
  assert.match(markup, /button:focus-visible\{outline:3px solid/);
  const analytics = await fs.readFile(new URL('../src/Analytics.tsx', import.meta.url), 'utf8');
  assert.match(analytics, /const CONSENT_KEY = 'cheaply\.analytics\.consent\.v1';/);
  const banner = await fs.readFile(new URL('../src/analyticsConsentBanner.ts', import.meta.url), 'utf8');
  assert.match(banner, /setAttribute\('role', 'region'\)/);
  assert.match(banner, /setAttribute\('aria-label', 'Analytics consent'\)/);
});

test('editor placement on wide screens is over the canvas area, clear of the toolbar, and lifts over the zoom control', () => {
  const banner = { width: 416, height: 144 };
  // 1440×900: toolbar 0–210, canvas area 210–1166 (98–872), sidebar 1166–1440.
  const area = { left: 210, top: 98, right: 1166, bottom: 872 };
  const zoom = { left: 579, top: 822, right: 797, bottom: 856 };
  assert.deepEqual(consentBannerPlacement({ width: 1440, height: 900 }, banner, zoom, area), { bottom: 86, left: 226, width: 416 });
  // Zoom control elsewhere: 16 px above the canvas area's bottom edge.
  assert.deepEqual(consentBannerPlacement({ width: 1440, height: 900 }, banner, { left: 900, top: 822, right: 1100, bottom: 856 }, area), { bottom: 44, left: 226, width: 416 });
  // A narrower canvas area narrows the banner to fit inside it.
  const narrow = consentBannerPlacement({ width: 760, height: 700 }, banner, undefined, { left: 124, top: 98, right: 525, bottom: 672 });
  assert.deepEqual(narrow, { bottom: 44, left: 140, width: 369 });
  assert.ok(narrow.left >= 124 && narrow.left + narrow.width <= 525);
  // Too narrow a canvas area: back to the window's bottom-left above the status bar.
  assert.deepEqual(consentBannerPlacement({ width: 700, height: 700 }, banner, undefined, { left: 124, top: 98, right: 400, bottom: 672 }), { bottom: 40 });
});

test('landing-page placement is bottom-left above the status bar and lifts over a zoom control', () => {
  const banner = { width: 416, height: 150 };
  assert.deepEqual(consentBannerPlacement({ width: 1440, height: 900 }, banner), { bottom: 40 });
  assert.deepEqual(consentBannerPlacement({ width: 900, height: 700 }, banner, { left: 300, top: 600, right: 520, bottom: 634 }), { bottom: 108 });
});

test('phone placement is a compact bar along the bottom that reserves room below the page end', () => {
  // The canvas area is ignored on phones: the bar spans the screen width.
  const area = { left: 108, top: 179, right: 412, bottom: 699 };
  assert.deepEqual(consentBannerPlacement({ width: 412, height: 839 }, { width: 396, height: 56 }, { left: 163, top: 649, right: 357, bottom: 683 }, area), { bottom: 8, reserve: 72 });
  // A zoom control that would sit under it lifts it.
  assert.deepEqual(consentBannerPlacement({ width: 412, height: 700 }, { width: 396, height: 124 }, { left: 100, top: 600, right: 330, bottom: 634 }), { bottom: 108, reserve: 140 });
});

test('phones get one row: the short message and the buttons, without the title', () => {
  const markup = consentBannerMarkup();
  assert.match(markup, /<span class="cheaply-consent-long">Allow anonymous usage statistics to improve PixelForge\. Your photos, projects, and file names never leave this device\.<\/span>/);
  assert.match(markup, /<span class="cheaply-consent-short">Allow anonymous usage stats\? Your photos stay on this device\.<\/span>/);
  const phone = markup.slice(markup.indexOf('@media (max-width:680px)'));
  assert.match(phone, /#cheaply-analytics-consent\{[^}]*display:flex;align-items:center/);
  assert.match(phone, /#cheaply-analytics-consent strong,#cheaply-analytics-consent \.cheaply-consent-long\{display:none\}/);
  assert.match(phone, /\.cheaply-consent-actions\{[^}]*flex-wrap:nowrap/);
  // Touch targets stay at least 40 × 80 px.
  assert.match(phone, /button\{min-width:80px/);
  assert.doesNotMatch(phone, /min-height:(?:[0-3]?\d)px/);
});

test('the banner stacks above the editor but below menus and flyouts', () => {
  assert.match(consentBannerMarkup(), /#cheaply-analytics-consent\{[^}]*z-index:30;/);
});
