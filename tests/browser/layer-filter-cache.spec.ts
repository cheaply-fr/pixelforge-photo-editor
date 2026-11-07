import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page, timeout = 60_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

async function menu(page: Page, name: string, item: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

type CacheStats = { hits: number; misses: number; stores: number; entries: number; bytes: number; maxBytes: number };

/** Forget earlier render spans and cache marks so the next edit is measured alone. */
const resetMarks = (page: Page) =>
  page.evaluate(() => {
    performance.clearMarks('pixelforge.layer-filter-cache');
    performance.clearMeasures('pixelforge.render');
  });

/** Sum the per-render cache counters and render durations since the last reset. */
const measured = (page: Page) =>
  page.evaluate(() => {
    const marks = performance.getEntriesByName('pixelforge.layer-filter-cache', 'mark') as PerformanceMark[];
    const stats = marks.map((mark) => mark.detail as CacheStats);
    const sum = (key: keyof CacheStats) => stats.reduce((total, item) => total + item[key], 0);
    const renders = performance.getEntriesByName('pixelforge.render', 'measure');
    return {
      renders: stats.length,
      hits: sum('hits'),
      misses: sum('misses'),
      stores: sum('stores'),
      latest: stats.at(-1),
      renderMs: renders.reduce((total, entry) => total + entry.duration, 0),
    };
  });

/** Exact digest of the composite canvas, so cached and fresh renders can be compared. */
const digest = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let a = 0x811c9dc5, opaque = 0;
    for (let i = 0; i < data.length; i += 1) a = Math.imul(a ^ data[i], 0x01000193);
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) opaque += 1;
    return { hash: (a >>> 0).toString(16), width: canvas.width, height: canvas.height, opaque };
  });

test('an unrelated layer edit reuses the cached Clouds layer with identical pixels', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  // 1500x1500 crosses the worker threshold, so this exercises the persistent
  // render worker's cache and its result-message diagnostics.
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('1500');
  await page.getByLabel('Height (px)').fill('1500');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('height', 1500);
  await settled(page);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await settled(page);
  await menu(page, 'Filter', 'Clouds');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('clouds');
  await settled(page);

  // First render with these parameters computes the filter and stores it.
  await resetMarks(page);
  await page.getByLabel('Effect amount', { exact: true }).fill('60');
  await settled(page);
  const first = await measured(page);
  expect(first.renders).toBeGreaterThanOrEqual(1);
  expect(first.misses).toBeGreaterThanOrEqual(1);
  expect(first.stores).toBeGreaterThanOrEqual(1);
  expect(first.latest!.bytes).toBeGreaterThanOrEqual(1500 * 1500 * 4);
  expect(first.latest!.bytes).toBeLessThanOrEqual(first.latest!.maxBytes);

  // Selecting and editing another layer must not recompute the Clouds layer.
  await page.getByRole('button', { name: 'Select layer Background', exact: true }).click();
  await settled(page);
  await resetMarks(page);
  await page.getByLabel('Layer opacity', { exact: true }).fill('40');
  await settled(page);
  const second = await measured(page);
  expect(second.renders).toBeGreaterThanOrEqual(1);
  expect(second.hits).toBeGreaterThanOrEqual(1);
  expect(second.misses).toBe(0);
  expect(second.stores).toBe(0);
  // Generous: the cached render skips the full-frame filter entirely.
  expect(second.renderMs).toBeLessThan(first.renderMs);
  const cached = await digest(page);
  expect(cached.width).toBe(1500);

  // Reloading installs the restored draft into empty caches, so this render is
  // computed from scratch. It must match the cached composite exactly.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await settled(page);
  await expect(page.getByLabel('Layer opacity', { exact: true })).toHaveValue('40');
  const fresh = await digest(page);
  expect(fresh).toEqual(cached);

  const report = { firstRenderMs: first.renderMs, cachedRenderMs: second.renderMs, first, second };
  await testInfo.attach('layer-filter-cache.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log(`PixelForge layer filter cache ${testInfo.project.name} ${JSON.stringify({ firstRenderMs: first.renderMs, cachedRenderMs: second.renderMs })}`);
});

test('undo returns to a cached filter state without recomputing it', async ({ page }) => {
  test.setTimeout(180_000);
  await menu(page, 'Image', 'Canvas Size…');
  await page.getByLabel('Width (px)').fill('1500');
  await page.getByLabel('Height (px)').fill('1500');
  await page.getByRole('button', { name: 'Apply canvas size', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('height', 1500);
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await menu(page, 'Filter', 'Clouds');
  await page.getByLabel('Effect amount', { exact: true }).fill('70');
  await settled(page);
  const before = await digest(page);

  // A new filter parameter misses; undo brings back the earlier parameters.
  await page.getByLabel('Effect amount', { exact: true }).fill('30');
  await settled(page);
  expect(await digest(page)).not.toEqual(before);
  await resetMarks(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Effect amount', { exact: true })).toHaveValue('70');
  await settled(page);
  const undo = await measured(page);
  expect(undo.hits).toBeGreaterThanOrEqual(1);
  expect(undo.misses).toBe(0);
  expect(await digest(page)).toEqual(before);
});
