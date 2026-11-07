import { test, expect, type Browser, type Page } from '@playwright/test';

// Filter worker pool polish: the pool is pre-warmed when the Filter menu
// opens, and a render superseded while its tiles run in filter workers is
// cancelled cleanly (the next render is exact and nothing times out).

type PageGlobals = Window & {
  __PIXELFORGE_RENDER_TIMEOUT_MS__?: number;
  __PIXELFORGE_FILTER_WORKERS__?: number;
  __filterWorkersCreated?: number;
};

async function open(page: Page, filterWorkers: number) {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.addInitScript((workers) => {
    const scope = window as PageGlobals;
    scope.__PIXELFORGE_RENDER_TIMEOUT_MS__ = 120_000;
    scope.__PIXELFORGE_FILTER_WORKERS__ = workers;
    scope.__filterWorkersCreated = 0;
    // Count filter workers created on the page (main-thread render path).
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('filter-band')) scope.__filterWorkersCreated! += 1;
      }
    } as typeof Worker;
  }, filterWorkers);
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

const settled = (page: Page, timeout = 120_000) =>
  expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false', { timeout });

async function importNoisy(page: Page, width: number, height: number) {
  const encoded = await page.evaluate(([w, h]) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(w, h);
    let state = 5;
    for (let index = 0; index < image.data.length; index += 4) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      const noise = ((state >>> 24) & 31) - 16;
      const base = (index / 4) % w < w / 2 ? 60 : 190;
      image.data[index] = base + noise;
      image.data[index + 1] = base;
      image.data[index + 2] = base - noise;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  await page.getByTestId('file-input').setInputFiles({
    name: 'noisy.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveJSProperty('width', width);
  await settled(page);
}

const canvasHash = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) hash = Math.imul(hash ^ data[index], 16777619) >>> 0;
    return hash;
  });

const footerNotice = (page: Page) => page.locator('footer > span').first();

test('opening the Filter menu pre-warms the filter workers before a heavy filter is chosen', async ({ page }) => {
  test.setTimeout(180_000);
  // 1.2 MP renders on the main thread, where filter workers are observable.
  await open(page, 3);
  await importNoisy(page, 1200, 1000);
  expect(await page.evaluate(() => (window as PageGlobals).__filterWorkersCreated)).toBe(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as PageGlobals).__filterWorkersCreated), { timeout: 10_000 }).toBe(3);
  await page.getByRole('menuitem', { name: 'Reduce Noise…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('reduce-noise');
  // Let the default-radius render finish: superseding it would (correctly)
  // terminate busy workers and start replacements.
  await settled(page);
  await page.getByLabel('Radius', { exact: true }).fill('8');
  await settled(page);
  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped/i);
  // The warm workers rendered the filter; no extra workers were started.
  expect(await page.evaluate(() => (window as PageGlobals).__filterWorkersCreated)).toBe(3);
});

async function smartBlurHash(browser: Browser, baseURL: string | undefined, radii: string[]) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await open(page, 4);
  await importNoisy(page, 2000, 1600);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Smart Blur…', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('smart-blur');
  await settled(page);
  const slider = page.getByLabel('Blur radius', { exact: true });
  // Each fill supersedes the render still running in the filter workers.
  for (const radius of radii) await slider.fill(radius);
  await expect(slider).toHaveValue(radii.at(-1)!);
  await settled(page);
  await expect(footerNotice(page)).not.toContainText(/timed out|Rendering stopped|failed/i);
  const hash = await canvasHash(page);
  await context.close();
  return hash;
}

test('superseded tiled renders are cancelled in the filter workers and the final render is exact', async ({ browser }) => {
  test.setTimeout(300_000);
  const baseURL = test.info().project.use.baseURL;
  const direct = await smartBlurHash(browser, baseURL, ['3']);
  const superseded = await smartBlurHash(browser, baseURL, ['8', '7', '8', '3']);
  expect(superseded).toBe(direct);
});
