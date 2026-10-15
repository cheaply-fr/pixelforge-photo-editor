import { test, expect } from '@playwright/test';
import { downloadedProject } from './project-file';

const fixture = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 1;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(8, 1);
  for (let x = 0; x < 8; x += 1) {
    const offset = x * 4;
    pixels.data[offset] = x < 4 ? 255 : 0;
    pixels.data[offset + 1] = 40;
    pixels.data[offset + 2] = x < 4 ? 0 : 255;
    pixels.data[offset + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL('image/png').split(',')[1];
});

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Convert for Smart Filters preserves filter pixels, source metadata and stack reload on desktop/mobile', async ({ page }) => {
  const encoded = await fixture(page);
  await page.getByTestId('file-input').setInputFiles({
    name: 'smart-filter-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
  });
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Gaussian Blur…', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const before = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(data.slice(0, 12));
  });
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Convert for Smart Filters', exact: true })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: 'Clear Smart Filter Stack', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Convert for Smart Filters', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Convert for Smart Filters', exact: true }).click();
  await expect(page.getByText(/Smart Filter stack now contains 1 effect/, { exact: false })).toBeVisible();
  const after = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(data.slice(0, 12));
  });
  expect(after).toEqual(before);

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const project = await downloadedProject((await (await pending).path())!);
  const layer = project.history[project.index].layers.at(-1) as Record<string, unknown>;
  expect(layer.smartFilters).toHaveLength(1);
  expect((layer.adjustments as Record<string, unknown>).filterEffects).toMatchObject({ type: 'none' });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(data.slice(0, 12));
  });
  expect(restored).toEqual(before);
});
