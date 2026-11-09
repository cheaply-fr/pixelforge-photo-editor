import { test, expect, type Page } from '@playwright/test';

// The editor fills the window. Nothing inside it may make the page itself
// taller than the window, or a scrollIntoView (sidebar auto-scroll, flyouts)
// shifts the whole editor up and leaves an empty band at the bottom.

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
});

test.skip(({ isMobile }) => isMobile, 'The mobile layout scrolls its own shell');

async function openEditor(page: Page) {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

const pageScroll = (page: Page) => page.evaluate(() => ({
  top: document.scrollingElement!.scrollTop,
  extra: document.scrollingElement!.scrollHeight - innerHeight,
}));

test('hidden helper text stays inside its panel', async ({ page }) => {
  await openEditor(page);
  const escaped = await page.evaluate(() => [...document.querySelectorAll('.inspector *, .toolbar *')]
    .filter((element) => getComputedStyle(element).position === 'absolute')
    .filter((element) => !(element as HTMLElement).offsetParent?.closest('.inspector, .toolbar'))
    .map((element) => element.className));
  expect(escaped).toEqual([]);
  expect((await pageScroll(page)).extra).toBeLessThanOrEqual(1);
});

test('the page itself cannot be scrolled, even by code', async ({ page }) => {
  await openEditor(page);
  // scrollIntoView and focus() scroll the page this way when it is taller than the window.
  await page.evaluate(() => { window.scrollTo(0, 600); document.scrollingElement!.scrollTop = 600; });
  expect((await pageScroll(page)).top).toBe(0);
  await expect(page.locator('.editor-shell')).toHaveJSProperty('offsetTop', 0);
});
