import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

type Project = {
  history: Array<{ layers: Array<{ id: string; kind: string; asset?: string; sourceName?: string; matrix: number[] }> }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const prepare = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};

const sample = (page: Page, x: number, y: number) =>
  page.getByTestId('editor-canvas').evaluate((canvas, point) =>
    Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });

const add = async (page: Page, name: string, png: string) => {
  await page.getByRole('button', { name: 'Add smart object', exact: true }).click();
  await page.getByTestId('smart-object-input').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText('Embedded smart object added', { exact: true })).toBeVisible();
};

const fixture = (page: Page, color: [number, number, number]) =>
  page.evaluate((rgb) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = `rgb(${rgb.join(',')})`;
    context.fillRect(0, 0, 2, 1);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);

test.beforeEach(async ({ page }) => prepare(page));

test('embeds, transforms, replaces and rasterizes a source-retaining smart object', async ({ page }) => {
  const red = await fixture(page, [255, 0, 0]);
  const blue = await fixture(page, [0, 0, 255]);
  await add(page, 'red-source.png', red);
  const initial = await project(page);
  const initialLayer = initial.history[initial.index].layers.at(-1)!;
  expect(initialLayer.kind).toBe('smart-object');
  expect(initialLayer.sourceName).toBe('red-source.png');
  expect(initialLayer.asset).toBeTruthy();
  expect(initial.assets[initialLayer.asset!]).toBeTruthy();
  const id = initialLayer.id;
  const sourceAsset = initialLayer.asset;
  await expect.poll(() => sample(page, 0, 0)).toEqual([255, 0, 0, 255]);

  await page.getByLabel('Layer X', { exact: true }).fill('24');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  await expect(page.getByText('Layer updated', { exact: true })).toBeVisible();
  const moved = await project(page);
  expect(moved.history[moved.index].layers.at(-1)!.matrix[4]).toBe(24);
  expect(moved.history[moved.index].layers.at(-1)!.asset).toBe(sourceAsset);

  await page.getByRole('button', { name: 'Replace contents', exact: true }).click();
  await page.getByTestId('smart-object-input').setInputFiles({ name: 'blue-source.png', mimeType: 'image/png', buffer: Buffer.from(blue, 'base64') });
  await expect(page.getByText('Smart object contents replaced; transform and edits preserved', { exact: true })).toBeVisible();
  const replaced = await project(page);
  const replacementLayer = replaced.history[replaced.index].layers.at(-1)!;
  expect(replacementLayer.kind).toBe('smart-object');
  expect(replacementLayer.id).toBe(id);
  expect(replacementLayer.sourceName).toBe('blue-source.png');
  expect(replacementLayer.matrix[4]).toBe(24);
  expect(replacementLayer.asset).toBeTruthy();
  await page.getByRole('button', { name: 'Rasterize layer', exact: true }).click();
  await expect(page.getByText('Layer rasterized. Undo restores editable content.', { exact: true })).toBeVisible();
  const rasterized = await project(page);
  expect(rasterized.history[rasterized.index].layers.at(-1)!.kind).toBe('raster');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.kind).toBe('smart-object');
  expect(undone.history[undone.index].layers.at(-1)!.sourceName).toBe('blue-source.png');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await project(page);
  expect(restored.history[restored.index].layers.at(-1)!.kind).toBe('smart-object');
  expect(restored.history[restored.index].layers.at(-1)!.matrix[4]).toBe(24);
});

test('menu commands expose bounded smart-object lifecycle', async ({ page }) => {
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'New Smart Object…', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Replace Contents…', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Rasterize', exact: true })).toBeVisible();
});
