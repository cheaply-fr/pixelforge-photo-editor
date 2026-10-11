import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('committed document renders through OffscreenCanvas worker and survives reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __PIXELFORGE_FORCE_WORKER__?: boolean }
    ).__PIXELFORGE_FORCE_WORKER__ = true;
    const NativeWorker = window.Worker;
    (
      window as Window & { __pixelForgeRenderMessages?: number }
    ).__pixelForgeRenderMessages = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        const original = this.postMessage.bind(this);
        this.postMessage = ((message: unknown, transfer?: Transferable[]) => {
          if (
            message &&
            typeof message === 'object' &&
            (message as { kind?: unknown }).kind === 'render'
          ) {
            const state = window as Window & {
              __pixelForgeRenderMessages?: number;
            };
            state.__pixelForgeRenderMessages =
              (state.__pixelForgeRenderMessages || 0) + 1;
          }
          return original(message, transfer as Transferable[]);
        }) as typeof this.postMessage;
      }
    } as typeof Worker;
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const supported = await page.evaluate(
    () =>
      typeof Worker === 'function' &&
      typeof OffscreenCanvas === 'function' &&
      typeof createImageBitmap === 'function' &&
      Boolean(new OffscreenCanvas(1, 1).getContext('2d')),
  );
  test.skip(
    !supported,
    'OffscreenCanvas document rendering is unavailable in this browser',
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __pixelForgeRenderMessages?: number })
            .__pixelForgeRenderMessages || 0,
      ),
    )
    .toBeGreaterThan(0);
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await expect(page.getByTestId('render-status')).toHaveText('Render ready');
  const before = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="editor-canvas"]',
    )!;
    return Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data);
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const after = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="editor-canvas"]',
    )!;
    return Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data);
  });
  expect(after).toEqual(before);
});

test('main-thread fallback remains usable when worker rendering is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, 'OffscreenCanvas', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
  await expect(page.getByTestId('render-status')).toHaveText('Render ready');
  await expect(page.getByTestId('render-status')).toHaveAttribute(
    'data-render-completed',
    '1',
  );
  await expect(page.getByTestId('render-status')).toHaveAttribute(
    'data-render-total',
    '1',
  );
  await expect(page.getByLabel('Draft save status')).toHaveText(
    'Saved on this device',
  );
});

test('render status exposes bounded layer progress after a worker render', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __PIXELFORGE_FORCE_WORKER__?: boolean }
    ).__PIXELFORGE_FORCE_WORKER__ = true;
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  const supported = await page.evaluate(
    () =>
      typeof Worker === 'function' &&
      typeof OffscreenCanvas === 'function' &&
      typeof createImageBitmap === 'function' &&
      Boolean(new OffscreenCanvas(1, 1).getContext('2d')),
  );
  test.skip(
    !supported,
    'OffscreenCanvas document rendering is unavailable in this browser',
  );
  const status = page.getByTestId('render-status');
  await expect(status).toHaveAttribute('data-render-completed', '1');
  await expect(status).toHaveAttribute('data-render-total', '1');
  await expect(status).toHaveText('Render ready');
});

test('committed worker session reuses one worker across latest-wins edits', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __PIXELFORGE_FORCE_WORKER__?: boolean }).__PIXELFORGE_FORCE_WORKER__ = true;
    const NativeWorker = window.Worker;
    const state = window as Window & { __workerCreates?: number; __workerRenders?: number };
    state.__workerCreates = 0;
    state.__workerRenders = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        state.__workerCreates = (state.__workerCreates || 0) + 1;
        const original = this.postMessage.bind(this);
        this.postMessage = ((message: unknown, transfer?: Transferable[]) => {
          if (message && typeof message === 'object' && (message as { kind?: unknown }).kind === 'render')
            state.__workerRenders = (state.__workerRenders || 0) + 1;
          return original(message, transfer as Transferable[]);
        }) as typeof this.postMessage;
      }
    } as typeof Worker;
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const supported = await page.evaluate(() =>
    typeof Worker === 'function' && typeof OffscreenCanvas === 'function' &&
    typeof createImageBitmap === 'function' && Boolean(new OffscreenCanvas(1, 1).getContext('2d')),
  );
  test.skip(!supported, 'OffscreenCanvas document rendering is unavailable in this browser');
  const brightness = page.getByLabel('Brightness', { exact: true });
  await brightness.press('Home');
  await brightness.press('End');
  await brightness.press('Home');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const counts = await page.evaluate(() => {
    const state = window as Window & { __workerCreates?: number; __workerRenders?: number };
    return { creates: state.__workerCreates || 0, renders: state.__workerRenders || 0 };
  });
  expect(counts.renders).toBeGreaterThanOrEqual(2);
  expect(counts.creates).toBe(1);
});

test('fallback renders the latest adjustment and preserves it through reload after rapid changes', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { configurable: true, value: undefined });
    Object.defineProperty(window, 'OffscreenCanvas', { configurable: true, value: undefined });
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const brightness = page.getByLabel('Brightness', { exact: true });
  await brightness.press('Home');
  await brightness.press('End');
  await brightness.press('Home');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const finalValue = await brightness.inputValue();
  const pixels = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data));
  await expect(page.getByLabel('Draft save status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(brightness).toHaveValue(finalValue);
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  expect(await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data))).toEqual(pixels);
});

test('a superseded project import cannot replace the newer document or its pixels', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', {name: 'File', exact: true}).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', {name: 'Download project file', exact: true}).click();
  const file = await (await downloading).path();
  const original = await downloadedProject(file!);
  const urls = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1440; canvas.height = 960;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 1440, 960);
    const slow = canvas.toDataURL('image/png');
    context.fillStyle = '#0000ff'; context.fillRect(0, 0, 1440, 960);
    return {slow, fast: canvas.toDataURL('image/png')};
  });
  await page.evaluate((slow) => {
    // Preserve the prototype method and explicitly bind its receiver below.
    // oxlint-disable-next-line typescript/unbound-method
    const nativeDecode = HTMLImageElement.prototype.decode;
    const state = window as Window & {__releaseImport?: () => void; __importPaused?: boolean};
    HTMLImageElement.prototype.decode = async function () {
      if (this.src === slow) {
        state.__importPaused = true;
        await new Promise<void>(resolve => {state.__releaseImport = resolve;});
      }
      return nativeDecode.call(this);
    };
  }, urls.slow);
  const older = structuredClone(original);
  const newer = structuredClone(original);
  older.name = 'older-import'; newer.name = 'newer-import';
  for (const asset of Object.values(older.assets) as Array<{url: string}>) asset.url = urls.slow;
  for (const asset of Object.values(newer.assets) as Array<{url: string}>) asset.url = urls.fast;
  await page.getByTestId('project-input').setInputFiles({
    name: 'older.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(older)),
  });
  await expect.poll(() => page.evaluate(() =>
    Boolean((window as Window & {__importPaused?: boolean}).__importPaused))).toBe(true);
  await page.getByTestId('project-input').setInputFiles({
    name: 'newer.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(newer)),
  });
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const pixel = () => page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data));
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  const newestUrl = page.url();
  await page.evaluate(() => (window as Window & {__releaseImport?: () => void}).__releaseImport?.());
  await expect(page.getByText('Document import cancelled', {exact: true})).toBeVisible();
  expect(await pixel()).toEqual([0, 0, 255, 255]);
  expect(page.url()).toBe(newestUrl);
  await expect(page.getByLabel('Draft save status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  expect(await pixel()).toEqual([0, 0, 255, 255]);
});
