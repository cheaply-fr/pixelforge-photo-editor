import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/*
 * The banner only appears in builds with a GA measurement id (CI builds have
 * one, local builds usually not), so these tests load the banner module
 * itself into the real editor and landing pages, replacing the app's own
 * banner when there is one, and check its look and placement there. The
 * module is compiled with Vite's own TypeScript transform, so the test does
 * not depend on the Node version's type stripping.
 */
let script = '';
// No stored choice here (playwright.config.ts stores one for other specs), so
// a build with a GA id shows the app's own banner too.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(async () => {
  const { transformWithOxc } = await import('vite');
  const source = readFileSync(new URL('../../src/analyticsConsentBanner.ts', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source, 'analyticsConsentBanner.ts', { lang: 'ts' });
  script = `(() => {${code.replace(/^export /gm, '')}
window.__consentBanner = { showConsentBanner, CONSENT_BANNER_ID };})();`;
});
const shots = process.env.CONSENT_BANNER_SHOTS;

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
});

async function showBanner(page: Page) {
  // A build with a GA id shows the app's own banner; this test shows its own.
  await page.evaluate(() => document.getElementById('cheaply-analytics-consent')?.remove());
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
    // Menus open above the banner: every File menu item is hit where it is drawn.
    await page.getByRole('navigation', { name: 'Editor menus' }).getByRole('button', { name: 'File', exact: true }).click();
    const hidden = await page.getByRole('menu', { name: 'File menu' }).evaluate((menu) =>
      [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((item) => {
        item.scrollIntoView({ block: 'nearest' });
        const rect = item.getBoundingClientRect();
        return !item.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      }).map((item) => item.textContent));
    expect(hidden).toEqual([]);
    await page.keyboard.press('Escape');
    const hitAt = (selector: string, rect: Box) =>
      page.evaluate(([css, x, y]) => !!document.elementFromPoint(x as number, y as number)?.closest(css as string), [selector, rect.x + rect.width / 2, rect.y + rect.height / 2]);
    if (info.project.name === 'desktop') {
      // Wide screens: over the canvas area, covering no tool button and not
      // the properties sidebar.
      const area = (await page.locator('.stage-shell').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(area.x);
      expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width);
      expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height);
      expect(intersects(box, (await page.locator('.toolbar').boundingBox())!)).toBe(false);
      expect(intersects(box, (await page.locator('.inspector').boundingBox())!)).toBe(false);
      for (const name of ['Brush', 'Gradient', 'Eraser']) {
        const tool = page.locator('.toolbar').getByRole('button', { name: `${name} tool`, exact: true });
        const toolBox = await tool.boundingBox();
        expect(toolBox, name).not.toBeNull();
        if (toolBox!.y + toolBox!.height <= page.viewportSize()!.height) expect(await hitAt('.toolbar button', toolBox!), name).toBe(true);
      }
    }
    if (info.project.name === 'mobile') {
      // Phones: one compact row along the bottom; the page gains room below
      // its end so its last content scrolls clear of the bar.
      expect(Math.round(box.y + box.height)).toBe(page.viewportSize()!.height - 8);
      expect(box.height).toBeLessThanOrEqual(64);
      // Only the short message shows; the buttons sit on its right.
      await expect(page.getByRole('region', { name: 'Analytics consent' }).getByText('Help improve Cheaply Photo Editor')).toBeHidden();
      await expect(page.getByRole('region', { name: 'Analytics consent' }).getByText('Allow anonymous usage stats? Your photos stay on this device.')).toBeVisible();
      // The properties sheet handle stays above it and takes taps.
      const handle = (await page.locator('.inspector-sheet-handle').boundingBox())!;
      expect(handle.y + handle.height).toBeLessThanOrEqual(box.y);
      expect(await hitAt('.inspector-sheet-handle', handle)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const footer = (await page.locator('footer').last().boundingBox())!;
      const banner = (await page.getByRole('region', { name: 'Analytics consent' }).boundingBox())!;
      expect(footer.y + footer.height).toBeLessThanOrEqual(banner.y + 1);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (shots) await page.screenshot({ path: `${shots}/consent-editor-${info.project.name}-${size ? `${size.width}x${size.height}` : 'device'}.png` });
    // Choosing removes nothing by itself here (the app's handler does that),
    // but the click reaches the button and reports the choice.
    await page.getByRole('button', { name: 'Allow', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __choices: string[] }).__choices)).toEqual(['granted']);
  });
}

test('a toolbar flyout opens above the consent banner', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await showBanner(page);
  const banner = page.getByRole('region', { name: 'Analytics consent' });
  expect(await banner.evaluate((element) => Number(getComputedStyle(element).zIndex))).toBeLessThan(40);
  // Menus (40), popovers and toolbar flyouts (80) stack above it.
  const levels = await page.evaluate(() => {
    const probe = (className: string) => {
      const element = document.createElement('div');
      element.className = className;
      document.body.append(element);
      const z = Number(getComputedStyle(element).zIndex);
      element.remove();
      return z;
    };
    return [probe('menu-popup'), probe('tool-flyout')];
  });
  for (const level of levels) expect(level).toBeGreaterThan(30);
});

test('the consent banner is styled and inside the viewport on the landing page', async ({ page }, info) => {
  await page.goto('/');
  await showBanner(page);
  await assertBannerLooksRight(page);
  if (shots) await page.screenshot({ path: `${shots}/consent-landing-${info.project.name}.png` });
  await page.getByRole('button', { name: 'No thanks', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __choices: string[] }).__choices)).toEqual(['denied']);
});
