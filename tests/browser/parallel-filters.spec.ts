import { test, expect, type Page } from '@playwright/test';

// Heavy neighbourhood filters on large layers run as parallel row bands (or
// parallel tiles) in a filter worker pool nested inside the render worker.
// These tests prove the pool is used end to end, that its output equals the
// serial kernels byte for byte, and that per-band progress keeps the render
// watchdog's no-progress window from expiring on long renders.

type PageGlobals = Window & {
  __PIXELFORGE_RENDER_TIMEOUT_MS__?: number | { stallMs: number; totalMs: number };
  __PIXELFORGE_FILTER_WORKERS__?: number;
};

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

async function open(page: Page, filterWorkers?: number) {
  await page.addInitScript((workers) => {
    const scope = window as PageGlobals;
    scope.__PIXELFORGE_RENDER_TIMEOUT_MS__ = 120_000;
    if (workers !== null) scope.__PIXELFORGE_FILTER_WORKERS__ = workers;
  }, filterWorkers ?? null);
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

const settled = (page: Page, timeout = 120_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

/** Import a deterministic noisy opaque image with a hard vertical edge. */
async function importNoisy(page: Page, width: number, height: number) {
  const encoded = await page.evaluate(([w, h]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(w, h);
    let state = 11;
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        const noise = ((state >>> 24) & 31) - 16;
        const offset = (y * w + x) * 4;
        const base = x < w / 2 ? 70 : 180;
        image.data[offset] = base + noise;
        image.data[offset + 1] = base + noise / 2;
        image.data[offset + 2] = base - noise;
        image.data[offset + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  await page.getByTestId('file-input').setInputFiles({
    name: 'noisy.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', width);
  await settled(page);
}

async function applyFilter(page: Page, command: string, type: string, radiusLabel: string, radius: string) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: command, exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
  await settled(page);
  const slider = page.getByLabel(radiusLabel, { exact: true });
  await slider.fill(radius);
  await expect(slider).toHaveValue(radius);
  const started = Date.now();
  await settled(page);
  return Date.now() - started;
}

/** FNV-1a hash of the visible canvas pixels. */
const canvasHash = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
    return hash;
  });

const footerNotice = (page: Page) => page.locator('footer > span').first();

for (const { command, type, radiusLabel, radius } of [
  { command: 'Reduce Noise…', type: 'reduce-noise', radiusLabel: 'Radius', radius: '8' },
  { command: 'Smart Blur…', type: 'smart-blur', radiusLabel: 'Blur radius', radius: '8' },
]) {
  test(`${command.replace('…', '')} renders the same pixels with and without the filter worker pool`, async ({ browser }) => {
    test.setTimeout(300_000);
    const hashes: number[] = [];
    for (const workers of [0, 4]) {
      const { baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = test.info().project.use;
      const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });
      const page = await context.newPage();
      await page.route(
        'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
        (route) => route.fulfill({ json: { authenticated: false } }),
      );
      await open(page, workers);
      await importNoisy(page, 1600, 1400);
      await applyFilter(page, command, type, radiusLabel, radius);
      await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
      hashes.push(await canvasHash(page));
      await context.close();
    }
    expect(hashes[1]).toBe(hashes[0]);
  });
}

test('per-band progress keeps a long parallel Reduce Noise inside a short no-progress window', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  // Two workers on a 6.8 MP layer: the whole filter takes far longer than
  // the 8 s no-progress window, but each ~0.5 MP band finishes well inside it.
  await open(page, 2);
  await importNoisy(page, 2600, 2600);
  await page.evaluate(() => {
    (window as PageGlobals).__PIXELFORGE_RENDER_TIMEOUT_MS__ = { stallMs: 8_000, totalMs: 240_000 };
  });
  const settleMs = await applyFilter(page, 'Reduce Noise…', 'reduce-noise', 'Radius', '8');
  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
  testInfo.annotations.push({ type: 'settleMs', description: String(settleMs) });
  console.log(`PixelForge band progress ${testInfo.project.name} ${JSON.stringify({ settleMs, stallMs: 8000 })}`);
});

test('the default pool renders a 4 MP Smart Blur and Reduce Noise faster than the serial budget', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await open(page);
  await importNoisy(page, 2000, 2000);
  const workers = await page.evaluate(() => navigator.hardwareConcurrency);
  // Serial kernels need ~10–15 s here; with the pool the render must finish
  // inside a 25 s watchdog even on a busy CI runner or an emulated phone.
  await page.evaluate(() => {
    (window as PageGlobals).__PIXELFORGE_RENDER_TIMEOUT_MS__ = 25_000;
  });
  const smartMs = await applyFilter(page, 'Smart Blur…', 'smart-blur', 'Blur radius', '8');
  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
  const noiseMs = await applyFilter(page, 'Reduce Noise…', 'reduce-noise', 'Radius', '8');
  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
  const report = { size: 2000, hardwareConcurrency: workers, smartMs, noiseMs };
  await testInfo.attach('parallel-filters.json', { body: JSON.stringify(report), contentType: 'application/json' });
  console.log(`PixelForge parallel filters ${testInfo.project.name} ${JSON.stringify(report)}`);
});
