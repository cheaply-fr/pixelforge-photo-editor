import { selectTool } from './tool-selection';
import { test, expect, type Page } from '@playwright/test';

const openEditor = async (page: Page) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) => route.fulfill({ json: { authenticated: false } }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device');
};

type Project = {
  settings: Record<string, unknown>;
  history: Array<{ active: string; layers: Array<{ id: string; kind: string; asset?: string }> }>;
  index: number;
  assets: Record<string, { url: string; w: number; h: number }>;
};

const project = async (page: Page): Promise<Project> => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const file = await download.path();
  return JSON.parse(await (await import('node:fs/promises')).readFile(file!, 'utf8')) as Project;
};

const newPaintLayer = async (page: Page) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New transparent document', exact: true }).click();
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
};

const canvasPoint = async (page: Page, fraction = 0.5) => {
  const box = (await page.getByTestId('editor-canvas').boundingBox())!;
  return { clientX: box.x + box.width * fraction, clientY: box.y + box.height * 0.5 };
};

const stroke = async (page: Page, pointerType = 'mouse', cancel = false) => {
  const start = await canvasPoint(page, 0.45), end = await canvasPoint(page, 0.58);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 87, pointerType, pressure: 1, clientX: start.clientX, clientY: start.clientY, buttons: 1, isPrimary: true });
  await page.waitForTimeout(80);
  await canvas.dispatchEvent('pointermove', { pointerId: 87, pointerType, pressure: 1, clientX: end.clientX, clientY: end.clientY, buttons: 1, isPrimary: true });
  await canvas.dispatchEvent(cancel ? 'pointercancel' : 'pointerup', { pointerId: 87, pointerType, pressure: 1, clientX: end.clientX, clientY: end.clientY, buttons: 0, isPrimary: true });
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
};

test.beforeEach(async ({ page }) => openEditor(page));

test('Mixer Brush exposes bounded wet/load/mix controls, commits one undo step and reloads settings', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Mixer Brush');
  await expect(page.getByLabel('Wet', { exact: true })).toBeVisible();
  await page.getByLabel('Wet', { exact: true }).fill('72');
  await page.getByLabel('Load', { exact: true }).fill('64');
  await page.getByLabel('Mix', { exact: true }).fill('81');
  await page.getByLabel('Flow', { exact: true }).fill('55');
  const before = await project(page);
  await stroke(page);
  const after = await project(page);
  expect(after.history.length).toBeGreaterThan(before.history.length);
  expect(after.settings.tool).toBe('mixer-brush');
  expect(after.settings.mixerBrush).toMatchObject({ wet: 72, load: 64, mix: 81, flow: 55 });
  await page.reload();
  await selectTool(page, 'Mixer Brush');
  await expect(page.getByLabel('Wet', { exact: true })).toHaveValue('72');
  await expect(page.getByLabel('Mix', { exact: true })).toHaveValue('81');
});

test('History Brush selects a local source snapshot, restores through a stroke, and persists across reload', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Fill');
  await page.getByLabel('Drawing color', { exact: true }).fill('#d52b2b');
  const first = await canvasPoint(page);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 90, pointerType: 'mouse', pressure: 1, clientX: first.clientX, clientY: first.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await page.getByLabel('Drawing color', { exact: true }).fill('#2355d5');
  await canvas.dispatchEvent('pointerdown', { pointerId: 91, pointerType: 'mouse', pressure: 1, clientX: first.clientX, clientY: first.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  await selectTool(page, 'History Brush');
  await expect(page.getByLabel('History source', { exact: true })).toBeVisible();
  await page.getByLabel('History source', { exact: true }).selectOption('1');
  await page.getByLabel('History opacity', { exact: true }).fill('68');
  await page.getByLabel('History flow', { exact: true }).fill('74');
  const before = await project(page);
  await stroke(page);
  const restored = await project(page);
  expect(restored.history.length).toBeGreaterThan(before.history.length);
  expect(restored.settings.tool).toBe('history-brush');
  expect(restored.settings.historySourceIndex).toBe(1);
  expect(restored.settings.historyBrush).toMatchObject({ opacity: 68, flow: 74 });
  await page.reload();
  await selectTool(page, 'History Brush');
  await expect(page.getByLabel('History source', { exact: true })).toHaveValue('1');
});

test('Art History Brush exposes bounded painterly controls, uses an immutable snapshot and persists through undo/reload', async ({ page }) => {
  await newPaintLayer(page);
  await selectTool(page, 'Fill');
  await page.getByLabel('Drawing color', { exact: true }).fill('#d52b2b');
  const first = await canvasPoint(page);
  const canvas = page.getByTestId('editor-canvas');
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await canvas.dispatchEvent('pointerdown', { pointerId: 94, pointerType: 'mouse', pressure: 1, clientX: first.clientX, clientY: first.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });
  const source = await project(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#2355d5');
  await canvas.dispatchEvent('pointerdown', { pointerId: 95, pointerType: 'mouse', pressure: 1, clientX: first.clientX, clientY: first.clientY, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled', { timeout: 10000 });

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Art History Brush Tool/ }).click();
  await expect(page.getByLabel('Art History opacity', { exact: true })).toBeVisible();
  await page.getByLabel('Art History opacity', { exact: true }).fill('66');
  await page.getByLabel('Art History flow', { exact: true }).fill('71');
  await page.getByLabel('Style area', { exact: true }).fill('6');
  await page.getByLabel('Fidelity', { exact: true }).fill('38');
  await page.getByLabel('Art History source', { exact: true }).selectOption(String(source.index));
  await expect(page.locator('footer')).toContainText('Art History Brush selected');
  await page.getByLabel('Lock layer', { exact: true }).check();
  await stroke(page);
  await expect(page.locator('footer')).toContainText('visible, unlocked raster');
  await page.getByLabel('Lock layer', { exact: true }).uncheck();
  const before = await project(page);
  await stroke(page);
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length + 1);
  expect(after.history[source.index]).toEqual(source.history[source.index]);
  expect(after.settings.tool).toBe('art-history-brush');
  expect(after.settings.historySourceIndex).toBe(source.index);
  expect(after.settings.artHistoryBrush).toMatchObject({ opacity: 66, flow: 71, style: 6, fidelity: 38 });
  await page.keyboard.press('Control+z');
  await expect(page.locator('footer')).toContainText(/undone|Undo/i, { timeout: 10000 });
  await page.reload();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Art History Brush Tool/ }).click();
  await expect(page.getByLabel('Art History opacity', { exact: true })).toHaveValue('66');
  await expect(page.getByLabel('Style area', { exact: true })).toHaveValue('6');
});

