import { test, expect, type Page } from '@playwright/test';

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
    name: 'clouds-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute(
    'data-rendering',
    'false',
  );
}

async function downloadProject(page: Page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const path = await (await pending).path();
  return JSON.parse(
    await (await import('node:fs/promises')).readFile(path!, 'utf8'),
  ) as {
    assets: Record<string, unknown>;
    history: Array<{
      layers: Array<{
        asset?: string;
        adjustments: { filterEffects?: Record<string, unknown> };
      }>;
    }>;
    index: number;
  };
}

const pixel = (page: Page, x: number, y: number) =>
  page
    .getByTestId('editor-canvas')
    .evaluate(
      (canvas: HTMLCanvasElement, point) =>
        Array.from(
          canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data,
        ),
      { x, y },
    );

test('Clouds is source-safe, editable and round-trips on desktop and mobile', async ({
  page,
}) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixel(page, 4, 2);

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Clouds', exact: true }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(
    'clouds',
  );
  await expect(page.getByLabel('Cloud scale', { exact: true })).toHaveValue(
    '16',
  );
  await expect.poll(() => pixel(page, 4, 2)).not.toEqual(original);

  await page.getByLabel('Cloud scale', { exact: true }).press('ArrowRight');
  await page.getByLabel('Cloud seed', { exact: true }).fill('4294967295');
  const changed = await pixel(page, 4, 2);
  const adjusted = await downloadProject(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(layer.adjustments.filterEffects).toMatchObject({
    type: 'clouds',
    amount: 85,
    radius: 17,
    seed: 4294967295,
  });
  expect(await pixel(page, 0, 0)).toEqual([0, 0, 0, 0]);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(
    'clouds',
  );
  await expect(page.getByLabel('Cloud scale', { exact: true })).toHaveValue(
    '17',
  );
  await expect(page.getByLabel('Cloud seed', { exact: true })).toHaveValue(
    '4294967295',
  );
  await expect.poll(() => pixel(page, 4, 2)).toEqual(changed);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Cloud seed', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(
    'clouds',
  );
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Clear local filter effect', exact: true })
    .click();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue(
    'none',
  );
});
