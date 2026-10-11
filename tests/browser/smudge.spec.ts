import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type Project = {
  settings: Record<string, unknown>;
  history: Array<{ layers: Array<{ kind: string; asset?: string; locked?: boolean }> }>;
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

const fixture = async (page: Page) => page.evaluate(() => {
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 60;
  const context = canvas.getContext('2d')!;
  for (let x = 0; x < canvas.width; x += 1) {
    context.fillStyle = x < 60 ? 'rgba(220,30,40,.78)' : 'rgba(30,70,220,.78)';
    context.fillRect(x, 0, 1, canvas.height);
  }
  return canvas.toDataURL().split(',')[1];
});

const importFixture = async (page: Page) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'smudge-alpha.png',
    mimeType: 'image/png',
    buffer: Buffer.from(await fixture(page), 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '120');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
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

const canvasPoint = async (page: Page, x: number, y = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

const stroke = async (page: Page, startX: number, endX: number, pointerType = 'mouse') => {
  const start = await canvasPoint(page, startX);
  const end = await canvasPoint(page, endX);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 201,
    pointerType,
    pressure: pointerType === 'mouse' ? 1 : 0.7,
    clientX: start.clientX,
    clientY: start.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(90);
  await canvas.dispatchEvent('pointermove', {
    pointerId: 201,
    pointerType,
    pressure: pointerType === 'mouse' ? 1 : 0.7,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 201,
    pointerType,
    pressure: pointerType === 'mouse' ? 1 : 0.7,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('R cycles Rotate View and Smudge and its Flow setting survives a local draft round trip', async ({ page }) => {
  await importFixture(page);
  await selectTool(page, 'Smudge');
  await expect(page.getByRole('button', { name: 'Smudge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Rotate View tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Shift+r');
  await expect(page.getByRole('button', { name: 'Smudge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Flow', { exact: true }).fill('57');
  const saved = await project(page);
  expect(saved.settings).toMatchObject({ tool: 'smudge', brushOpacity: 57 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Smudge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Flow', { exact: true })).toHaveValue('57');
});

test('Smudge moves representative colour while preserving alpha, undo/redo and reload', async ({ page }) => {
  await importFixture(page);
  const before = await project(page);
  const id = (value: Project) => value.history[value.index].layers.at(-1)!.asset!;
  const beforePixels = await sample(page, before.assets[id(before)]!, [{ x: 0.52 }, { x: 0.76 }]);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Size', { exact: true }).fill('36');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Flow', { exact: true }).fill('100');
  await stroke(page, 0.35, 0.67);
  const after = await project(page);
  const afterPixels = await sample(page, after.assets[id(after)]!, [{ x: 0.52 }, { x: 0.76 }]);
  expect(after.index).toBe(before.index + 1);
  expect(afterPixels[0][0]).toBeGreaterThan(beforePixels[0][0]);
  expect(afterPixels[0][3]).toBe(beforePixels[0][3]);
  expect(afterPixels[1]).toEqual(beforePixels[1]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.locator('footer')).toContainText('Undo');
  expect((await project(page)).history[(await project(page)).index].layers.at(-1)!.asset).toBe(id(before));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.locator('footer')).toContainText('Redo');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.assets[id(reloaded)]!.w).toBe(after.assets[id(after)]!.w);
  expect(reloaded.assets[id(reloaded)]!.h).toBe(after.assets[id(after)]!.h);
  expect(await sample(page, reloaded.assets[id(reloaded)]!, [{ x: 0.52 }, { x: 0.76 }]))
    .toEqual(afterPixels);
});

test('Smudge selection alpha protects unselected pixels and a stationary tap is a no-op', async ({ page }) => {
  await importFixture(page);
  await selectTool(page, 'Select');
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.85, { steps: 3 });
  await page.mouse.up();
  const selected = await project(page);
  const activeAsset = (value: Project) => {
    const frame = value.history[value.index];
    return value.assets[frame.layers.at(-1)!.asset!]!;
  };
  const samplePoints = [{ x: 0.52 }, { x: 0.62 }, { x: 0.15 }];
  const selectedPixels = await sample(page, activeAsset(selected), samplePoints);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Size', { exact: true }).fill('32');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Flow', { exact: true }).fill('100');
  // Cross the colour edge and the selection's right boundary. The brush
  // would smear the blue pixel at .62 without UI selection-mask sampling.
  await stroke(page, 0.35, 0.67);
  const changed = await project(page);
  const changedPixels = await sample(page, activeAsset(changed), samplePoints);
  expect(changed.history.length).toBe(selected.history.length + 1);
  expect(changedPixels[0][0]).toBeGreaterThan(selectedPixels[0][0]);
  expect(changedPixels[0][3]).toBe(selectedPixels[0][3]);
  expect(changedPixels[1]).toEqual(selectedPixels[1]);
  expect(changedPixels[2]).toEqual(selectedPixels[2]);
  await selectTool(page, 'Smudge');
  const point = await canvasPoint(page, 0.8);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 202, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 202, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('No Smudge change applied');
  expect((await project(page)).history.length).toBe(changed.history.length);
});

test('Smudge rejects locked layers and touch cancellation without committing', async ({ page }) => {
  await importFixture(page);
  await selectTool(page, 'Smudge');
  await page.getByLabel('Lock layer', { exact: true }).check();
  const lockedBefore = await project(page);
  await stroke(page, 0.3, 0.7, 'touch');
  await expect(page.locator('footer')).toContainText('visible, unlocked raster layer');
  expect((await project(page)).history.length).toBe(lockedBefore.history.length);
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  const before = await project(page);
  const canvas = page.getByTestId('editor-canvas');
  const start = await canvasPoint(page, 0.3), end = await canvasPoint(page, 0.7);
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 203, pointerType: 'touch', pressure: 0.6, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(90);
  await canvas.dispatchEvent('pointermove', { pointerId: 203, pointerType: 'touch', pressure: 0.6, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 203, pointerType: 'touch', pressure: 0, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Gesture cancelled');
  expect((await project(page)).history.length).toBe(before.history.length);
});
