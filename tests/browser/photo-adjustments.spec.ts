import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { test, expect, type Page } from '@playwright/test';

type RGBA = [number, number, number, number];
type Asset = { url: string; w: number; h: number };
type PhotoSettings = {
  exposure: number;
  vibrance: number;
  blackAndWhite: boolean;
};
type Project = {
  history: Array<{
    layers: Array<{
      kind?: string;
      asset?: string;
      mask?: string;
      fill?: boolean;
      color?: string;
      opacity?: number;
      adjustments?: {
        photoAdjustments?: PhotoSettings;
      };
    }>;
  }>;
  index: number;
  assets: Record<string, Asset>;
};

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page
    .getByRole('menuitem', { name: 'Download project file', exact: true })
    .click();
  const download = await pending;
  return await downloadedProject((await download.path())!) as Project;
}

const activeLayer = (value: Project) => value.history[value.index].layers.at(-1)!;

async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText(
    'Saved on this device',
  );
}

async function undo(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
}

async function reload(page: Page) {
  await saved(page);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
}

/** PNG fixture bands isolate opaque, partially transparent and empty pixels. */
async function importFixture(page: Page, bands: RGBA[], name: string) {
  const png = await page.evaluate((colors) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 60;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const band = Math.min(colors.length - 1, Math.floor(x * colors.length / canvas.width));
        image.data.set(colors[band], (y * canvas.width + x) * 4);
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  }, bands);
  await page.getByTestId('file-input').setInputFiles({
    name: `${name}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('width', '120');
  await expect(page.getByTestId('editor-canvas')).toHaveAttribute('height', '60');
  await expect(page.locator('footer')).toContainText('Photo opened as a flattened raster');
  await saved(page);
  return project(page);
}

async function pixels(page: Page, points = [[0.16, 0.5], [0.5, 0.5], [0.84, 0.5]]) {
  const canvas = page.getByTestId('editor-canvas');
  await expect(canvas).toHaveAttribute('data-rendering', 'false');
  return canvas.evaluate((element: HTMLCanvasElement, samples) =>
    samples.map(([x, y]) => Array.from(element.getContext('2d')!.getImageData(
      Math.min(element.width - 1, Math.floor(element.width * x)),
      Math.min(element.height - 1, Math.floor(element.height * y)),
      1,
      1,
    ).data)), points);
}

async function roundTrip(page: Page, value: Project) {
  await page.getByTestId('project-input').setInputFiles({
    name: 'photo-adjustments-roundtrip.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.locator('footer')).toContainText('Project opened with editable layers and history');
  await saved(page);
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.getByTestId('editor-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
}

function expectSameSources(before: Project, after: Project) {
  const layer = activeLayer(before);
  expect(activeLayer(after).asset).toBe(layer.asset);
  expect(after.assets[layer.asset!]).toEqual(before.assets[layer.asset!]);
}

function expectNear(actual: number[], expected: number[], tolerance = 2) {
  expect(actual).toHaveLength(expected.length);
  for (let channel = 0; channel < expected.length; channel += 1)
    expect(Math.abs(actual[channel] - expected[channel])).toBeLessThanOrEqual(tolerance);
}

test('photo finishing controls are nondestructive, persisted and undoable', async ({
  page,
}) => {
  const before = await project(page);
  const sourceAsset = before.history[before.index].layers.at(-1)?.asset;
  await page.getByLabel('Exposure', { exact: true }).fill('1.5');
  await page.getByLabel('Vibrance', { exact: true }).fill('35');
  await page.getByLabel('Black and White', { exact: true }).check();

  let adjusted = await project(page);
  const layer = adjusted.history[adjusted.index].layers.at(-1)!;
  expect(layer.adjustments?.photoAdjustments).toEqual({
    exposure: 1.5,
    vibrance: 35,
    blackAndWhite: true,
    highlights: 0,
    shadows: 0,
    temperature: 0,
    tint: 0,
    clarity: 0,
  });
  expect(layer.asset).toBe(sourceAsset);
  expect(adjusted.assets[sourceAsset!]).toEqual(before.assets[sourceAsset!]);

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Undo/ }).click();
  adjusted = await project(page);
  expect(adjusted.history[adjusted.index].layers.at(-1)?.adjustments?.photoAdjustments).toEqual({
    exposure: 0,
    vibrance: 0,
    blackAndWhite: false,
    highlights: 0,
    shadows: 0,
    temperature: 0,
    tint: 0,
    clarity: 0,
  });

  await page.getByLabel('Exposure', { exact: true }).fill('2');
  await page.getByLabel('Vibrance', { exact: true }).fill('-20');
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  adjusted = await project(page);
  expect(adjusted.history[adjusted.index].layers.at(-1)?.adjustments?.photoAdjustments).toEqual({
    exposure: 2,
    vibrance: -20,
    blackAndWhite: false,
    highlights: 0,
    shadows: 0,
    temperature: 0,
    tint: 0,
    clarity: 0,
  });
});

test('Exposure changes imported RGBA pixels in stops, preserves alpha and survives undo/reload/project import', async ({ page }) => {
  const source = await importFixture(page, [[64, 96, 128, 255], [32, 48, 64, 128], [9, 17, 31, 0]], 'exposure-rgba');
  const before = await pixels(page);
  await page.getByLabel('Exposure', { exact: true }).fill('1');
  await expect.poll(async () => (await pixels(page))[0]).toEqual([128, 192, 255, 255]);
  const changedPixels = await pixels(page);
  expectNear(changedPixels[1].slice(0, 3), before[1].slice(0, 3).map((value) => value * 2));
  expect(changedPixels.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  const changed = await project(page);
  expectSameSources(source, changed);
  await undo(page);
  await expect.poll(() => pixels(page)).toEqual(before);
  await page.getByLabel('Exposure', { exact: true }).fill('1');
  await reload(page);
  await expect.poll(() => pixels(page)).toEqual(changedPixels);
  await roundTrip(page, changed);
  await expect.poll(() => pixels(page)).toEqual(changedPixels);
  expectSameSources(source, await project(page));
});

test('Vibrance increases muted chroma conservatively and desaturates without changing opaque or partial alpha', async ({ page }) => {
  const source = await importFixture(page, [[110, 100, 90, 255], [255, 0, 0, 128], [99, 15, 77, 0]], 'vibrance-rgba');
  const before = await pixels(page);
  const chroma = (pixel: number[]) => Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3));
  await page.getByLabel('Vibrance', { exact: true }).fill('80');
  await expect.poll(async () => chroma((await pixels(page))[0])).toBeGreaterThan(chroma(before[0]));
  const vibrant = await pixels(page);
  expect(vibrant[1]).toEqual(before[1]);
  expect(vibrant.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  expectSameSources(source, await project(page));
  await undo(page);
  await expect.poll(() => pixels(page)).toEqual(before);
  await page.getByLabel('Vibrance', { exact: true }).fill('-100');
  await expect.poll(async () => chroma((await pixels(page))[0])).toBeLessThanOrEqual(1);
  const desaturated = await pixels(page);
  expect(desaturated.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  const stored = await project(page);
  await reload(page);
  await expect.poll(() => pixels(page)).toEqual(desaturated);
  await roundTrip(page, stored);
  await expect.poll(() => pixels(page)).toEqual(desaturated);
  expectSameSources(source, await project(page));
});

test('Black and White converts imported colors to perceptual gray while preserving transparency and source data', async ({ page }) => {
  const source = await importFixture(page, [[64, 96, 128, 255], [40, 100, 160, 128], [255, 80, 10, 0]], 'black-white-rgba');
  const before = await pixels(page);
  await page.getByLabel('Black and White', { exact: true }).check();
  await expect.poll(async () => (await pixels(page))[0]).toEqual([92, 92, 92, 255]);
  const gray = await pixels(page);
  expect(Math.max(...gray[1].slice(0, 3)) - Math.min(...gray[1].slice(0, 3))).toBeLessThanOrEqual(1);
  expect(gray.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  const stored = await project(page);
  expectSameSources(source, stored);
  await undo(page);
  await expect.poll(() => pixels(page)).toEqual(before);
  await page.getByLabel('Black and White', { exact: true }).check();
  await reload(page);
  await expect.poll(() => pixels(page)).toEqual(gray);
  await roundTrip(page, stored);
  await expect.poll(() => pixels(page)).toEqual(gray);
  expectSameSources(source, await project(page));
});

test('photo finishing respects raster masks and partial alpha without baking either source asset', async ({ page }) => {
  await importFixture(page, [[48, 64, 80, 255], [32, 48, 64, 128], [96, 80, 64, 255]], 'masked-photo');
  await selectTool(page, 'Select');
  await drag(page, [0.08, 0.1], [0.7, 0.9]);
  await page.getByRole('button', { name: 'Mask from selection', exact: true }).click();
  await expect(page.getByText('Nondestructive mask active', { exact: true })).toBeVisible();
  const before = await pixels(page);
  expect(before[0][3]).toBe(255);
  expect(before[1][3]).toBe(128);
  expect(before[2][3]).toBe(0);
  const masked = await project(page), mask = activeLayer(masked).mask!;
  await page.getByLabel('Exposure', { exact: true }).fill('1');
  await expect.poll(async () => (await pixels(page))[0]).toEqual([96, 128, 160, 255]);
  const exposed = await pixels(page);
  expectNear(exposed[1].slice(0, 3), before[1].slice(0, 3).map((value) => value * 2));
  expect(exposed.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  const stored = await project(page);
  expectSameSources(masked, stored);
  expect(activeLayer(stored).mask).toBe(mask);
  expect(stored.assets[mask]).toEqual(masked.assets[mask]);
  await undo(page);
  await expect.poll(() => pixels(page)).toEqual(before);
  await roundTrip(page, stored);
  await reload(page);
  await expect.poll(() => pixels(page)).toEqual(exposed);
});

test('photo finishing composes with Hue on editable translucent vector shapes without recursive rendering', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await importFixture(page, [[0, 0, 0, 0]], 'vector-backdrop');
  await page.getByLabel('Drawing color', { exact: true }).fill('#403020');
  await selectTool(page, 'Shape');
  await drag(page, [0.1, 0.15], [0.75, 0.85]);
  await page.getByLabel('Filled shape', { exact: true }).check();
  await page.getByLabel('Shape color', { exact: true }).fill('#403020');
  await page.getByLabel('Layer opacity', { exact: true }).fill('65');
  await page.getByLabel('Hue', { exact: true }).fill('60');
  const points = [[0.4, 0.5], [0.95, 0.5]];
  const before = await pixels(page, points);
  expect(before[0][3]).toBeGreaterThan(150);
  expect(before[1][3]).toBe(0);
  const vector = await project(page);
  expect(activeLayer(vector)).toMatchObject({ kind: 'rectangle', fill: true, color: '#403020', opacity: 0.65 });
  await page.getByLabel('Exposure', { exact: true }).fill('1');
  await expect.poll(async () => (await pixels(page, points))[0][0]).toBeGreaterThan(before[0][0]);
  const exposed = await pixels(page, points);
  expectNear(exposed[0].slice(0, 3), before[0].slice(0, 3).map((value) => value * 2), 3);
  expect(exposed.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  // Decorated vector layers must still render when several existing
  // nondestructive adjustments are stacked with the new photo controls.
  await page.getByLabel('RGB midpoint', { exact: true }).fill('180');
  await page.getByLabel('Shadows cyan/red', { exact: true }).fill('20');
  await page.getByLabel('Sharpen amount', { exact: true }).fill('18');
  const decorated = await pixels(page, points);
  expect(decorated[0]).not.toEqual(exposed[0]);
  expect(decorated.map((pixel) => pixel[3])).toEqual(before.map((pixel) => pixel[3]));
  const stored = await project(page);
  expect(activeLayer(stored)).toMatchObject({ kind: 'rectangle', fill: true, color: '#403020', opacity: 0.65 });
  expect(activeLayer(stored).asset).toBeUndefined();
  expect(stored.assets).toEqual(vector.assets);
  for (let edit = 0; edit < 4; edit += 1) await undo(page);
  await expect.poll(() => pixels(page, points)).toEqual(before);
  await roundTrip(page, stored);
  await reload(page);
  await expect.poll(() => pixels(page, points)).toEqual(decorated);
  await expect(page.getByLabel('Shape color', { exact: true })).toHaveValue('#403020');
  expect(errors).toEqual([]);
});

test('Camera Raw Filter exposes bounded raw-style controls, preserves alpha and round-trips', async ({ page }) => {
  const source = await importFixture(page, [[238, 198, 176, 255], [24, 36, 48, 127], [9, 8, 7, 0]], 'camera-raw-rgba');
  const before = await pixels(page);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const command = page.getByRole('menuitem', { name: 'Camera Raw Filter…', exact: true });
  await expect(command).toBeEnabled();
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Camera Raw Filter' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Highlights', { exact: true }).fill('-70');
  await dialog.getByLabel('Shadows', { exact: true }).fill('75');
  await dialog.getByLabel('Temperature', { exact: true }).fill('60');
  await dialog.getByLabel('Tint', { exact: true }).fill('-30');
  await dialog.getByLabel('Clarity', { exact: true }).fill('45');
  await dialog.getByRole('button', { name: 'Apply Camera Raw', exact: true }).click();
  await expect(page.getByText('Camera Raw correction applied; remains editable', { exact: true })).toBeVisible();
  const adjusted = await project(page);
  expect(activeLayer(adjusted).adjustments?.photoAdjustments).toMatchObject({
    highlights: -70,
    shadows: 75,
    temperature: 60,
    tint: -30,
    clarity: 45,
  });
  expectSameSources(source, adjusted);
  const after = await pixels(page);
  expect(after[0]).not.toEqual(before[0]);
  expect(after[1][3]).toBe(before[1][3]);
  expect(after[2]).toEqual(before[2]);
  await undo(page);
  await expect.poll(() => pixels(page)).toEqual(before);
  await roundTrip(page, adjusted);
  await reload(page);
  await expect.poll(() => pixels(page)).toEqual(after);
});
