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

const stroke = async (page: Page, startX: number, endX: number, pointerType = 'mouse') => {
  const start = await canvasPoint(page, startX), end = await canvasPoint(page, endX);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 181, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.65, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', { pointerId: 181, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.65, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 181, pointerType, pressure: pointerType === 'mouse' ? 1 : 0.65, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
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

test.beforeEach(async ({ page }) => openEditor(page));

test('O cycles Dodge, Burn and Sponge with persisted tonal options and project settings', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Dodge');
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: 'Burn tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Exposure', { exact: true }).fill('63');
  await page.getByLabel('Tonal range', { exact: true }).selectOption('highlights');
  await page.getByRole('button', { name: 'Burn tool', exact: true }).focus();
  await page.keyboard.press('o');
  await expect(page.getByRole('button', { name: 'Sponge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Sponge mode', { exact: true }).selectOption('desaturate');
  await page.getByLabel('Vibrance', { exact: true }).fill('77');
  const saved = await project(page);
  expect(saved.settings).toMatchObject({ tool: 'sponge', tonalExposure: 63, tonalRange: 'highlights', spongeMode: 'desaturate', spongeVibrance: 77 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sponge tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Sponge mode', { exact: true })).toHaveValue('desaturate');
  await expect(page.getByLabel('Vibrance', { exact: true })).toHaveValue('77');
});

test('Dodge brightens and Burn darkens representative pixels with undo/redo and reload', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#808080');
  await selectTool(page, 'Fill');
  const point = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 182, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  const before = await project(page);
  const beforeLayer = before.history[before.index].layers.at(-1)!;
  const beforePixel = (await sample(page, before.assets[beforeLayer.asset!]!, [{ x: 0.5 }]))[0];
  await selectTool(page, 'Dodge');
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Exposure', { exact: true }).fill('40');
  await stroke(page, 0.5, 0.55);
  const dodged = await project(page);
  const dodgePixel = (await sample(page, dodged.assets[dodged.history[dodged.index].layers.at(-1)!.asset!]!, [{ x: 0.5 }]))[0];
  expect(dodgePixel[0]).toBeGreaterThan(beforePixel[0]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.locator('footer')).toContainText('Undo');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.locator('footer')).toContainText('Redo');
  await selectTool(page, 'Burn');
  await stroke(page, 0.5, 0.55);
  const burned = await project(page);
  const burnPixel = (await sample(page, burned.assets[burned.history[burned.index].layers.at(-1)!.asset!]!, [{ x: 0.5 }]))[0];
  expect(burnPixel[0]).toBeLessThan(dodgePixel[0]);
  await page.reload();
  const reloaded = await project(page);
  expect(reloaded.history.length).toBe(burned.history.length);
});

for (const mode of ['saturate', 'desaturate'] as const) {
  test(`Sponge ${mode} Flow scales pixel strength and survives undo, reload and project reopen`, async ({ page }) => {
    const fixture = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'rgba(128, 96, 64, 0.75)';
      context.fillRect(0, 0, 160, 100);
      return canvas.toDataURL().split(',')[1];
    });
    await page.getByTestId('file-input').setInputFiles({
      name: 'sponge-alpha.png', mimeType: 'image/png', buffer: Buffer.from(fixture, 'base64'),
    });
    await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '200');
    const assetId = (value: Project) => value.history[value.index].layers.at(-1)!.asset!;
    const points = [{ x: 0.5 }, { x: 0.1 }, { x: 0.9 }];
    const before = await project(page);
    const beforePixels = await sample(page, before.assets[assetId(before)]!, points);
    expect(beforePixels[0][3]).toBeGreaterThan(0);
    expect(beforePixels[0][3]).toBeLessThan(255);
    expect(beforePixels[2][3]).toBe(0);
    await selectTool(page, 'Sponge');
    await page.getByLabel('Size', { exact: true }).fill('40');
    await page.getByLabel('Hardness', { exact: true }).fill('100');
    await page.getByLabel('Sponge mode', { exact: true }).selectOption(mode);
    await page.getByLabel('Vibrance', { exact: true }).fill('60');
    await page.getByLabel('Flow', { exact: true }).fill('20');
    await stroke(page, 0.5, 0.52);
    const lowFlow = await project(page);
    const lowPixels = await sample(page, lowFlow.assets[assetId(lowFlow)]!, points);
    expect(lowFlow.index).toBe(before.index + 1);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    const undone = await project(page);
    expect(assetId(undone)).toBe(assetId(before));
    expect(await sample(page, undone.assets[assetId(undone)]!, points)).toEqual(beforePixels);
    await page.getByLabel('Flow', { exact: true }).fill('100');
    await stroke(page, 0.5, 0.52, 'touch');
    const fullFlow = await project(page);
    const fullPixels = await sample(page, fullFlow.assets[assetId(fullFlow)]!, points);
    const spread = (pixel: number[]) => Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3));
    if (mode === 'saturate') {
      expect(spread(lowPixels[0])).toBeGreaterThan(spread(beforePixels[0]));
      expect(spread(fullPixels[0])).toBeGreaterThan(spread(lowPixels[0]));
    } else {
      expect(spread(lowPixels[0])).toBeLessThan(spread(beforePixels[0]));
      expect(spread(fullPixels[0])).toBeLessThan(spread(lowPixels[0]));
    }
    expect(lowPixels[0][3]).toBe(beforePixels[0][3]);
    expect(fullPixels[0][3]).toBe(beforePixels[0][3]);
    expect(fullPixels.slice(1)).toEqual(beforePixels.slice(1));
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Undo/ }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Redo/ }).click();
    await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
    await page.reload();
    await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
    const reloaded = await project(page);
    expect(assetId(reloaded)).toBe(assetId(fullFlow));
    expect(reloaded.assets[assetId(reloaded)]).toEqual(fullFlow.assets[assetId(fullFlow)]);
    expect(await sample(page, reloaded.assets[assetId(reloaded)]!, points)).toEqual(fullPixels);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
    await page.getByTestId('project-input').setInputFiles({
      name: 'sponge-roundtrip.pixelforge', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fullFlow)),
    });
    await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '200');
    const reopened = await project(page);
    expect(assetId(reopened)).toBe(assetId(fullFlow));
    expect(await sample(page, reopened.assets[assetId(reopened)]!, points)).toEqual(fullPixels);
    expect(reopened.settings).toMatchObject({ tool: 'sponge', spongeMode: mode, spongeVibrance: 60, brushOpacity: 100 });
  });
}

