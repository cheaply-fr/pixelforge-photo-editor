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

async function importPixels(page: Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const data = context.createImageData(9, 5);
    for (let y = 0; y < 5; y += 1) for (let x = 0; x < 9; x += 1) {
      const offset = (y * 9 + x) * 4;
      const edge = x < 4 ? [42, 78, 118] : [218, 34, 48];
      const noise = ((x * 17 + y * 29) % 9) - 4;
      data.data[offset] = edge[0] + noise * 3;
      data.data[offset + 1] = edge[1] + noise * 2;
      data.data[offset + 2] = edge[2] + noise;
      data.data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
    }
    context.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByTestId('file-input').setInputFiles({
    name: 'ai-denoise-fixture.png', mimeType: 'image/png', buffer: Buffer.from(encoded, 'base64'),
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

const pixels = (page: Page) => page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) =>
  Array.from(canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data));

test('AI Denoise is an explicit local approximation with nondestructive round-trip controls', async ({ page }) => {
  await importPixels(page);
  const before = await downloadProject(page);
  const sourceLayer = before.history[before.index].layers.at(-1)!;
  const sourceAsset = sourceLayer.asset!;
  const original = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'AI Denoise…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  await expect(page.getByText('AI Denoise (deterministic local approximation) applied; remains editable in Filter effects', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('ai-denoise');
  await expect(page.getByText('No model is downloaded and no pixels leave the device', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Denoise radius', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Detail protection', { exact: true })).toHaveValue('50');
  await expect(page.getByLabel('Chroma smoothing', { exact: true })).toHaveValue('65');
  await expect.poll(() => pixels(page)).not.toEqual(original);
  expect((await page.getByTestId('editor-canvas').evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data)))[3]).toBe(0);

  await page.getByLabel('Detail protection', { exact: true }).fill('22');
  await page.getByLabel('Chroma smoothing', { exact: true }).fill('91');
  await page.getByLabel('Denoise radius', { exact: true }).fill('4');
  const changed = await pixels(page);
  const adjusted = await downloadProject(page);
  const adjustedLayer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(adjustedLayer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset]).toEqual(before.assets[sourceAsset]);
  expect(adjustedLayer.adjustments.filterEffects).toMatchObject({
    type: 'ai-denoise', amount: 100, radius: 4, aiDenoise: { detail: 22, chroma: 91 },
  });
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('ai-denoise');
  await expect(page.getByLabel('Detail protection', { exact: true })).toHaveValue('22');
  await expect(page.getByLabel('Chroma smoothing', { exact: true })).toHaveValue('91');
  await expect.poll(() => pixels(page)).toEqual(changed);
});
