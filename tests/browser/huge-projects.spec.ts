import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';
import { writePortableBundle } from '../../src/portableBundle';
import { CURRENT_DRAFT_VERSION } from '../../src/drafts';
import { neutral } from '../../src/document';

type Asset = { url: string; w: number; h: number };
type ProjectLayer = { id: string; kind: string; name: string; asset?: string; matrix: number[] };
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
  await ready(page);
});

// Desktop Chrome gets the desktop tier; the Pixel 7 project gets the phone tier.
const tierMP = () => (test.info().project.name === 'mobile' ? 256 : 1024);
const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const budget = (page: Page) => page.getByTestId('layer-pixel-budget');
const ready = (page: Page) =>
  expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 120_000,
  });
const layerCount = (page: Page, count: number) =>
  expect(page.getByRole('heading', { name: new RegExp(`^Layers ${count} / 512$`) })).toBeVisible({ timeout: 60_000 });

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

async function project(page: Page): Promise<Project> {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  return (await downloadedProject((await download.path())!)) as Project;
}

async function clientPoint(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  const size = await canvas(page).evaluate((element: HTMLCanvasElement) => [element.width, element.height]);
  return { clientX: box.x + ((x + 0.5) / size[0]) * box.width, clientY: box.y + ((y + 0.5) / size[1]) * box.height };
}

async function stroke(page: Page, pointerId: number, from: [number, number], to: [number, number]) {
  const start = await clientPoint(page, ...from);
  await canvas(page).evaluate((element) => {
    element.setPointerCapture = () => undefined;
  });
  const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true };
  await canvas(page).dispatchEvent('pointerdown', { ...common, ...start, buttons: 1 });
  await page.waitForTimeout(200);
  const end = await clientPoint(page, ...to);
  await canvas(page).dispatchEvent('pointermove', { ...common, ...end, buttons: 1 });
  await canvas(page).dispatchEvent('pointerup', { ...common, ...end, buttons: 0 });
  await settled(page);
}

const alphaAt = (page: Page, points: Array<[number, number]>) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, list) =>
      list.map(([x, y]) => element.getContext('2d')!.getImageData(x, y, 1, 1).data[3]),
    points,
  );

const canvasDigest = (page: Page) =>
  canvas(page).evaluate(async (element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });

/** The active-layer marks: one stroke per painted layer, spread over the whole poster. */
const MARKS: Array<[number, number]> = [
  [120, 140], [2500, 160], [1320, 2050], [140, 3950], [2500, 3940],
  [700, 900], [1900, 1100], [600, 3000], [2000, 2900], [1320, 3600],
];

