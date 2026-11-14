import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test, expect, type Page } from '@playwright/test';

/*
 * The banner only appears in builds with a GA measurement id, which test
 * builds do not have, so these tests load the banner module itself into the
 * real editor and landing pages and check its look and placement there.
 */
const moduleSource = stripTypeScriptTypes(readFileSync(new URL('../../src/analyticsConsentBanner.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
const script = `(() => {${moduleSource}\nwindow.__consentBanner = { showConsentBanner, CONSENT_BANNER_ID };})();`;
const shots = process.env.CONSENT_BANNER_SHOTS;

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
});

async function showBanner(page: Page) {
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    const api = (window as unknown as { __consentBanner: { showConsentBanner: (choice: (value: string) => void) => () => void } }).__consentBanner;
    (window as unknown as { __choices: string[] }).__choices = [];
    api.showConsentBanner((value) => (window as unknown as { __choices: string[] }).__choices.push(value));
  });
  const banner = page.getByRole('region', { name: 'Analytics consent' });
  await expect(banner).toBeVisible();
  // Let the placement settle (it re-runs after the editor lays out).
  await page.waitForTimeout(200);
  return banner;
}

async function assertBannerLooksRight(page: Page) {
  const banner = page.getByRole('region', { name: 'Analytics consent' });
  const viewport = page.viewportSize()!;
  const box = (await banner.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const deny = banner.getByRole('button', { name: 'No thanks', exact: true });
  const allow = banner.getByRole('button', { name: 'Allow', exact: true });
  const denyBox = (await deny.boundingBox())!;
  const allowBox = (await allow.boundingBox())!;
  // Real, separated buttons with a comfortable touch size.
  for (const button of [denyBox, allowBox]) {
    expect(button.height).toBeGreaterThanOrEqual(40);
    expect(button.width).toBeGreaterThanOrEqual(80);
  }
  expect(allowBox.x - (denyBox.x + denyBox.width)).toBeGreaterThanOrEqual(8);
  const styles = await Promise.all([deny, allow].map((button) => button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderTopWidth };
  })));
  // "Allow" is the filled primary action; "No thanks" is outlined.
  expect(styles[1].background).toBe('rgb(23, 32, 51)');
  expect(styles[1].color).toBe('rgb(255, 255, 255)');
  expect(styles[0].background).toBe('rgb(255, 255, 255)');
  expect(styles[0].border).toBe('1px');
  // Keyboard focus is visible.
  await deny.focus();
  await page.keyboard.press('Tab');
  await expect(allow).toBeFocused();
  expect(await allow.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  return box;
}

for (const size of [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  undefined,
]) {
  test(`the consent banner stays clear of the zoom control in the editor ${size ? `at ${size.width}×${size.height}` : 'at the device size'}`, async ({ page }, info) => {
    if (size) {
      test.skip(info.project.name !== 'desktop', 'desktop window sizes');
      await page.setViewportSize(size);
    }
    await page.goto('/editor?new=1');
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    await showBanner(page);
    const box = await assertBannerLooksRight(page);
    const zoom = (await page.getByTestId('zoom-control').boundingBox())!;
    expect(intersects(box, zoom)).toBe(false);
    // The zoom-out button is reachable where it is drawn.
    const zoomOut = (await page.getByRole('button', { name: 'Zoom out', exact: true }).boundingBox())!;
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label'), [zoomOut.x + zoomOut.width / 2, zoomOut.y + zoomOut.height / 2])).toBe('Zoom out');
    if (info.project.name === 'mobile') {
      // Phones: at the top of the canvas, clear of the menus and the properties sheet.
      const menus = (await page.getByRole('navigation', { name: 'Editor menus' }).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(menus.y + menus.height);
      expect(box.y + box.height).toBeLessThan(zoom.y);
    }
    if (shots) await page.screenshot({ path: `${shots}/consent-editor-${info.project.name}-${size ? `${size.width}x${size.height}` : 'device'}.png` });
    // Choosing removes nothing by itself here (the app's handler does that),
    // but the click reaches the button and reports the choice.
    await page.getByRole('button', { name: 'Allow', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __choices: string[] }).__choices)).toEqual(['granted']);
  });
}

test('the consent banner is styled and inside the viewport on the landing page', async ({ page }, info) => {
  await page.goto('/');
  await showBanner(page);
  await assertBannerLooksRight(page);
  if (shots) await page.screenshot({ path: `${shots}/consent-landing-${info.project.name}.png` });
  await page.getByRole('button', { name: 'No thanks', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __choices: string[] }).__choices)).toEqual(['denied']);
});