test('tonal strokes honor locked layers and cancel touch gestures without committing', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#b04040');
  await selectTool(page, 'Fill');
  const point = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 183, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await page.getByLabel('Lock layer', { exact: true }).check();
  const lockedBefore = await project(page);
  await selectTool(page, 'Dodge');
  await stroke(page, 0.5, 0.6, 'touch');
  await expect(page.locator('footer')).toContainText('visible, unlocked raster layer');
  const locked = await project(page);
  expect(locked.history.length).toBe(lockedBefore.history.length);
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  const unlockedBeforeCancel = await project(page);
  const start = await canvasPoint(page, 0.3), end = await canvasPoint(page, 0.8);
  await canvas.dispatchEvent('pointerdown', { pointerId: 184, pointerType: 'touch', pressure: 0.6, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointermove', { pointerId: 184, pointerType: 'touch', pressure: 0.6, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 184, pointerType: 'touch', pressure: 0, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Gesture cancelled');
  const canceled = await project(page);
  expect(canceled.history.length).toBe(unlockedBeforeCancel.history.length);
});

test('active selection clips tonal pixels and preserves exact outside bytes', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#808080');
  await selectTool(page, 'Fill');
  const center = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 186, pointerType: 'mouse', pressure: 1, clientX: center.clientX, clientY: center.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await selectTool(page, 'Select');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Mask from selection', exact: true })).toBeEnabled();
  const before = await project(page);
  const beforeAsset = before.assets[before.history[before.index].layers.at(-1)!.asset!]!;
  const beforePixels = await sample(page, beforeAsset, [{ x: 0.35, y: 0.5 }, { x: 0.75, y: 0.5 }]);
  await selectTool(page, 'Dodge');
  await page.getByLabel('Size', { exact: true }).fill('80');
  await page.getByLabel('Exposure', { exact: true }).fill('100');
  await stroke(page, 0.35, 0.35);
  const after = await project(page);
  const afterAsset = after.assets[after.history[after.index].layers.at(-1)!.asset!]!;
  const afterPixels = await sample(page, afterAsset, [{ x: 0.35, y: 0.5 }, { x: 0.75, y: 0.5 }]);
  expect(afterPixels[0][0]).toBeGreaterThan(beforePixels[0][0]);
  expect(afterPixels[1]).toEqual(beforePixels[1]);
});

test('a tonal stroke on a fully transparent layer is a no-op without history growth', async ({ page }) => {
  await newPaintLayer(page);
  const before = await project(page);
  await selectTool(page, 'Dodge');
  await stroke(page, 0.5, 0.55);
  await expect(page.locator('footer')).toContainText('No tonal change applied');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
  expect(after.index).toBe(before.index);
});