test('B and Y keyboard shortcuts activate Mixer and History Brush families without changing the draft', async ({ page }) => {
  await newPaintLayer(page);
  const before = await project(page);
  await selectTool(page, 'Brush');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: /Mixer Brush tool/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('y');
  await expect(page.getByRole('button', { name: 'History Brush tool', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const after = await project(page);
  expect(after.history.length).toBe(before.history.length);
});

const activeAsset = (value: Project) => {
  const frame = value.history[value.index];
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  return value.assets[layer.asset!]!;
};
const sampleAsset = async (page: Page, asset: ReturnType<typeof activeAsset>) =>
  page.evaluate(async (asset) => {
    const image = new Image();
    image.src = asset.url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = asset.w;
    canvas.height = asset.h;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return [0.45, 0.2].map((x) => Array.from(context.getImageData(Math.floor(asset.w * x), Math.floor(asset.h * 0.5), 1, 1).data));
  }, asset);

test('Art History Brush restores representative source pixels and survives redo and project import', async ({ page }) => {
  await newPaintLayer(page);
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  await selectTool(page, 'Fill');
  const center = await canvasPoint(page);
  await canvas.evaluate((element) => { element.setPointerCapture = () => undefined; });
  await page.getByLabel('Drawing color', { exact: true }).fill('#d52b2b');
  await canvas.dispatchEvent('pointerdown', { pointerId: 120, pointerType: 'mouse', pressure: 1, ...center, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled');
  const red = await project(page);
  await page.getByLabel('Drawing color', { exact: true }).fill('#2355d5');
  await canvas.dispatchEvent('pointerdown', { pointerId: 121, pointerType: 'mouse', pressure: 1, ...center, buttons: 1, isPrimary: true });
  await expect(page.locator('footer')).toContainText('Area filled');
  const blue = await project(page);
  const sourceBytes = activeAsset(red).url;
  await selectTool(page, 'Art History Brush');
  await page.getByLabel('Art History source', { exact: true }).selectOption(String(red.index));
  await page.getByLabel('Size', { exact: true }).fill('40');
  await page.getByLabel('Hardness', { exact: true }).fill('100');
  await page.getByLabel('Art History opacity', { exact: true }).fill('100');
  await page.getByLabel('Art History flow', { exact: true }).fill('100');
  await page.getByLabel('Fidelity', { exact: true }).fill('100');
  await stroke(page, 'touch');
  await expect(page.locator('footer')).toContainText('Art History Brush applied');
  const painted = await project(page);
  expect(painted.history.length).toBe(blue.history.length + 1);
  const pixels = await sampleAsset(page, activeAsset(painted));
  expect(pixels).toEqual([[213, 43, 43, 255], [35, 85, 213, 255]]);
  expect(painted.history[red.index]).toEqual(red.history[red.index]);
  expect(painted.assets[red.history[red.index].layers.at(-1)!.asset!].url).toBe(sourceBytes);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  expect(await sampleAsset(page, activeAsset(await project(page)))).toEqual(await sampleAsset(page, activeAsset(blue)));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Redo/ }).click();
  expect(await sampleAsset(page, activeAsset(await project(page)))).toEqual(pixels);
  const roundTrip = await project(page);
  await page.getByTestId('project-input').setInputFiles({ name: 'art-history.pixel.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(roundTrip)) });
  await expect(page.locator('footer')).toContainText('Project opened');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  const imported = await project(page);
  expect(imported.settings.artHistoryBrush).toEqual(roundTrip.settings.artHistoryBrush);
  expect(imported.history[imported.index].active).toBe(roundTrip.history[roundTrip.index].active);
  expect(imported.history[imported.index].layers).toEqual(roundTrip.history[roundTrip.index].layers);
  expect(await sampleAsset(page, activeAsset(imported))).toEqual(pixels);
});

test('Art History touch cancellation and unchanged-source taps preserve the draft', async ({ page }) => {
  await selectTool(page, 'Art History Brush');
  await page.getByLabel('Fidelity', { exact: true }).fill('100');
  await page.getByLabel('Art History opacity', { exact: true }).fill('100');
  await page.getByLabel('Art History flow', { exact: true }).fill('100');
  const before = await project(page);
  await stroke(page, 'touch', true);
  await expect(page.locator('footer')).toContainText('Gesture cancelled');
  const cancelled = await project(page);
  expect(cancelled.history).toEqual(before.history);
  expect(cancelled.index).toBe(before.index);
  await stroke(page);
  await expect(page.locator('footer')).toContainText('No Art History Brush change');
  const unchanged = await project(page);
  expect(unchanged.history).toEqual(before.history);
  expect(unchanged.index).toBe(before.index);
});