test('a 2646 × 4096 poster keeps 41 separate layers with sparse strokes, across undo, reload and export', async ({ page }) => {
  test.setTimeout(420_000);
  await newDocument(page, 2646, 4096);
  await expect(budget(page)).toHaveText(`Pixel budget 10.8 / ${tierMP()} MP`);
  for (let count = 2; count <= 41; count += 1) {
    await page.getByRole('button', { name: 'Add paint layer', exact: true }).click();
    await layerCount(page, count);
  }
  await settled(page);
  // Forty empty paint layers store one pixel each.
  await expect(budget(page)).toHaveText(`Pixel budget 10.8 / ${tierMP()} MP`);
  await expect(footer(page)).not.toContainText('budget reached');

  await selectTool(page, 'Brush');
  await page.getByLabel('Drawing color', { exact: true }).fill('#ff0000');
  await page.getByLabel('Size', { exact: true }).fill('60');
  // Paint one sparse mark on every fourth layer, anywhere on the canvas.
  for (const [index, [x, y]] of MARKS.entries()) {
    await page.getByRole('button', { name: new RegExp(`^Select layer Paint ${index * 4 + 1}\\b`) }).click();
    await stroke(page, 100 + index, [x, y], [x + 40, y + 20]);
    await expect(footer(page)).not.toContainText('budget reached');
  }
  await expect.poll(async () => {
    const value = await project(page);
    const frame = value.history[value.index];
    return frame.layers
      .filter((layer) => layer.kind === 'raster' && layer.name.startsWith('Paint'))
      .every((layer) => value.assets[layer.asset!].w * value.assets[layer.asset!].h < 100_000);
  }, { timeout: 60_000 }).toBe(true);
  await layerCount(page, 41);
  const readout = await budget(page).innerText();
  const used = Number(new RegExp(`Pixel budget ([\\d.]+) / ${tierMP()} MP`).exec(readout)?.[1]);
  expect(used).toBeGreaterThanOrEqual(10.8);
  expect(used).toBeLessThan(12);
  expect(await alphaAt(page, MARKS.map(([x, y]) => [x + 20, y + 10]))).toEqual(MARKS.map(() => 255));
  const painted = await canvasDigest(page);

  // One undo removes exactly the last stroke; redo restores it.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  const [lastX, lastY] = MARKS.at(-1)!;
  expect((await alphaAt(page, [[lastX + 20, lastY + 10], [MARKS[0][0] + 20, MARKS[0][1] + 10]]))).toEqual([0, 255]);
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  expect(await canvasDigest(page)).toBe(painted);

  // Reload restores every layer and pixel from the local draft.
  await saved(page);
  await page.reload();
  await ready(page);
  await layerCount(page, 41);
  await settled(page);
  expect(await canvasDigest(page)).toBe(painted);

  // Portable roundtrip keeps the stored-bounds layers.
  const exported = await project(page);
  expect(exported.history[exported.index].layers).toHaveLength(41);
  await newDocument(page, 300, 200);
  await page.getByTestId('project-input').setInputFiles({
    name: 'poster.pixelforge',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(footer(page)).toContainText('Project opened with editable layers and history', { timeout: 120_000 });
  await layerCount(page, 41);
  await settled(page);
  expect(await canvasDigest(page)).toBe(painted);
});

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';

/** A decodable 1 × 1 PNG followed by `extra` incompressible bytes after IEND. */
function paddedPng(seed: number, extra: number): string {
  const tail = Buffer.alloc(extra);
  let state = (seed * 2654435761) >>> 0;
  for (let index = 0; index < extra; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    tail[index] = state >>> 24;
  }
  return `data:image/png;base64,${Buffer.concat([Buffer.from(png, 'base64'), tail]).toString('base64')}`;
}

test('a portable project above the former 64 MB cap opens, exports and reopens', async ({ page }) => {
  test.setTimeout(300_000);
  const id = (prefix: string, n: number) => `${prefix}-1111-4111-8111-${String(n).padStart(12, '0')}`;
  const assets: Record<string, Asset> = {};
  const layers = [];
  for (let n = 0; n < 9; n += 1) {
    assets[id('11111111', n)] = { url: paddedPng(n + 1, 8 * 1024 * 1024), w: 1, h: 1 };
    layers.push({
      id: id('22222222', n), name: `Layer ${n}`, visible: true, locked: false, opacity: 1, blend: 'source-over',
      matrix: [1, 0, 0, 1, n * 10, n * 10], adjustments: { ...neutral }, kind: 'raster', asset: id('11111111', n),
    });
  }
  const bundle = await writePortableBundle({
    version: CURRENT_DRAFT_VERSION,
    name: 'Large project',
    index: 0,
    settings: { tool: 'move', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
    assets,
    history: [{ w: 400, h: 300, active: layers[0].id, layers }],
  });
  const buffer = Buffer.from(await bundle.arrayBuffer());
  expect(buffer.byteLength).toBeGreaterThan(64 * 1024 * 1024);
  // Large payloads go through a file path (in-memory buffers are size-limited).
  const file = test.info().outputPath('large.pixelforge');
  await writeFile(file, buffer);
  await page.getByTestId('project-input').setInputFiles(file);
  await expect(footer(page)).toContainText('Project opened with editable layers and history', { timeout: 120_000 });
  await layerCount(page, 9);
  await settled(page);

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const path = (await download.path())!;
  const exported = (await downloadedProject(path)) as Project;
  expect(Object.keys(exported.assets)).toHaveLength(9);
  for (const [key, asset] of Object.entries(assets)) expect(exported.assets[key].url).toBe(asset.url);

  await newDocument(page, 200, 200);
  await page.getByTestId('project-input').setInputFiles(path);
  await expect(footer(page)).toContainText('Project opened with editable layers and history', { timeout: 120_000 });
  await layerCount(page, 9);
  await saved(page);
});
