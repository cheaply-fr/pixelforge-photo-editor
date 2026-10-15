import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

test('Adaptive Wide Angle is enabled, editable and source-safe across reload and project round-trip', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixels(page);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Adaptive Wide Angle…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('adaptive-wide-angle');
  await expect(page.getByLabel('Guide angle', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Optical centre X', { exact: true })).toHaveValue('50');
  await expect.poll(() => pixels(page)).not.toEqual(original);

  await page.getByLabel('Guide angle', { exact: true }).fill('32');
  await page.getByLabel('Guide angle', { exact: true }).press('Enter');
  await page.getByLabel('Optical centre X', { exact: true }).fill('38');
  await page.getByLabel('Optical centre X', { exact: true }).press('Enter');
  const changed = await pixels(page);
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({
    type: 'adaptive-wide-angle', amount: 72, radius: 48, angle: 32, centerX: 0.38,
  });
  expect(changed).not.toEqual(original);
  expect(await pixel(page, 0, 0)).toEqual([0, 0, 0, 0]);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('adaptive-wide-angle');
  await expect(page.getByLabel('Guide angle', { exact: true })).toHaveValue('32');
  await expect(page.getByLabel('Optical centre X', { exact: true })).toHaveValue('38');
  await expect.poll(() => pixels(page)).toEqual(changed);
  await openProject(page, adjusted);
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('adaptive-wide-angle');
  await expect.poll(() => pixels(page)).toEqual(changed);
});

async function importPixels(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(9, 5);
    for (let y = 0; y < 5; y += 1)
      for (let x = 0; x < 9; x += 1) {
        const offset = (y * 9 + x) * 4;
        data.data[offset] = x * 22;
        data.data[offset + 1] = y * 38;
        data.data[offset + 2] = (x + y) * 12;
        data.data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
      }
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'adaptive-wide-angle-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const path = await (await pending).path();
  return await downloadedProject(path!) as {
    assets: Record<string, unknown>;
    history: Array<{ layers: Array<{ asset?: string; adjustments: { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

async function openProject(page: Page, project: object) {
  await page.getByTestId('project-input').setInputFiles({
    name: 'adaptive-wide-angle.pixelforge.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
}

const pixels = (page: Page) =>
  page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data),
  );

const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) =>
      Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );

