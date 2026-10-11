import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

/**
 * High-use Photoshop workflow acceptance coverage.
 *
 * These tests intentionally exercise the public editor surface rather than
 * importing implementation helpers: every workflow must change pixels or
 * editable metadata, survive the local-draft round trip, and remain undoable.
 * The ten groupings mirror the first ten roadmap capabilities; export is the
 * shared acceptance layer for the text workflow.
 */

type Asset = { url: string; w: number; h: number };
type Layer = {
  kind: string;
  asset?: string;
  matrix?: number[];
  mask?: string;
  name?: string;
  opacity?: number;
  visible?: boolean;
  text?: string;
  fontFamily?: string;
  adjustments?: Record<string, unknown>;
};
type Project = {
  history: Array<{
    w: number;
    h: number;
    layers: Layer[];
    selection?: Record<string, unknown>;
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
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
};
const active = (value: Project) => value.history[value.index];

const newPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
};

const canvasPoint = async (page: Page, x: number, y = 0.5) => {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { clientX: box.x + box.width * x, clientY: box.y + box.height * y };
};

const drag = async (page: Page, start: [number, number], end: [number, number]) => {
  const canvas = page.getByTestId('editor-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * start[0], box.y + box.height * start[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * end[0], box.y + box.height * end[1], { steps: 5 });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const stroke = async (page: Page, startX: number, endX: number, pointerId = 41) => {
  const start = await canvasPoint(page, startX), end = await canvasPoint(page, endX);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', {
    pointerId,
    pointerType: 'mouse',
    pressure: 1,
    clientX: start.clientX,
    clientY: start.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', {
    pointerId,
    pointerType: 'mouse',
    pressure: 1,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 1,
    isPrimary: true,
  });
  await canvas.dispatchEvent('pointerup', {
    pointerId,
    pointerType: 'mouse',
    pressure: 1,
    clientX: end.clientX,
    clientY: end.clientY,
    buttons: 0,
    isPrimary: true,
  });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

const pixelAt = async (page: Page, xRatio = 0.5, yRatio = 0.5) =>
  page.getByTestId('editor-canvas').evaluate(
    (canvas: HTMLCanvasElement, point) => {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * point.x)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(canvas.height * point.y)));
      return Array.from(canvas.getContext('2d')!.getImageData(x, y, 1, 1).data);
    },
    { x: xRatio, y: yRatio },
  );

test.beforeEach(async ({ page }) => openEditor(page));

test('1. Move and Free Transform change the active layer and remain undoable', async ({ page }) => {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Free Transform/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Free Transform' });
  await dialog.getByLabel('Horizontal offset (px)').fill('72');
  await dialog.getByLabel('Width scale (%)').fill('120');
  await dialog.getByLabel('Rotation (degrees)').fill('12');
  await dialog.getByRole('button', { name: 'Apply free transform', exact: true }).click();
  const changed = await project(page);
  const layer = changed.history[changed.index].layers.at(-1)!;
  expect(layer.matrix).not.toEqual([1, 0, 0, 1, 0, 0]);
  await page.reload();
  { const restored = await project(page); expect(active(restored).layers.at(-1)!.matrix).toEqual(layer.matrix); }
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  { const undone = await project(page); expect(active(undone).layers.at(-1)!.matrix).toEqual([1, 0, 0, 1, 0, 0]); }
});

test('2. Crop and Resize update dimensions, persist, and undo independently', async ({ page }) => {
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Resize image…', exact: true }).click();
  await page.getByLabel('Width (px)', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Apply resize', exact: true }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1000');
  const resized = await project(page);
  expect(resized.history[resized.index].w).toBe(1000);

  await selectTool(page, 'Crop');
  await drag(page, [0.15, 0.15], [0.75, 0.75]);
  await page.keyboard.press('Enter');
  const cropped = await project(page);
  expect(cropped.history[cropped.index].w).toBeLessThan(1000);
  expect(cropped.history[cropped.index].h).toBeLessThan(resized.history[resized.index].h);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1000');
  await page.reload();
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '1000');
});

test('3. Marquee and Lasso selections keep editable geometry through reload', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.2, 0.2], [0.65, 0.65]);
  let exported = await project(page);
  expect(exported.history[exported.index].selection).toMatchObject({ shape: 'rectangle' });
  await selectTool(page, 'Lasso');
  const canvas = page.getByTestId('editor-canvas'), box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
  await page.mouse.down();
  for (const [x, y] of [[0.72, 0.2], [0.62, 0.7], [0.25, 0.62]] as const)
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 3 });
  await page.mouse.up();
  exported = await project(page);
  const lassoSelection = exported.history[exported.index].selection;
  expect(lassoSelection).toMatchObject({ shape: 'polygon' });
  expect((lassoSelection?.points as unknown[] | undefined)?.length ?? 0).toBeGreaterThanOrEqual(3);
  await page.reload();
  { const reloaded = await project(page); expect(active(reloaded).selection?.shape).toBe('polygon'); }
});

test('4. Magic Wand creates a color-based selection mask and restores on reload', async ({ page }) => {
  await selectTool(page, 'Magic Wand');
  await page.getByTestId('editor-canvas').click({ position: { x: 20, y: 20 } });
  let exported = await project(page);
  const frame = exported.history[exported.index];
  expect(frame.selection?.mask).toEqual(expect.any(String));
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  exported = await project(page);
  expect(exported.history[exported.index].layers.at(-1)?.mask).toEqual(expect.any(String));
  await page.reload();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
});

test('5. Brush paints source-safe pixels and persists the raster asset', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#e31b23');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('84');
  const before = await project(page);
  await stroke(page, 0.3, 0.45);
  const painted = await project(page);
  const layer = painted.history[painted.index].layers.at(-1)!;
  expect(layer.asset).not.toBe(before.history[before.index].layers.at(-1)!.asset);
  expect((await pixelAt(page, 0.4))[0]).toBeGreaterThan(150);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  { const undone = await project(page); expect(active(undone).layers.at(-1)!.asset).toBe(before.history[before.index].layers.at(-1)!.asset); }
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await page.reload();
  { const restored = await project(page); expect(active(restored).layers.at(-1)!.asset).toBe(layer.asset); }
});

test('6. Eraser removes alpha without losing undo history', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#4b7bec');
  await selectTool(page, 'Fill');
  const fillPoint = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 52, pointerType: 'mouse', pressure: 1, clientX: fillPoint.clientX, clientY: fillPoint.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  const filled = await pixelAt(page);
  await selectTool(page, 'Eraser');
  await page.getByLabel('Size', { exact: true }).fill('100');
  await stroke(page, 0.5, 0.52, 53);
  const erased = await pixelAt(page);
  expect(erased[3]).toBeLessThan(filled[3]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  expect((await pixelAt(page))[3]).toBe(filled[3]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  await page.reload();
  expect((await pixelAt(page))[3]).toBe(erased[3]);
});

test('7. Clone and Healing use an explicit source and commit editable raster history', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#d91c5b');
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('70');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await stroke(page, 0.3, 0.3);
  const painted = await project(page);
  const sourcePixel = await pixelAt(page, 0.3);
  await selectTool(page, 'Clone');
  const source = await canvasPoint(page, 0.3);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.dispatchEvent('pointerdown', { pointerId: 61, pointerType: 'mouse', pressure: 1, clientX: source.clientX, clientY: source.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 61, pointerType: 'mouse', pressure: 1, clientX: source.clientX, clientY: source.clientY, buttons: 0, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Clone source set', { timeout: 10000 });
  await stroke(page, 0.05, 0.08, 62);
  const cloned = await project(page);
  expect(cloned.history.length).toBeGreaterThan(painted.history.length);
  expect((await pixelAt(page, 0.05))[0]).toBe(sourcePixel[0]);
  await selectTool(page, 'Healing');
  await canvas.dispatchEvent('pointerdown', { pointerId: 63, pointerType: 'mouse', pressure: 1, clientX: source.clientX, clientY: source.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent('pointerup', { pointerId: 63, pointerType: 'mouse', pressure: 1, clientX: source.clientX, clientY: source.clientY, buttons: 0, isPrimary: true });
  await stroke(page, 0.8, 0.83, 64);
  const healed = await project(page);
  expect(healed.history.length).toBeGreaterThan(cloned.history.length);
  expect(healed.history[healed.index].layers.at(-1)?.asset).not.toBe(cloned.history[cloned.index].layers.at(-1)?.asset);
});

test('8. Levels, Curves and photo color controls stay nondestructive and persist', async ({ page }) => {
  await newPaintLayer(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#808080');
  await selectTool(page, 'Fill');
  const point = await canvasPoint(page, 0.5);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 71, pointerType: 'mouse', pressure: 1, clientX: point.clientX, clientY: point.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  const source = await project(page);
  const sourceLayer = source.history[source.index].layers.at(-1)!;
  await page.getByLabel('Levels black point', { exact: true }).fill('128');
  expect((await pixelAt(page))[0]).toBe(0);
  await page.getByLabel('RGB midpoint', { exact: true }).fill('210');
  await page.getByLabel('Brightness', { exact: true }).fill('120');
  await page.getByLabel('Saturation', { exact: true }).fill('70');
  const adjusted = await project(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.asset).toBe(sourceLayer.asset);
  expect(layer.adjustments).toMatchObject({ levelsBlack: 128, brightness: 120, saturation: 70 });
  const curves = layer.adjustments?.curves as { rgb: Array<[number, number]> } | undefined;
  expect(curves?.rgb ?? []).toContainEqual([128, 210]);
  // Wait for the final IndexedDB write before forcing a navigation. The editor
  // stages a write-ahead snapshot, but this assertion verifies the same
  // user-visible save contract that a reload relies on.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  expect(await page.getByLabel('Levels black point', { exact: true }).inputValue()).toBe('128');
  expect(await page.getByLabel('Brightness', { exact: true }).inputValue()).toBe('120');
  expect(await page.getByLabel('Saturation', { exact: true }).inputValue()).toBe('70');
});

test('9. Layers and masks keep source assets, visibility and mask metadata editable', async ({ page }) => {
  await selectTool(page, 'Select');
  await drag(page, [0.2, 0.2], [0.7, 0.7]);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate layer', exact: true }).click();
  await page.getByLabel('Layer name', { exact: true }).fill('Top copy');
  await page.getByLabel('Layer opacity', { exact: true }).fill('65');
  let exported = await project(page);
  const frame = exported.history[exported.index];
  expect(frame.layers).toHaveLength(2);
  expect(frame.layers.at(-1)).toMatchObject({ name: 'Top copy', opacity: 0.65 });
  expect(frame.layers.at(-1)?.mask).toEqual(expect.any(String));
  await page.getByLabel('Visible', { exact: true }).uncheck();
  exported = await project(page);
  expect(exported.history[exported.index].layers.at(-1)?.visible).toBe(false);
  await page.reload();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
});

test('10. Editable Text persists and exports valid PNG JPEG and WebP files', async ({ page }) => {
  await selectTool(page, 'Text');
  await page.getByTestId('editor-canvas').click({ position: { x: 120, y: 120 } });
  await page.getByLabel('Edit layer text', { exact: true }).fill('PixelForge title');
  await page.getByLabel('Layer name', { exact: true }).fill('Headline');
  await page.getByLabel('Layer font', { exact: true }).selectOption('Georgia');
  const exported = await project(page);
  expect(exported.history[exported.index].layers.at(-1)).toMatchObject({ kind: 'text', text: 'PixelForge title', name: 'Headline', fontFamily: 'Georgia' });
  await page.reload();
  await expect(page.getByLabel('Edit layer text', { exact: true })).toHaveValue('PixelForge title');
  for (const [format, signature] of [['png', '89504e470d0a1a0a'], ['jpeg', 'ffd8'], ['webp', '52494646']] as const) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    await page.getByLabel('Export format', { exact: true }).selectOption(format);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download image', exact: true }).click();
    const file = await pending;
    const bytes = await (await import('node:fs/promises')).readFile((await file.path())!);
    expect(bytes.subarray(0, signature.length / 2).toString('hex')).toBe(signature);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  }
});
