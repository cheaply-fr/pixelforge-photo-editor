import { test, expect, type Page } from '@playwright/test';

// 1600×1600 (2.56 MP) crosses the worker threshold, so these renders go
// through the persistent render worker, its tiled blur adapter and the
// render watchdog. The previous O(radius) Gaussian needed roughly 20–45 s
// for radius 64 at this size and would be stopped by the shortened budget
// below; the radius-independent box cascade finishes in a few seconds.
const SIZE = 1600;
const WATCHDOG_MS = 12_000;

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.addInitScript((budget) => {
    (window as Window & { __PIXELFORGE_RENDER_TIMEOUT_MS__?: number }).__PIXELFORGE_RENDER_TIMEOUT_MS__ = budget;
  }, WATCHDOG_MS);
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page, timeout = 60_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

/** Import an opaque image of hard 8 px colour stripes. */
async function importStripes(page: Page) {
  const encoded = await page.evaluate((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#102030';
    context.fillRect(0, 0, size, size);
    context.fillStyle = '#f0c040';
    for (let x = 0; x < size; x += 16) context.fillRect(x, 0, 8, size);
    return canvas.toDataURL('image/png').split(',')[1];
  }, SIZE);
  await page.getByTestId('file-input').setInputFiles({
    name: 'large-stripes.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', SIZE);
  await settled(page);
}

/** Red-channel min/max across the middle row, away from the image edges. */
const middleRowRange = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const y = Math.floor(canvas.height / 2);
    const row = canvas.getContext('2d')!.getImageData(400, y, canvas.width - 800, 1).data;
    let min = 255;
    let max = 0;
    for (let offset = 0; offset < row.length; offset += 4) {
      min = Math.min(min, row[offset]);
      max = Math.max(max, row[offset]);
    }
    return { min, max, alpha: row[3] };
  });

async function openGaussian(page: Page) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gaussian-blur');
  await settled(page);
  // The default amount (85 %) leaves some of the source mixed in.
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);
}

const footerNotice = (page: Page) => page.locator('footer > span').first();

test('Gaussian Blur radius 64 renders a large document without hitting the watchdog', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await importStripes(page);
  const original = await middleRowRange(page);
  expect(original.max - original.min).toBeGreaterThan(200);

  await openGaussian(page);
  const radius = page.getByLabel('Blur radius', { exact: true });
  await radius.fill('64');
  await expect(radius).toHaveValue('64');
  const started = Date.now();
  await settled(page);
  const elapsed = Date.now() - started;

  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
  const renderStatus = page.getByTestId('render-status');
  await expect(renderStatus).toHaveAttribute('data-tiled-effect', 'gaussian-blur');
  // An 8 px on / 8 px off stripe pattern under a radius-64 blur becomes an
  // almost flat average of the two colours: 0x10 and 0xf0 average to 128.
  const blurred = await middleRowRange(page);
  expect(blurred.alpha).toBe(255);
  expect(blurred.max - blurred.min).toBeLessThan(12);
  expect(blurred.min).toBeGreaterThan(110);
  expect(blurred.max).toBeLessThan(146);

  const report = { size: SIZE, radius: 64, settleMs: elapsed, watchdogMs: WATCHDOG_MS };
  await testInfo.attach('large-radius-gaussian.json', {
    body: JSON.stringify(report),
    contentType: 'application/json',
  });
  console.log(`PixelForge large-radius Gaussian ${testInfo.project.name} ${JSON.stringify(report)}`);
});

test('a render stopped by the watchdog keeps the editor usable and the last canvas', async ({ page }) => {
  test.setTimeout(180_000);
  await importStripes(page);
  await openGaussian(page);
  const radius = page.getByLabel('Blur radius', { exact: true });
  await radius.fill('20');
  await settled(page);
  const before = await middleRowRange(page);

  // Force the next worker render over budget: the watchdog must stop it,
  // explain what happened, and leave the previous render on the canvas.
  await page.evaluate(() => {
    (window as Window & { __PIXELFORGE_RENDER_TIMEOUT_MS__?: number }).__PIXELFORGE_RENDER_TIMEOUT_MS__ = 1;
  });
  await radius.fill('40');
  await expect(footerNotice(page)).toContainText('Rendering stopped', { timeout: 30_000 });
  await expect(footerNotice(page)).toContainText('editing still works');
  await settled(page);
  expect(await middleRowRange(page)).toEqual(before);

  // Restore a normal budget: the next edit renders normally.
  await page.evaluate(() => {
    delete (window as Window & { __PIXELFORGE_RENDER_TIMEOUT_MS__?: number }).__PIXELFORGE_RENDER_TIMEOUT_MS__;
  });
  await radius.fill('64');
  await expect(radius).toHaveValue('64');
  await settled(page);
  const after = await middleRowRange(page);
  expect(after.max - after.min).toBeLessThan(before.max - before.min);
});
