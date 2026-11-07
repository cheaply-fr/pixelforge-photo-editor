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
  expect(page.getByRole('heading', { name: new RegExp(`^Layers ${count} / 512$`) })).toBeVisible();

async function newDocument(page: Page, width: number, height: number, background = 'transparent') {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New document' });
  await dialog.getByLabel('New document width (px)').fill(String(width));
  await dialog.getByLabel('New document height (px)').fill(String(height));
  await dialog.getByLabel('Background contents').selectOption(background);
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
  await canvas(page).evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas(page).dispatchEvent('pointerdown', { ...common, ...start, buttons: 1 });
  await page.waitForTimeout(150);
  // Measured after the press: a layer expansion can reflow a phone layout.
  const end = await clientPoint(page, ...to);
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

/** Wait until the automatic storage pass has stored the active layer below the given size. */
async function storedWithin(page: Page, maxWidth: number, maxHeight: number) {
  let latest = await activeLayer(page);
  await expect
    .poll(
      async () => {
        latest = await activeLayer(page);
        return latest.asset.w <= maxWidth && latest.asset.h <= maxHeight;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return latest;
}

test('the device budget is explained, shown in the Layers panel and empty paint layers cost nothing', async ({ page }) => {
  test.setTimeout(180_000);
  // A low-memory device (deviceMemory 2) gets the 128 MP tier on desktop and mobile.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2 }));
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  // 3999 × 4000 is 16.0 MP; an opaque background fits its content and stays full size.
  await newDocument(page, 3999, 4000, 'white');
  await expect(budget(page)).toHaveText('Pixel budget 16 / 128 MP');
  await expect(budget(page)).toHaveAttribute('title', /Trim Layer to Content/);

  // New paint layers store one transparent pixel until they are painted.
  for (const count of [2, 3, 4]) {
    await addPaintLayer(page);
    await layerCount(page, count);
    await settled(page);
  }
  await expect(budget(page)).toHaveText('Pixel budget 16 / 128 MP');
  const empty = await activeLayer(page);
  expect([empty.asset.w, empty.asset.h]).toEqual([1, 1]);

  // Opaque duplicates of the background fill the budget exactly.
  await page.getByRole('button', { name: /^Select layer Background/ }).click();
  for (let copy = 1; copy <= 7; copy += 1) {
    await menu(page, 'Layer', /^Duplicate Layer/);
    await layerCount(page, 4 + copy);
    await settled(page);
  }
  await expect(budget(page)).toHaveText('Pixel budget 128 / 128 MP');
  await expect(budget(page)).toHaveAttribute('data-state', 'near');

  await menu(page, 'Layer', /^Duplicate Layer/);
  await expect(footer(page)).toContainText(
    'Layer pixel budget reached: layers may store 128 MP in total on this device and this edit needs 144 MP.',
  );
  await expect(footer(page)).not.toContainText('Invalid layer document');
  await layerCount(page, 11);

  // With the budget full, painting on an empty layer cannot grow it: the
  // editor says so instead of silently dropping the stroke.
  await page.getByRole('button', { name: /^Select layer Paint 3/ }).click();
  await selectTool(page, 'Brush');
  await stroke(page, 80, [2000, 2000], [2010, 2000]);
  await expect(footer(page)).toContainText('Layer pixel budget reached: this layer stays 1 × 1 px');
  const refused = await activeLayer(page);
  expect([refused.asset.w, refused.asset.h]).toEqual([1, 1]);
  await layerCount(page, 11);
});

test('paint layers are stored at their content bounds, grow anywhere, and keep one undo step per stroke', async ({ page }) => {
  test.setTimeout(120_000);
  await newDocument(page, 400, 300);
  await addPaintLayer(page);
  await layerCount(page, 2);
  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Size', { exact: true }).fill('20');
  await stroke(page, 81, [100, 150], [110, 150]);

  // The stroke is stored at its bounding box plus a 64 px margin, in place.
  const trimmed = await storedWithin(page, 60 + 128, 60 + 128);
  await settled(page);
  expect(trimmed.layer.matrix.slice(0, 4)).toEqual([1, 0, 0, 1]);
  expect(trimmed.layer.matrix[4]).toBeGreaterThan(70 - 64);
  expect(trimmed.layer.matrix[5]).toBeGreaterThan(110 - 64);
  const [kept] = await composite(page, [[105, 150]]);
  expect(kept[0]).toBeGreaterThan(200);
  expect(kept[3]).toBeGreaterThan(200);
  // One stroke is one history step: undo empties the layer, redo restores it.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect((await composite(page, [[105, 150]]))[0][3]).toBe(0);
  const beforeStroke = await activeLayer(page);
  expect([beforeStroke.asset.w, beforeStroke.asset.h]).toEqual([1, 1]);
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  expect((await composite(page, [[105, 150]]))[0][3]).toBeGreaterThan(200);

  // Paint far outside the stored bounds: the layer grows and keeps both marks,
  // then is stored at the union of both strokes.
  await stroke(page, 82, [300, 60], [310, 60]);
  const painted = await storedWithin(page, 260 + 128, 140 + 128);
  await settled(page);
  expect(painted.asset.w).toBeGreaterThan(200);
  const [first, second, empty] = await composite(page, [[105, 150], [305, 60], [200, 250]]);
  expect(first[0]).toBeGreaterThan(200);
  expect(first[3]).toBeGreaterThan(200);
  expect(second[0]).toBeGreaterThan(200);
  expect(second[3]).toBeGreaterThan(200);
  expect(empty[3]).toBe(0);
  const paintedPixels = await canvas(page).evaluate((element: HTMLCanvasElement) => element.toDataURL());

  // A single undo removes the second stroke (the expansion is folded into it).
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect((await composite(page, [[305, 60]]))[0][3]).toBe(0);
  const undone = await activeLayer(page);
  expect([undone.asset.w, undone.asset.h]).toEqual([trimmed.asset.w, trimmed.asset.h]);
  expect(undone.layer.matrix).toEqual(trimmed.layer.matrix);
  expect((await composite(page, [[105, 150]]))[0][3]).toBeGreaterThan(200);
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  expect((await composite(page, [[305, 60]]))[0][0]).toBeGreaterThan(200);

  // A portable project roundtrip keeps the pixels and the stored-bounds history.
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

test('a blurred paint layer grows for the filter and Rasterize stores the baked result at its content bounds', async ({ page }) => {
  test.setTimeout(120_000);
  await newDocument(page, 400, 300);
  await addPaintLayer(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('20');
  await stroke(page, 90, [100, 150], [110, 150]);
  const painted = await storedWithin(page, 60 + 128, 60 + 128);
  // Choosing a live filter grows the layer to the canvas so the blur is not clipped.
  await menu(page, 'Filter', 'Gaussian Blur…');
  await expect(page.getByLabel('Filter effect', { exact: true })).toHaveValue('gaussian-blur');
  await page.getByLabel('Effect amount', { exact: true }).fill('100');
  await settled(page);
  const blurred = await activeLayer(page);
  expect([blurred.asset.w, blurred.asset.h]).toEqual([400, 300]);
  const composite = await canvas(page).evaluate((element: HTMLCanvasElement) => element.toDataURL());
  // Baking keeps the pixels and returns the layer to its content bounds.
  await menu(page, 'Layer', 'Rasterize');
  await settled(page);
  const baked = await storedWithin(page, 300, 250);
  expect(baked.asset.w * baked.asset.h).toBeLessThan(400 * 300);
  expect(baked.asset.w).toBeGreaterThanOrEqual(painted.asset.w - 10);
  expect(await canvas(page).evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(composite);
});
