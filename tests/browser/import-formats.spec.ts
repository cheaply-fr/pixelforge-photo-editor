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
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('rejects PSD with an explicit layered-document compatibility label', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'layered.psd',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('8BPS'),
  });
  await expect(page.getByText('PSD/PSB import is not supported yet.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
});

test('rejects camera RAW with an explicit develop-first label', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'camera.cr3',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0, 1, 2, 3]),
  });
  await expect(page.getByText('Camera RAW import is not supported yet.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
});

test('labels a browser-decoded HEIC source as flattened raster with metadata omitted', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'camera.heic',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await expect(
    page.getByText('HEIC/HEIF imported as a flattened raster; source metadata omitted', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1');
});

test('labels a browser-decoded TIFF source as conditional flattened raster import', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'scan.tiff',
    // The bytes are a valid PNG fixture so this acceptance test exercises the
    // browser decoder while the extension carries the TIFF capability label.
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });
  await expect(
    page.getByText('TIFF imported as a flattened raster; source metadata omitted', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1');
});

test('keeps the draft unchanged when TIFF decoding fails', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'scan.tif',
    mimeType: 'image/tiff',
    buffer: Buffer.from([0, 1, 2, 3, 4]),
  });
  await expect(
    page.getByText('TIFF decoding is unavailable in this browser.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
});
