import { test, expect, type Page } from '@playwright/test';
import { downloadedProject } from './project-file';

const additiveModifier: 'Meta' | 'Control' =
  process.platform === 'darwin' ? 'Meta' : 'Control';

type Project = {
  history: Array<{
    layers: Array<{ id: string; kind: string; asset?: string; sourceName?: string; linkId?: string; matrix: number[] }>;
    artboards?: Array<{ id: string; name: string; x: number; y: number; w: number; h: number; visible?: boolean; locked?: boolean; layerIds?: string[] }>;
    activeArtboardId?: string;
  }>;
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

test('links selected smart-object contents and propagates replacement while preserving transforms', async ({ page }) => {
  const red = await fixture(page, [255, 0, 0]);
  const blue = await fixture(page, [0, 0, 255]);
  await add(page, 'red-source.png', red);
  await add(page, 'blue-source.png', blue);
  const rows = page.getByRole('button', { name: /^Select layer / });
  await expect(rows).toHaveCount(3);
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: [additiveModifier] });
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Link Smart Object Contents', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Link Smart Object Contents', exact: true }).click();
  await expect(page.getByText(/Linked 2 smart-object layers/)).toBeVisible();
  let out = await project(page);
  let frame = out.history[out.index];
  const linked = frame.layers.filter((layer) => layer.kind === 'smart-object');
  expect(linked).toHaveLength(2);
  expect(linked[0].linkId).toBeTruthy();
  expect(linked[1].linkId).toBe(linked[0].linkId);
  expect(linked[0].asset).toBe(linked[1].asset);
  const transforms = linked.map((layer) => layer.matrix);
  await page.getByRole('button', { name: 'Replace contents', exact: true }).click();
  await page.getByTestId('smart-object-input').setInputFiles({ name: 'green-source.png', mimeType: 'image/png', buffer: Buffer.from(await fixture(page, [0, 255, 0]), 'base64') });
  await expect(page.getByText(/Linked smart-object contents replaced/)).toBeVisible();
  out = await project(page);
  frame = out.history[out.index];
  const replaced = frame.layers.filter((layer) => layer.kind === 'smart-object');
  expect(new Set(replaced.map((layer) => layer.asset)).size).toBe(1);
  expect(replaced.map((layer) => layer.matrix)).toEqual(transforms);
  expect(replaced.every((layer) => layer.sourceName === 'green-source.png')).toBe(true);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  out = await project(page);
  const restoredLinked = out.history[out.index].layers.filter((layer) => layer.kind === 'smart-object');
  expect(restoredLinked.every((layer) => layer.linkId === replaced[0].linkId)).toBe(true);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Unlink Smart Object Contents', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'Unlink Smart Object Contents', exact: true }).click();
  await expect(page.getByText('Unlinked 2 smart-object layers', { exact: true })).toBeVisible();
  out = await project(page);
  expect(out.history[out.index].layers.filter((layer) => layer.kind === 'smart-object').every((layer) => !layer.linkId)).toBe(true);
});

test('replaces a smart object and fits the new contents to the active artboard', async ({ page }) => {
  const red = await fixture(page, [255, 0, 0]);
  const blue = await fixture(page, [0, 0, 255]);
  await add(page, 'red-source.png', red);
  const saved = await project(page);
  const current = saved.history[saved.index];
  const target = current.layers.at(-1)!;
  current.artboards = [{
    id: 'hero', name: 'Hero', x: 100, y: 80, w: 320, h: 200,
    visible: true, locked: false, layerIds: [target.id],
  }];
  current.activeArtboardId = 'hero';
  await page.getByTestId('project-input').setInputFiles({
    name: 'artboard-replace.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.getByText('Project opened with editable layers and history', { exact: true })).toBeVisible();
  await page.getByTestId('artboard-replace-fit').click();
  await page.getByTestId('smart-object-input').setInputFiles({
    name: 'blue-source.png', mimeType: 'image/png', buffer: Buffer.from(blue, 'base64'),
  });
  await expect(page.getByText('Smart object contents replaced and fitted to the active artboard', { exact: true })).toBeVisible();
  const replaced = await project(page);
  const frame = replaced.history[replaced.index];
  const layer = frame.layers.find((item) => item.id === target.id)!;
  expect(layer.sourceName).toBe('blue-source.png');
  expect(layer.matrix[0]).toBeCloseTo(200);
  expect(layer.matrix[3]).toBeCloseTo(200);
  expect(layer.matrix[4]).toBeCloseTo(60);
  expect(layer.matrix[5]).toBeCloseTo(80);
  expect(frame.artboards?.[0].layerIds).toContain(target.id);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  const restored = await project(page);
  const restoredMatrix = restored.history[restored.index].layers.find((item) => item.id === target.id)?.matrix;
  expect(restoredMatrix?.[0]).toBeCloseTo(200);
  expect(restoredMatrix?.[3]).toBeCloseTo(200);
  expect(restoredMatrix?.[4]).toBeCloseTo(60);
  expect(restoredMatrix?.[5]).toBeCloseTo(80);
});
