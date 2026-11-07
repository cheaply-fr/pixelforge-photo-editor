import { test, expect, type Page } from '@playwright/test';

// 2000×2000 (4 MP) crosses the worker threshold, so these renders run in the
// render worker under its watchdog. Before the kernels were rewritten, Smart
// Blur, Smart Sharpen and Reduce Noise at radius 8 needed ~45–60 s here and
// Shape Blur ~20 s (local Node measurements, 11–15 s/MP and ~5 s/MP), so the
// per-filter watchdogs below would have stopped every one of them. The new
// kernels take roughly 2.5–4 s/MP (bilateral family) and 0.6 s/MP (Shape).
const SIZE = 2000;
const IMPORT_WATCHDOG_MS = 60_000;

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.addInitScript((budget) => {
    (window as Window & { __PIXELFORGE_RENDER_TIMEOUT_MS__?: number }).__PIXELFORGE_RENDER_TIMEOUT_MS__ = budget;
  }, IMPORT_WATCHDOG_MS);
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const settled = (page: Page, timeout = 60_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

/** Import a noisy opaque image with two tonal regions split by a hard edge. */
async function importNoisyHalves(page: Page) {
  const encoded = await page.evaluate((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(size, size);
    let state = 7;
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        const noise = ((state >>> 24) & 31) - 16;
        const base = x < size / 2 ? 60 : 190;
        const offset = (y * size + x) * 4;
        image.data[offset] = base + noise;
        image.data[offset + 1] = base + noise;
        image.data[offset + 2] = base + noise;
        image.data[offset + 3] = 255;
      }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, SIZE);
  await page.getByTestId('file-input').setInputFiles({
    name: 'noisy-halves.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', SIZE);
  await settled(page);
}

/** Red-channel spread on a strip inside the left half, plus the edge step. */
const sampleStrip = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')!;
    const y = Math.floor(canvas.height / 2);
    const strip = context.getImageData(200, y, 600, 1).data;
    let min = 255;
    let max = 0;
    for (let offset = 0; offset < strip.length; offset += 4) {
      min = Math.min(min, strip[offset]);
      max = Math.max(max, strip[offset]);
    }
    const left = context.getImageData(canvas.width / 2 - 30, y, 1, 1).data[0];
    const right = context.getImageData(canvas.width / 2 + 30, y, 1, 1).data[0];
    return { spread: max - min, edge: right - left, alpha: strip[3] };
  });

const footerNotice = (page: Page) => page.locator('footer > span').first();

async function applyFilter(
  page: Page,
  command: string,
  type: string,
  radiusLabel: string,
  radius: string,
  watchdogMs: number,
) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: command, exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
  await settled(page);
  // Shorten the watchdog only for the render under test.
  await page.evaluate((budget) => {
    (window as Window & { __PIXELFORGE_RENDER_TIMEOUT_MS__?: number }).__PIXELFORGE_RENDER_TIMEOUT_MS__ = budget;
  }, watchdogMs);
  const slider = page.getByLabel(radiusLabel, { exact: true });
  await slider.fill(radius);
  await expect(slider).toHaveValue(radius);
  const started = Date.now();
  await settled(page);
  const elapsed = Date.now() - started;
  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
  return elapsed;
}

for (const { command, type, radiusLabel, radius, smooths, watchdogMs } of [
  { command: 'Smart Blur…', type: 'smart-blur', radiusLabel: 'Blur radius', radius: '8', smooths: true, watchdogMs: 40_000 },
  { command: 'Reduce Noise…', type: 'reduce-noise', radiusLabel: 'Radius', radius: '8', smooths: true, watchdogMs: 40_000 },
  { command: 'Smart Sharpen…', type: 'smart-sharpen', radiusLabel: 'Blur radius', radius: '8', smooths: false, watchdogMs: 40_000 },
  { command: 'Shape Blur…', type: 'shape-blur', radiusLabel: 'Blur radius', radius: '12', smooths: true, watchdogMs: 12_000 },
]) {
  test(`${command.replace('…', '')} at radius ${radius} renders a 4 MP document under the watchdog`, async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    await importNoisyHalves(page);
    const original = await sampleStrip(page);
    expect(original.spread).toBeGreaterThan(20);
    expect(original.edge).toBeGreaterThan(100);

    const settleMs = await applyFilter(page, command, type, radiusLabel, radius, watchdogMs);
    const result = await sampleStrip(page);
    expect(result.alpha).toBe(255);
    if (smooths) expect(result.spread).toBeLessThan(original.spread);
    else expect(result.spread).toBeGreaterThanOrEqual(original.spread - 2);
    // The tonal edge survives: Smart/Surface-style filters must not wash it out.
    expect(result.edge).toBeGreaterThan(type === 'shape-blur' ? 60 : 100);

    const report = { size: SIZE, type, radius: Number(radius), settleMs, watchdogMs };
    await testInfo.attach(`fast-${type}.json`, { body: JSON.stringify(report), contentType: 'application/json' });
    console.log(`PixelForge fast filter ${testInfo.project.name} ${JSON.stringify(report)}`);
  });
}
