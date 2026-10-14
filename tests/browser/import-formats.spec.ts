import { test, expect } from '@playwright/test';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const SIMPLE_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><rect width="2" height="1" fill="#ff5c35"/></svg>',
);
const PSD_RGB_2X1 = Buffer.from([
  0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0, 0, 0, 0, 0, 0, 4,
  0, 0, 0, 1, 0, 0, 0, 2, 0, 8, 0, 3,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  255, 4, 8, 128, 16, 64, 255, 0,
]);
const TIFF_RGB_2X1 = (() => {
  const bytes = new Uint8Array(146), view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 10, true);
  const entries: Array<[number, number, number, number]> = [
    [256, 4, 1, 2], [257, 4, 1, 1], [258, 3, 3, 134], [259, 3, 1, 1], [262, 3, 1, 2],
    [273, 4, 1, 140], [277, 3, 1, 3], [278, 4, 1, 1], [279, 4, 1, 6], [284, 3, 1, 1],
  ];
  entries.forEach(([tag, type, count, value], index) => {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(offset + 8, value, true);
    else view.setUint32(offset + 8, value, true);
  });
  view.setUint32(130, 0, true);
  bytes.set([8, 0, 8, 0, 8, 0], 134);
  bytes.set([255, 8, 16, 4, 128, 64], 140);
  return Buffer.from(bytes);
})();

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('pastes a browser clipboard image as an editable layer when no layer clipboard exists', async ({ page }) => {
  await page.evaluate((encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const clipboardFile = new File([bytes], 'clipboard.png', { type: 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(clipboardFile);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    document.querySelector('[data-testid="editor-shell"]')?.dispatchEvent(event);
  }, ONE_PIXEL_PNG.toString('base64'));
  await expect(page.getByRole('heading', { name: /Layers/ })).toContainText('2 /');
  await expect(page.getByText('Image layer added', { exact: true })).toBeVisible();
});

test('keeps the native keyboard paste event cancellable only for internal layer clips', async ({ page }) => {
  const defaultPrevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'v',
      metaKey: true,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(defaultPrevented).toBe(false);
});

test('imports an RGB PSD composite as a flattened editable raster with explicit layer-loss disclosure', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'layered.psd',
    mimeType: 'image/vnd.adobe.photoshop',
    buffer: PSD_RGB_2X1,
  });
  await expect(page.getByText('PSD/PSB imported as a flattened editable raster; layers, masks, profiles and source metadata omitted', { exact: true })).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '2');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '1');
  await expect.poll(() => page.getByTestId('editor-canvas').evaluate((canvas) => [...(canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 2, 1).data])).toEqual([255, 8, 16, 255, 0, 0, 0, 0]);
});

test('keeps the draft unchanged when a PSD composite is malformed', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'broken.psd',
    mimeType: 'image/vnd.adobe.photoshop',
    buffer: Buffer.from('8BPS'),
  });
  await expect(page.getByText('This PSD/PSB is not a supported 8-bit RGB/grayscale composite.', { exact: false })).toBeVisible();
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
    mimeType: 'image/tiff',
    buffer: TIFF_RGB_2X1,
  });
  await expect(
    page.getByText('TIFF imported as a flattened raster; source metadata omitted', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '2');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '1');
  await expect.poll(() => page.getByTestId('editor-canvas').evaluate((canvas) => [...(canvas as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 2, 1).data])).toEqual([255, 8, 16, 255, 4, 128, 64, 255]);
});

test('keeps the draft unchanged when TIFF decoding fails', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'scan.tif',
    mimeType: 'image/tiff',
    buffer: Buffer.from([0, 1, 2, 3, 4]),
  });
  await expect(
    page.getByText('This TIFF is not a supported 8-bit chunky RGB/grayscale composite.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
});

test('rasterizes SVG with an explicit vector-loss disclosure', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'illustration.svg',
    mimeType: 'image/svg+xml',
    buffer: SIMPLE_SVG,
  });
  await expect(
    page.getByText('SVG rasterized as a flattened raster; vector data and external resources omitted', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '2');
});

test('rejects PDF before decoding with an explicit page-rendering hint', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'proof.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n'),
  });
  await expect(page.getByText('PDF import is not supported yet.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1440');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '960');
});
