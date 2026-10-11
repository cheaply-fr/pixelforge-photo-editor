import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

const openEditor = async (page: Page) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
};

const project = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  const path = await download.path();
  return await downloadedProject(path!) as {
    settings: Record<string, unknown>;
    history: Array<{
      layers: Array<{ id: string; kind: string; asset?: string }>;
    }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
};

const canvasPoint = async (page: Page, x = 0.5, y = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

const patternStroke = async (page: Page, x = 0.5, y = 0.5) => {
  const start = await canvasPoint(page, x, y);
  const end = await canvasPoint(page, Math.min(0.9, x + 0.08), y);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'mouse',
    pressure: 1,
    ...start,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', {
    pointerId: 71,
    pointerType: 'mouse',
    pressure: 1,
    ...end,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId: 71,
    pointerType: 'mouse',
    pressure: 1,
    ...end,
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await expect(page.locator('footer')).toContainText(
    'Pattern Stamp stroke applied',
    { timeout: 10000 },
  );
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Pattern Stamp uses deterministic bounded tiles, persists settings, and supports undo/reload', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Add paint layer', exact: true })
    .click();
  await page.keyboard.press('s');
  await expect(
    page.getByRole('button', { name: 'Clone tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(
    page.getByRole('button', { name: 'Pattern Stamp tool', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Pattern source', { exact: true }).selectOption('dots');
  await page.getByLabel('Tile size', { exact: true }).fill('16');
  await expect(
    page.getByText('No source image leaves this device.', { exact: false }),
  ).toBeVisible();
  const before = await project(page);
  const beforeFrame = before.history[before.index];
  const beforeAsset = beforeFrame.layers.find(
    (layer) => layer.id === beforeFrame.layers.at(-1)!.id,
  )!.asset!;
  await patternStroke(page);
  const painted = await project(page);
  expect(painted.settings).toMatchObject({
    tool: 'pattern-stamp',
    patternId: 'dots',
    patternTileSize: 16,
  });
  expect(painted.history.length).toBeGreaterThan(before.history.length);
  const paintedFrame = painted.history[painted.index];
  const paintedLayer = paintedFrame.layers.find(
    (layer) => layer.id === paintedFrame.layers.at(-1)!.id,
  )!;
  expect(paintedLayer.kind).toBe('raster');
  expect(paintedLayer.asset).not.toBe(beforeAsset);
  const paintedAsset = painted.assets[paintedLayer.asset!];
  const hasStampedPixels = await page.evaluate(async (asset) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return Array.from(context.getImageData(0, 0, asset.w, asset.h).data).some(
      (value, index) => index % 4 === 3 && value > 0,
    );
  }, paintedAsset);
  expect(hasStampedPixels).toBe(true);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.locator('footer')).toContainText('Undone');
  const undone = await project(page);
  expect(undone.history[undone.index].layers.at(-1)!.asset).toBe(beforeAsset);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await expect(page.locator('footer')).toContainText('Redone');
  await expect(
    page.getByRole('status', { name: 'Draft save status' }),
  ).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Pattern source', { exact: true })).toHaveValue(
    'dots',
  );
  await expect(page.getByLabel('Tile size', { exact: true })).toHaveValue('16');
  const reloaded = await project(page);
  expect(reloaded.settings).toMatchObject({
    patternId: 'dots',
    patternTileSize: 16,
  });
});

test('Pattern Stamp refuses locked raster layers without changing pixels', async ({
  page,
}) => {
  await page
    .getByRole('button', { name: 'Add paint layer', exact: true })
    .click();
  await selectTool(page, 'Pattern Stamp');
  const before = await project(page);
  await page.getByLabel('Lock layer', { exact: true }).check();
  const point = await canvasPoint(page);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  await canvas.dispatchEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'mouse',
    pressure: 1,
    ...point,
    buttons: 1,
    isPrimary: true,
  });
  await expect(page.locator('footer')).toContainText(
    'Select a visible, unlocked raster layer before pattern stamping',
  );
  const locked = await project(page);
  expect(locked.history.length).toBe(before.history.length + 1); // only the lock metadata commit
  const active = locked.history[locked.index].layers.at(-1)!;
  expect(active.kind).toBe('raster');
  expect(active.asset).toBe(before.history[before.index].layers.at(-1)!.asset);
});

test('Pattern Stamp pointer cancellation restores the source frame without history', async ({ page }) => {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
  await selectTool(page, 'Pattern Stamp');
  const before = await project(page);
  const start = await canvasPoint(page, 0.45);
  const end = await canvasPoint(page, 0.6);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 73, pointerType: 'touch', pressure: 0.8, ...start, buttons: 1, isPrimary: true });
  await page.waitForTimeout(60);
  await canvas.dispatchEvent('pointermove', { pointerId: 73, pointerType: 'touch', pressure: 0.8, ...end, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointercancel', { pointerId: 73, pointerType: 'touch', pressure: 0, ...end, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Gesture cancelled');
  const cancelled = await project(page);
  expect(cancelled.history.length).toBe(before.history.length);
  expect(cancelled.history[cancelled.index].layers.at(-1)!.asset).toBe(
    before.history[before.index].layers.at(-1)!.asset,
  );
});
