import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
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
    name: 'filter-fixture.png',
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
  return JSON.parse(await (await import('node:fs/promises')).readFile(path!, 'utf8')) as {
    assets: Record<string, unknown>;
    history: Array<{ layers: Array<{ asset?: string; adjustments: { filterEffects?: Record<string, unknown> } }> }>;
    index: number;
  };
}

const pixel = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) =>
      Array.from(canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data),
    { x, y },
  );

test('Field Blur is a nondestructive menu effect with source-safe persistence', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset;
  const sourcePixel = await pixel(page, 1, 0);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const fieldBlur = page.getByRole('menuitem', { name: 'Field Blur…', exact: true });
  await expect(fieldBlur).toBeEnabled();
  await fieldBlur.click();
  await expect(page.getByText('Field Blur applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect.poll(() => pixel(page, 1, 0)).not.toEqual(sourcePixel);
  expect((await pixel(page, 0, 0))[3]).toBe(0);

  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({ type: 'field-blur' });
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('field-blur');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect.poll(() => pixel(page, 1, 0)).toEqual(sourcePixel);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('none');
});

test('Mosaic, Tilt-Shift, Ripple and Twirl commands expose editable effect metadata', async ({ page }) => {
  await importPixels(page);
  for (const [menuLabel, type] of [
    ['Mosaic…', 'mosaic'],
    ['Tilt-Shift…', 'tilt-shift'],
    ['Ripple…', 'ripple'],
    ['Twirl…', 'twirl'],
  ] as const) {
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('menuitem', { name: menuLabel, exact: true }).click();
    await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(type);
    const project = await downloadProject(page);
    expect(project.history[project.index].layers.at(-1)!.adjustments.filterEffects).toMatchObject({ type });
  }
});
