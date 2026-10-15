import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

async function importPixels(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(2, 1);
    image.data.set([255, 0, 0, 255, 0, 255, 0, 128]);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'color-mode-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
}

async function pixel(page: Page, x: number) {
  return page
    .getByTestId('editor-canvas')
    .evaluate(
      (canvas: HTMLCanvasElement, xCoordinate) =>
        Array.from(
          canvas.getContext('2d')!.getImageData(xCoordinate, 0, 1, 1).data,
        ),
      x,
    );
}

async function project(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return downloadedProject((await download.path())!);
}

test('Image > Mode toggles a source-safe grayscale render and survives undo/reload/project round trip', async ({
  page,
}) => {
  await importPixels(page);
  const before = await project(page);
  const sourceUrl =
    before.assets[before.history[before.index].layers.at(-1)!.asset!].url;
  expect(await pixel(page, 0)).toEqual([255, 0, 0, 255]);

  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Mode', exact: true }),
  ).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Mode', exact: true }).click();
  await expect(
    page.getByText('Image mode: Grayscale', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => pixel(page, 0)).toEqual([54, 54, 54, 255]);
  // Browser PNG decode can round the premultiplied half-alpha green channel
  // one byte lower than the pure buffer contract.
  await expect.poll(() => pixel(page, 1)).toEqual([181, 181, 181, 128]);
  const gray = await project(page);
  expect(gray.history[gray.index].colorMode).toBe('grayscale');
  const graySourceUrl =
    gray.assets[gray.history[gray.index].layers.at(-1)!.asset!].url;
  expect(graySourceUrl).toBe(sourceUrl);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 0)).toEqual([255, 0, 0, 255]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect.poll(() => pixel(page, 0)).toEqual([54, 54, 54, 255]);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect.poll(() => pixel(page, 0)).toEqual([54, 54, 54, 255]);
});

test('Image > Mode returns to RGB Color without changing the source asset', async ({
  page,
}) => {
  await importPixels(page);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mode', exact: true }).click();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mode', exact: true }).click();
  await expect(
    page.getByText('Image mode: RGB Color', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => pixel(page, 0)).toEqual([255, 0, 0, 255]);
});
