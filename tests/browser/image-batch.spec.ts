import { test, expect } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
});

test('File menu opens local multi-input batch export and downloads a manifest ZIP', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'portrait.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    { name: 'portrait-copy.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
  ]);
  await expect(page.getByRole('heading', { name: 'Batch export images' })).toBeVisible();
  await expect(page.getByText('Process 2 local images')).toBeVisible();
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/2\/2 images/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/pixelforge-images-batch\.zip$/);
  expect(await download.failure()).toBeNull();
});

test('multi-input batch can package flattened PSD composites without lossy controls', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'portrait.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
  ]);
  await page.getByLabel('Batch image export format').selectOption('psd');
  await expect(page.getByLabel('Batch image export quality')).toHaveCount(0);
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/1\/1 images/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const download = await pending;
  const path = await download.path();
  const archive = await (await import('node:fs/promises')).readFile(path!);
  expect(archive.includes(Buffer.from('8BPS'))).toBe(true);
});

test('multi-input batch can package flattened PDF pages without lossy controls', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'portrait.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
  ]);
  await page.getByLabel('Batch image export format').selectOption('pdf');
  await expect(page.getByLabel('Batch image export quality')).toHaveCount(0);
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/1\/1 images/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const path = await (await pending).path();
  const archive = await (await import('node:fs/promises')).readFile(path!);
  expect(archive.includes(Buffer.from('%PDF-1.4'))).toBe(true);
});


test('multi-input batch keeps valid outputs and reports invalid files', async ({ page }) => {
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'good.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
    { name: 'not-an-image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0, 1, 2, 3, 4]) },
  ]);
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByLabel('Batch image export progress')).toHaveText(/1\/2 images/);
  await expect(page.getByLabel('Batch image export failures')).toContainText('not-an-image.jpg');
  await expect(page.getByLabel('Batch image export failures')).toContainText('file(s) skipped');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download batch ZIP' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/pixelforge-images-batch\.zip$/);
  expect(await download.failure()).toBeNull();
});

test('Escape cancels a running multi-input batch without downloading', async ({ page }) => {
  await page.addInitScript(() => {
    const native = globalThis.createImageBitmap;
    if (typeof native !== 'function') return;
    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async (...args: Parameters<typeof native>) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return native(...args);
      },
    });
  });
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Batch export images…', exact: true }).click();
  await page.getByTestId('batch-image-input').setInputFiles([
    { name: 'cancel-me.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG },
  ]);
  await page.getByRole('button', { name: 'Build batch ZIP' }).click();
  await expect(page.getByRole('button', { name: 'Cancel batch export' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Batch export images' })).toBeHidden();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});
