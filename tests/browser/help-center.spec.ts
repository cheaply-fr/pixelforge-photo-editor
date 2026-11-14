import { test, expect } from '@playwright/test';
import { selectTool } from './tool-selection';

// Help Center (docs/knowledge-base.md): static pages under /help built by
// scripts/build-help.mjs, linked from the editor's Help menu, F1 and the
// contextual Help link in Tool options.

test('the Help Center home lists every topic and finds articles by search', async ({ page }) => {
  await page.goto('/help');
  await expect(page).toHaveTitle('PixelForge Help Center');
  await expect(page.getByRole('heading', { name: 'How can we help?' })).toBeVisible();
  const topics = page.locator('.kb-topics a');
  expect(await topics.count()).toBeGreaterThanOrEqual(14);

  await page.locator('[data-kb-search]').fill('layer mask');
  const results = page.locator('#kb-search-results a');
  await expect(results.first()).toBeVisible();
  await expect(results.first()).toContainText(/mask/i);
  await page.locator('[data-kb-search]').press('Enter');
  await expect(page).toHaveURL(/\/help\/[a-z0-9-]+/);
  await expect(page.locator('.kb-article h1')).toBeVisible();
});

test('an article shows its breadcrumb, screenshots and links that resolve', async ({ page, isMobile }) => {
  await page.goto('/help/workspace-tour');
  await expect(page.getByRole('heading', { level: 1, name: 'Workspace tour' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Getting started');
  const screenshot = page.locator('.kb-prose figure img').first();
  await screenshot.scrollIntoViewIfNeeded();
  await expect.poll(() => screenshot.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBeGreaterThan(300);

  // No horizontal page scroll at any width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  if (isMobile) {
    const toggle = page.getByRole('button', { name: 'Open navigation' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#kb-nav')).toBeInViewport();
  } else {
    await expect(page.locator('.kb-nav [aria-current="page"]')).toHaveText('Workspace tour');
  }

  const hrefs = await page.locator('.kb-article a[href^="/help/"]').evaluateAll((links) =>
    [...new Set(links.map((link) => (link as HTMLAnchorElement).pathname))],
  );
  for (const href of hrefs) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
  }
});

test('category pages and tool links resolve to articles', async ({ page }) => {
  await page.goto('/help/category/layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Layers' })).toBeVisible();
  expect(await page.locator('.kb-cards a').count()).toBeGreaterThan(3);

  await page.goto('/help/tool/brush');
  await expect(page).toHaveURL(/\/help\/(?!tool\/)[a-z0-9-]+$/);
  await expect(page.locator('.kb-article h1')).toBeVisible();
});

test('the editor opens the Help Center from the Help menu, F1 and Tool options', async ({ page, context, isMobile }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Help menu' });
  await expect(menu).toBeVisible();
  for (const label of ['Help Center F1', 'Help for Current Tool', 'Getting Started', 'Keyboard Shortcuts Guide', 'What’s New', 'Report a Problem']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  }
  const opened = context.waitForEvent('page');
  await menu.getByRole('menuitem', { name: 'Help Center F1', exact: true }).click();
  const help = await opened;
  await expect(help).toHaveURL(/\/help$/);
  await help.close();

  await selectTool(page, 'Brush');
  const toolHelp = page.getByRole('link', { name: 'Help: Brush tool' });
  await expect(toolHelp).toHaveAttribute('href', '/help/tool/brush');
  await expect(toolHelp).toHaveAttribute('target', '_blank');

  const current = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Help for Current Tool', exact: true }).click();
  const toolPage = await current;
  await expect(toolPage).toHaveURL(/\/help\/(?!tool\/)[a-z0-9-]+$/);
  await toolPage.close();

  if (!isMobile) {
    const fromF1 = context.waitForEvent('page');
    await page.locator('body').press('F1');
    await expect(await fromF1).toHaveURL(/\/help$/);
  }
});

test('the landing page links to the Help Center', async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/');
  await expect(page.locator('.lp-header a[href="/help"]')).toBeVisible();
  await expect(page.locator('.lp-footer a[href="/help"]')).toHaveCount(1);
});
