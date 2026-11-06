import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type Asset = { url: string; w: number; h: number };
type ProjectLayer = { id: string; kind: string; asset?: string; matrix: number[] };
type Project = {
  history: Array<{ w: number; h: number; layers: ProjectLayer[]; active: string }>;
  index: number;
  assets: Record<string, Asset>;
};

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const budget = (page: Page) => page.getByTestId('layer-pixel-budget');
const settled = (page: Page) => expect(canvas(page)).toHaveAttribute('data-rendering', 'false');
const layerCount = (page: Page, count: number) =>
  expect(page.getByRole('heading', { name: new RegExp(`^Layers ${count} / 32$`) })).toBeVisible();

async function newDocument(page: Page, width: number, height: number) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption('transparent');
  await dialog.getByRole('button', { name: 'Create document', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(canvas(page)).toHaveJSProperty('width', width);
  await settled(page);
}

async function menu(page: Page, name: string, item: string | RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page
    .getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item })
    .click();
}

async function addPaintLayer(page: Page) {
  await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
}

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
}

/** The active layer and its stored asset in the current history step. */
async function activeLayer(page: Page) {
  const value = await project(page);
  const frame = value.history[value.index];
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  return { value, layer, asset: value.assets[layer.asset!]! };
}

/** Client coordinates of a document pixel. */
async function clientPoint(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  const size = await canvas(page).evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
  return { clientX: box.x + ((x + 0.5) / size[0]) * box.width, clientY: box.y + ((y + 0.5) / size[1]) * box.height };
}

/** A short brush stroke between two document pixels. */
async function stroke(page: Page, pointerId: number, from: [number, number], to: [number, number]) {
  const start = await clientPoint(page, ...from);
  const end = await clientPoint(page, ...to);
  await canvas(page).evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas(page).dispatchEvent('pointerdown', { ...common, ...start, buttons: 1 });
  await page.waitForTimeout(150);
  await canvas(page).dispatchEvent('pointermove', { ...common, ...end, buttons: 1 });
  await canvas(page).dispatchEvent('pointerup', { ...common, ...end, buttons: 0 });
  await settled(page);
}

/** Composite canvas pixels at document coordinates. */
const composite = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(x, y, 1, 1).data)),
    points,
  );

test('the layer pixel budget is explained, shown in the Layers panel and freed by Trim Layer to Content', async ({ page }) => {
  test.setTimeout(180_000);
  // 3999 × 4000 is 16.0 MP, so the background plus three paint layers fill the 64 MP budget.
  await newDocument(page, 3999, 4000);
  await expect(budget(page)).toHaveText('Pixel budget 16 / 64 MP');
  await expect(budget(page)).toHaveAttribute('title', /Trim Layer to Content/);
  for (const count of [2, 3, 4]) {
    await addPaintLayer(page);
    await layerCount(page, count);
    await settled(page);
  }
  await expect(budget(page)).toHaveText('Pixel budget 64 / 64 MP');
  await expect(budget(page)).toHaveAttribute('data-state', 'near');

  await addPaintLayer(page);
  await expect(footer(page)).toContainText(
    'Layer pixel budget reached: layers may store 64 MP in total and this edit needs 80 MP.',
  );
  await expect(footer(page)).not.toContainText('Invalid layer document');
  await layerCount(page, 4);

  // Duplicating is bounded by the same explanation.
  await menu(page, 'Layer', /^Duplicate Layer/);
  await expect(footer(page)).toContainText('Layer pixel budget reached');
  await layerCount(page, 4);

  // The active (top) paint layer is empty: trimming it frees its 16 MP.
  await menu(page, 'Layer', 'Trim Layer to Content');
  await expect(footer(page)).toContainText('Empty layer trimmed; 16 MP of the layer pixel budget freed');
  await expect(budget(page)).toHaveText('Pixel budget 48 / 64 MP');
  const trimmed = await activeLayer(page);
  expect([trimmed.asset.w, trimmed.asset.h]).toEqual([1, 1]);

  await addPaintLayer(page);
  await layerCount(page, 5);
  await expect(budget(page)).toHaveText('Pixel budget 64 / 64 MP');

  // With the budget full again, painting on the trimmed layer cannot grow it:
  // the editor says so instead of silently dropping the stroke.
  await page.getByRole('button', { name: /^Select layer Paint 3/ }).click();
  await selectTool(page, 'Brush');
  await stroke(page, 80, [2000, 2000], [2010, 2000]);
  await expect(footer(page)).toContainText('Layer pixel budget reached: this layer stays 1 × 1 px');
  const refused = await activeLayer(page);
  expect([refused.asset.w, refused.asset.h]).toEqual([1, 1]);
  await layerCount(page, 5);
});

