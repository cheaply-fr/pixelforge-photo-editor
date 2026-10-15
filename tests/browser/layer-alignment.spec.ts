import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type ProjectLayer = {
  name: string;
  kind?: string;
  width?: number;
  stroke?: number;
  asset?: unknown;
  groupId?: string;
  matrix: number[];
};
type ProjectFrame = { w: number; layers: ProjectLayer[]; groups?: Array<Record<string, unknown>> };

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    history: ProjectFrame[];
    index: number;
  };
};

const waitForReady = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const drawShape = async (page: Page, x: number, y: number, width: number, height: number) => {
  await selectTool(page, 'Shape');
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x + width), box.y + box.height * (y + height), { steps: 4 });
  await page.mouse.up();
};
const selectShape = async (page: Page, index: number) => {
  const rows = page.getByRole('button', { name: /^Select layer Shape/ });
  await expect(rows).toHaveCount(3);
  await rows.nth(index).click();
};

test.beforeEach(async ({ page }) => waitForReady(page));

test('canvas alignment changes only layer translation and survives undo/reload', async ({ page }) => {
  await drawShape(page, 0.1, 0.1, 0.08, 0.06);
  await page.getByLabel('Layer X', { exact: true }).fill('120');
  await page.getByLabel('Layer X', { exact: true }).press('Enter');
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  expect(beforeLayer.kind).toBe('rectangle');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Align Right', exact: true }).click();
  const aligned = await project(page);
  const alignedLayer = aligned.history[aligned.index].layers.at(-1)!;
  expect(alignedLayer.matrix[0]).toBe(1);
  expect(alignedLayer.matrix[1]).toBe(0);
  expect(alignedLayer.matrix[2]).toBe(0);
  expect(alignedLayer.matrix[3]).toBe(1);
  expect(alignedLayer.matrix[4] + Number(alignedLayer.width) + Number(alignedLayer.stroke || 0) / 2).toBe(before.history[before.index].w);
  expect(alignedLayer.matrix[5]).toBe(beforeLayer.matrix[5]);
  expect(alignedLayer.width).toBe(beforeLayer.width);
  expect(alignedLayer.asset).toBeUndefined();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.matrix).toEqual(beforeLayer.matrix);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.matrix).toEqual(alignedLayer.matrix);
});

test('folder distribution spaces three visible layers and leaves outer layers fixed on desktop and mobile', async ({ page }) => {
  await drawShape(page, 0.08, 0.1, 0.06, 0.05);
  await drawShape(page, 0.36, 0.18, 0.08, 0.05);
  await drawShape(page, 0.68, 0.12, 0.07, 0.06);
  await page.getByRole('button', { name: 'Group active layer', exact: true }).click();
  await selectShape(page, 1);
  await page.getByLabel('Layer folder', { exact: true }).selectOption({ label: 'Group 1' });
  await selectShape(page, 2);
  await page.getByLabel('Layer folder', { exact: true }).selectOption({ label: 'Group 1' });
  await selectShape(page, 0);
  await expect(page.getByRole('button', { name: 'Distribute horizontally', exact: true })).toBeEnabled();
  const before = await project(page);
  const beforeLayers = before.history[before.index].layers;
  const byName = (name: string) => beforeLayers.find((layer) => layer.name === name)!;
  const firstBefore = byName('Shape 1').matrix;
  const lastBefore = byName('Shape 3').matrix;
  await page.getByRole('button', { name: 'Distribute horizontally', exact: true }).click();
  const distributed = await project(page);
  const layers = distributed.history[distributed.index].layers;
  expect(layers.find((layer) => layer.name === 'Shape 1')!.matrix).toEqual(firstBefore);
  expect(layers.find((layer) => layer.name === 'Shape 3')!.matrix).toEqual(lastBefore);
  expect(layers.find((layer) => layer.name === 'Shape 2')!.matrix[4]).toBeGreaterThan(340);
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].groups).toHaveLength(1);
  expect(reloaded.history[reloaded.index].layers.find((layer) => layer.name === 'Shape 2')!.groupId).toBe(
    reloaded.history[reloaded.index].groups![0].id,
  );
});

test('selected root layers distribute without requiring a folder', async ({ page }) => {
  await drawShape(page, 0.08, 0.1, 0.06, 0.05);
  await drawShape(page, 0.34, 0.18, 0.08, 0.05);
  await drawShape(page, 0.72, 0.12, 0.07, 0.06);
  const rows = page.getByRole('button', { name: /^Select layer Shape/ });
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Distribute horizontally', exact: true })).toBeEnabled();
  const before = await project(page);
  const layersBefore = before.history[before.index].layers;
  await page.getByRole('button', { name: 'Distribute horizontally', exact: true }).click();
  const after = await project(page);
  const layersAfter = after.history[after.index].layers;
  expect(layersAfter.filter((layer) => layer.name.startsWith('Shape'))).toHaveLength(3);
  expect(layersAfter.find((layer) => layer.name === 'Shape 2')!.matrix[4]).not.toBe(
    layersBefore.find((layer) => layer.name === 'Shape 2')!.matrix[4],
  );
});
