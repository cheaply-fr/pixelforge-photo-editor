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

test('desktop placement is bottom-left above the status bar and lifts over the zoom control', () => {
  const banner = { width: 416, height: 150 };
  assert.deepEqual(consentBannerPlacement({ width: 1280, height: 720 }, banner, { left: 148, top: 98, right: 1006, bottom: 692 }, { left: 468, top: 642, right: 686, bottom: 676 }), { bottom: 40 });
  // A narrow window whose zoom control sits under the banner lifts it above.
  assert.deepEqual(consentBannerPlacement({ width: 900, height: 700 }, banner, undefined, { left: 300, top: 600, right: 520, bottom: 634 }), { bottom: 108 });
  // The landing page has no editor stage.
  assert.deepEqual(consentBannerPlacement({ width: 1440, height: 900 }, banner), { bottom: 40 });
});

test('phone placement sits at the top of the canvas stage, inside the viewport', () => {
  const banner = { width: 380, height: 180 };
  assert.deepEqual(consentBannerPlacement({ width: 412, height: 839 }, banner, { left: 0, top: 158, right: 412, bottom: 630 }), { top: 166 });
  assert.deepEqual(consentBannerPlacement({ width: 412, height: 300 }, banner, { left: 0, top: 250, right: 412, bottom: 300 }), { top: 104 });
  assert.deepEqual(consentBannerPlacement({ width: 412, height: 839 }, banner), { bottom: 16 });
});
