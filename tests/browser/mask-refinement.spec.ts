import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type Project = {
  history: Array<{
    layers: Array<{ kind: string; asset?: string; mask?: string }>;
  }>;
  index: number;
  assets: Record<string, Asset>;
};

const openEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const file = await (await pending).path();
  return await downloadedProject(file!) as Project;
};

const fixture = [
  [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 180], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [210, 40, 30, 255], [210, 40, 30, 255], [210, 40, 30, 255], [40, 40, 40, 255],
  [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255], [40, 40, 40, 255],
];

const importFixture = async (page: Page) => {
  const encoded = await page.evaluate((values) => {
    const canvas = document.createElement('canvas');
    canvas.width = 5;
    canvas.height = 5;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(5, 5);
    values.flat().forEach((value, index) => { image.data[index] = value; });
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, fixture);
  await page.getByTestId('file-input').setInputFiles({
    name: 'mask-refinement-fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from(encoded, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
};

const sampleAsset = async (page: Page, asset: Asset, points: Array<[number, number]>) =>
  page.evaluate(async ({ asset, points }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
  }, { asset, points });

const clickCanvasPoint = async (page: Page, x: number, y: number) => {
  const box = await page.getByTestId('editor-canvas').boundingBox();
  expect(box).toBeTruthy();
  const canvas = page.getByTestId('editor-canvas'),
    clientX = box!.x + (x + 0.5) * box!.width / 5,
    clientY = box!.y + (y + 0.5) * box!.height / 5;
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 901,
    pointerType: 'mouse',
    pressure: 1,
    clientX,
    clientY,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(100);
  await canvas.dispatchEvent('pointerup', {
    pointerId: 901,
    pointerType: 'mouse',
    pressure: 1,
    clientX,
    clientY,
    buttons: 0,
    isPrimary: true,
  });
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Mask Brush reveals and Mask Eraser conceals alpha nondestructively with undo and reload', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Background…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Background removed nondestructively', { timeout: 10000 });
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  const originalSource = before.assets[beforeLayer.asset!];
  const originalMask = before.assets[beforeLayer.mask!];
  const [edgeBefore, centerBefore] = await sampleAsset(page, originalMask, [[0, 0], [2, 2]]);
  expect(edgeBefore[3]).toBe(0);
  expect(centerBefore[3]).toBe(255);

  await selectTool(page, 'Mask Brush');
  await page.getByLabel('Size', { exact: true }).fill('2');
  await clickCanvasPoint(page, 0, 0);
  await expect(page.locator('footer')).toContainText('Mask Brush revealed masked pixels');
  const revealed = await project(page);
  const revealedLayer = revealed.history[revealed.index].layers.at(-1)!;
  expect(revealedLayer.asset).toBe(beforeLayer.asset);
  expect(revealed.assets[revealedLayer.asset!]).toEqual(originalSource);
  const [edgeAfterReveal] = await sampleAsset(page, revealed.assets[revealedLayer.mask!], [[0, 0]]);
  expect(edgeAfterReveal[3]).toBeGreaterThan(0);

  await selectTool(page, 'Mask Eraser');
  await clickCanvasPoint(page, 2, 2);
  await expect(page.locator('footer')).toContainText('Mask Eraser concealed pixels');
  const concealed = await project(page);
  const concealedLayer = concealed.history[concealed.index].layers.at(-1)!;
  const [, centerAfterConceal] = await sampleAsset(page, concealed.assets[concealedLayer.mask!], [[0, 0], [2, 2]]);
  expect(centerAfterConceal[3]).toBe(0);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  const undone = await project(page);
  const undoneLayer = undone.history[undone.index].layers.at(-1)!;
  const [, centerAfterUndo] = await sampleAsset(page, undone.assets[undoneLayer.mask!], [[0, 0], [2, 2]]);
  expect(centerAfterUndo[3]).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('data-rendering', 'false');
  const reloaded = await project(page);
  const reloadedLayer = reloaded.history[reloaded.index].layers.at(-1)!;
  expect(reloadedLayer.asset).toBe(undoneLayer.asset);
  const [reloadedCenter] = await sampleAsset(page, reloaded.assets[reloadedLayer.mask!], [[2, 2]]);
  expect(reloadedCenter[3]).toBeGreaterThan(0);
});

test('mask refinement refuses missing masks and locked layers without changing the draft', async ({ page }) => {
  await importFixture(page);
  await selectTool(page, 'Mask Brush');
  await clickCanvasPoint(page, 2, 2);
  await expect(page.locator('footer')).toContainText('Create a layer mask or remove a background before refining');
  const before = await project(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Background…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Background removed nondestructively', { timeout: 10000 });
  await page.getByLabel('Lock layer', { exact: true }).check();
  await clickCanvasPoint(page, 2, 2);
  await expect(page.locator('footer')).toContainText('visible, unlocked raster layer');
  const after = await project(page);
  expect(after.history[after.index].layers.at(-1)!.asset).toBe(before.history[before.index].layers.at(-1)!.asset);
  expect(after.history[after.index].layers.at(-1)!.mask).toBeTruthy();
});

test('touch cancellation discards a mask preview without growing history', async ({ page }) => {
  await importFixture(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remove Background…', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Background removed nondestructively', { timeout: 10000 });
  const before = await project(page);
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await selectTool(page, 'Mask Eraser');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  const point = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 902,
    pointerType: 'touch',
    pressure: 0.7,
    clientX: point.x,
    clientY: point.y,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(100);
  await canvas.dispatchEvent('pointermove', {
    pointerId: 902,
    pointerType: 'touch',
    pressure: 0.7,
    clientX: point.x + 40,
    clientY: point.y,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointercancel', {
    pointerId: 902,
    pointerType: 'touch',
    pressure: 0,
    clientX: point.x + 40,
    clientY: point.y,
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  const afterLayer = after.history[after.index].layers.at(-1)!;
  expect(afterLayer.asset).toBe(beforeLayer.asset);
  expect(afterLayer.mask).toBe(beforeLayer.mask);
});