test('a trimmed paint layer expands when painted outside its bounds, with undo and project roundtrip', async ({ page }) => {
  test.setTimeout(120_000);
  await newDocument(page, 400, 300);
  await addPaintLayer(page);
  await layerCount(page, 2);
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Size', { exact: true }).fill('20');
  await stroke(page, 81, [100, 150], [110, 150]);

  await menu(page, 'Layer', 'Trim Layer to Content');
  await expect(footer(page)).toContainText(/Layer trimmed to \d+ × \d+ px/);
  await expect(budget(page)).not.toHaveText('Pixel budget 0.2 / 64 MP');
  const trimmed = await activeLayer(page);
  expect(trimmed.asset.w).toBeLessThan(60);
  expect(trimmed.asset.h).toBeLessThan(60);
  expect(trimmed.layer.matrix.slice(0, 4)).toEqual([1, 0, 0, 1]);
  expect(trimmed.layer.matrix[4]).toBeGreaterThan(70);
  expect(trimmed.layer.matrix[5]).toBeGreaterThan(110);
  // Trimming keeps every visible pixel in place.
  const [kept] = await composite(page, [[105, 150]]);
  expect(kept[0]).toBeGreaterThan(200);
  expect(kept[3]).toBeGreaterThan(200);

  // Paint far outside the stored bounds: the layer grows back and keeps both marks.
  await stroke(page, 82, [300, 60], [310, 60]);
  const painted = await activeLayer(page);
  expect([painted.asset.w, painted.asset.h]).toEqual([400, 300]);
  expect(painted.layer.matrix).toEqual([1, 0, 0, 1, 0, 0]);
  const [first, second, empty] = await composite(page, [[105, 150], [305, 60], [200, 250]]);
  expect(first[0]).toBeGreaterThan(200);
  expect(first[3]).toBeGreaterThan(200);
  expect(second[0]).toBeGreaterThan(200);
  expect(second[3]).toBeGreaterThan(200);
  expect(empty[3]).toBe(0);
  const paintedPixels = await canvas(page).evaluate((element: HTMLCanvasElement) => element.toDataURL());

  // Undo removes the stroke, then the expansion; redo restores both.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect((await composite(page, [[305, 60]]))[0][3]).toBe(0);
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  const undone = await activeLayer(page);
  expect([undone.asset.w, undone.asset.h]).toEqual([trimmed.asset.w, trimmed.asset.h]);
  expect(undone.layer.matrix).toEqual(trimmed.layer.matrix);
  expect((await composite(page, [[105, 150]]))[0][3]).toBeGreaterThan(200);
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  expect((await composite(page, [[305, 60]]))[0][0]).toBeGreaterThan(200);

  // A portable project roundtrip keeps the expanded pixels and the trimmed history step.
  const exported = await project(page);
  await newDocument(page, 200, 200);
  await page.getByTestId('project-input').setInputFiles({
    name: 'trimmed.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(footer(page)).toContainText('Project opened with editable layers and history');
  await expect(canvas(page)).toHaveJSProperty('width', 400);
  await settled(page);
  expect(await canvas(page).evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(paintedPixels);
  await menu(page, 'Edit', /^Undo/);
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  const restored = await activeLayer(page);
  expect(restored.layer.matrix).toEqual(trimmed.layer.matrix);
  expect((await composite(page, [[105, 150]]))[0][3]).toBeGreaterThan(200);
  expect((await composite(page, [[305, 60]]))[0][3]).toBe(0);
});

test('Trim Layer to Content is unavailable for non-pixel layers', async ({ page }) => {
  await newDocument(page, 200, 120);
  await menu(page, 'Layer', 'New Adjustment Layer');
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Trim Layer to Content', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
});
