import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

type CacheStats = { hits: number; misses: number; stores: number };
const resetMarks = (page: Page) =>
  page.evaluate(() => performance.clearMarks('pixelforge.layer-filter-cache'));
const cacheTotals = (page: Page) =>
  page.evaluate(() => {
    const stats = (performance.getEntriesByName('pixelforge.layer-filter-cache', 'mark') as PerformanceMark[]).map(
      (mark) => mark.detail as CacheStats,
    );
    return {
      renders: stats.length,
      hits: stats.reduce((total, item) => total + item.hits, 0),
      stores: stats.reduce((total, item) => total + item.stores, 0),
    };
  });
const digest = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ data[i], 0x01000193);
    return (hash >>> 0).toString(16);
  });

test('editing a layer below a Motion Blur and a styled layer reuses both cached layers', async ({ page }) => {
  test.setTimeout(180_000);
  // 1500 px crosses the tiled-blur and render-worker (2 MP) thresholds.
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('1500');
  await page.getByLabel('Height (px)').fill('1500');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', 1500);
  await settled(page);
  // Layer 1: the one we will edit. Layer 2: Clouds stacked under a live
  // Motion Blur (the tiled path). Layer 3: Clouds with an Inner Shadow.
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await settled(page);
  }
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await page.getByLabel('Enable inner shadow', { exact: true }).check();
  await settled(page);
  const layerButtons = page.getByRole('button', { name: /^Select layer / });
  const count = await layerButtons.count();
  // The Layers panel lists layers top first: [3, 2, 1, Background].
  await layerButtons.nth(1).click();
  await settled(page);
  await menu(page, 'Filter', 'Clouds');
  await settled(page);
  await menu(page, 'Filter', 'Motion Blur…');
  await settled(page);
  await expect(page.locator('footer')).toContainText('Clouds moved to the filter stack (1/8)');
  await page.getByLabel('Blur radius', { exact: true }).fill('16');
  await settled(page);
  await expect(page.getByTestId('render-status')).toHaveAttribute('data-tiled-effect', 'motion-blur');

  await layerButtons.nth(count - 2).click();
  await settled(page);
  // Two unrelated edits to the lower layer: both upper layers come from the cache.
  for (const opacity of ['60', '35']) {
    await resetMarks(page);
    await page.getByLabel('Layer opacity', { exact: true }).fill(opacity);
    await settled(page);
    const totals = await cacheTotals(page);
    expect(totals.renders).toBeGreaterThanOrEqual(1);
    expect(totals.hits, `opacity ${opacity}`).toBeGreaterThanOrEqual(2);
    expect(totals.stores, `opacity ${opacity}`).toBe(0);
  }
  // A brush stroke on the lower layer previews and commits through the
  // render worker (live stroke bitmaps are transferred to it).
  const beforeStroke = await digest(page);
  await page.getByRole('button', { name: 'Brush tool', exact: true }).click();
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  const left = Math.max(box.x, 0), top = Math.max(box.y, 0);
  const right = Math.min(box.x + box.width, viewport.width), bottom = Math.min(box.y + box.height, viewport.height);
  await page.mouse.move(left + (right - left) * 0.3, top + (bottom - top) * 0.4);
  await page.mouse.down();
  await page.mouse.move(left + (right - left) * 0.7, top + (bottom - top) * 0.45, { steps: 8 });
  await page.mouse.up();
  await settled(page);
  await expect.poll(() => digest(page)).not.toEqual(beforeStroke);
  await expect(page.locator('footer')).not.toContainText('Could not render');
  // Cached and fresh renders agree: reload renders from empty caches.
  const cached = await digest(page);
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  expect(await digest(page)).toEqual(cached);
});