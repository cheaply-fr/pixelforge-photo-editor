import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{ layers: Array<{ kind: string; asset?: string }> }>;
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
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  return await downloadedProject(file!) as Project;
};

const newPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
};

const canvasPoint = async (page: Page, x: number, y = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

const dispatchStroke = async (
  page: Page,
  startX: number,
  endX: number,
  pointerType = 'mouse',
) => {
  const start = await canvasPoint(page, startX);
  const end = await canvasPoint(page, endX);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType,
    pressure: pointerType === 'mouse' ? 1 : 0.7,
    clientX: start.clientX,
    clientY: start.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', {
    pointerId: 71,
    pointerType,
    pressure: pointerType === 'mouse' ? 1 : 0.7,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 71,
    pointerType,
    pressure: pointerType === 'mouse' ? 1 : 0.7,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const sample = async (page: Page, asset: Asset, points: Array<{ x: number; y?: number }>) =>
  page.evaluate(async ({ asset, points }) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return points.map(({ x, y = 0.5 }) => {
      const px = Math.max(0, Math.min(asset.w - 1, Math.floor(asset.w * x)));
      const py = Math.max(0, Math.min(asset.h - 1, Math.floor(asset.h * y)));
      return Array.from(context.getImageData(px, py, 1, 1).data);
    });
  }, { asset, points });

const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');

test.beforeEach(async ({ page }) => openEditor(page));

test('E cycles the three eraser tools and persists the selected tool and tolerance', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Eraser');
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Background Eraser tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Color tolerance', { exact: true }).fill('41');
  await page.getByRole('button', { name: 'Background Eraser tool', exact: true }).focus();
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: 'Magic Eraser tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Color tolerance', { exact: true })).toHaveValue('41');
  const savedProject = await project(page);
  expect(savedProject.settings).toMatchObject({ tool: 'magic-eraser', colorTolerance: 41 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Magic Eraser tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Color tolerance', { exact: true })).toHaveValue('41');
  await saved(page);
});

test('Magic Eraser removes only the sampled connected island and undo/redo/reload preserve pixels', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#ffffff');
  await selectTool(page, 'Fill');
  const center = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 72, pointerType: 'mouse', pressure: 1, clientX: center.clientX, clientY: center.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await page.getByLabel('Drawing color', { exact: true }).fill('#e31b23');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('90');
  await dispatchStroke(page, 0.25, 0.28);
  await dispatchStroke(page, 0.72, 0.75);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  const beforeAsset = before.assets[beforeLayer.asset!]!;
  const [firstBefore, secondBefore, backgroundBefore] = await sample(page, beforeAsset, [
    { x: 0.25 },
    { x: 0.72 },
    { x: 0.5 },
  ]);
  expect(firstBefore[3]).toBeGreaterThan(200);
  expect(secondBefore[3]).toBeGreaterThan(200);
  expect(backgroundBefore.slice(0, 3)).toEqual([255, 255, 255]);

  await selectTool(page, 'Magic Eraser');
  await page.getByLabel('Color tolerance', { exact: true }).fill('0');
  const target = await canvasPoint(page, 0.25);
  await canvas.dispatchEvent('pointerdown', { pointerId: 73, pointerType: 'mouse', pressure: 1, clientX: target.clientX, clientY: target.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Magic Eraser removed', { timeout: 10000 });
  const erased = await project(page);
  const erasedLayer = erased.history[erased.index].layers.at(-1)!;
  const erasedAsset = erased.assets[erasedLayer.asset!]!;
  const [firstAfter, secondAfter, backgroundAfter] = await sample(page, erasedAsset, [
    { x: 0.25 },
    { x: 0.72 },
    { x: 0.5 },
  ]);
  expect(firstAfter[3]).toBe(0);
  expect(secondAfter[3]).toBeGreaterThan(200);
  expect(backgroundAfter).toEqual(backgroundBefore);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await saved(page);
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.asset).toBe(beforeLayer.asset);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await saved(page);
  await page.reload();
  await saved(page);
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(erasedLayer.asset);
});

test('Background Eraser samples a background color, keeps foreground pixels, and cancels without a commit', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#f5f5f5');
  await selectTool(page, 'Fill');
  const center = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 74, pointerType: 'mouse', pressure: 1, clientX: center.clientX, clientY: center.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await page.getByLabel('Drawing color', { exact: true }).fill('#1e50c8');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('90');
  await dispatchStroke(page, 0.5, 0.54);
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  const beforeAsset = before.assets[beforeLayer.asset!]!;
  const [backgroundBefore, foregroundBefore] = await sample(page, beforeAsset, [
    { x: 0.15, y: 0.5 },
    { x: 0.52, y: 0.5 },
  ]);
  expect(backgroundBefore[3]).toBe(255);
  expect(foregroundBefore[2]).toBeGreaterThan(150);

  await page.getByLabel('Lock layer', { exact: true }).check();
  await selectTool(page, 'Background Eraser');
  await dispatchStroke(page, 0.15, 0.25);
  await expect(page.locator('footer')).toContainText('visible, unlocked raster layer');
  const locked = await project(page);
  expect(locked.history.length).toBe(before.history.length + 1);
  expect(locked.history[locked.index].layers.at(-1)!.asset).toBe(beforeLayer.asset);
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  const unlocked = await project(page);

  await page.getByLabel('Size', { exact: true }).fill('100');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Color tolerance', { exact: true }).fill('0');
  await dispatchStroke(page, 0.15, 0.25, 'touch');
  await expect(page.locator('footer')).toContainText('Background Eraser stroke applied', { timeout: 10000 });
  const erased = await project(page);
  const erasedLayer = erased.history[erased.index].layers.at(-1)!;
  const erasedAsset = erased.assets[erasedLayer.asset!]!;
  const [backgroundAfter, foregroundAfter] = await sample(page, erasedAsset, [
    { x: 0.15, y: 0.5 },
    { x: 0.52, y: 0.5 },
  ]);
  expect(backgroundAfter[3]).toBe(0);
  expect(foregroundAfter[2]).toBeGreaterThan(150);
  expect(erased.history.length).toBe(unlocked.history.length + 1);

  const beforeCancel = await project(page);
  const cancelPoint = await canvasPoint(page, 0.86);
  await canvas.dispatchEvent('pointerdown', { pointerId: 75, pointerType: 'touch', pressure: 0, clientX: cancelPoint.clientX, clientY: cancelPoint.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 75, pointerType: 'touch', pressure: 0, clientX: cancelPoint.clientX - 50, clientY: cancelPoint.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 75, pointerType: 'touch', pressure: 0, clientX: cancelPoint.clientX - 50, clientY: cancelPoint.clientY, buttons: 0, isPrimary: true });
  await saved(page);
  const afterCancel = await project(page);
  expect(afterCancel.history.length).toBe(beforeCancel.history.length);
  await page.reload();
  await saved(page);
  const reloaded = await project(page);
  expect(reloaded.history[reloaded.index].layers.at(-1)!.asset).toBe(erasedLayer.asset);
});
