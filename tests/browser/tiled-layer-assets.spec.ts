import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';
import { selectTool } from './tool-selection';
import { downloadedProject } from './project-file';

// Large layers are stored as content-addressed 256 × 256 PNG tiles
// (docs/tiled-layer-assets-contract.md): a stroke stores only the tiles it
// changed, drafts keep one record per distinct tile, and .pixelforge files
// stay single-PNG (v3) assets. Pixels must be identical through undo, redo,
// reload and project round trips.

const W = 1600;
const H = 1200;
const TILES = Math.ceil(W / 256) * Math.ceil(H / 256);

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([length, body, sum]);
};
/** A photo-like, noisy RGB PNG (every tile distinct). */
function noisyPng() {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let state = 11;
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W * 3; x++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      raw[row + 1 + x] = ((x >> 3) + (y >> 2) + (state >>> 29)) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 60_000 });
const saved = (page: Page) =>
  expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 60_000,
  });
const historyPosition = (page: Page) =>
  page.getByRole('region', { name: 'History' }).getByLabel('History position');

test.beforeEach(async ({ page }) => {
  await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
    route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false');
  await saved(page);
});

function draftId(page: Page) {
  const id = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(id).toBeTruthy();
  return id!;
}

type Ref = { hash?: string; w: number; h: number; tileSize?: number; tiles?: (string | null)[] };
type Stored = {
  format: number;
  historyLength: number;
  layerAsset: string;
  layers: Array<{ id: string; kind: string; asset?: string }>;
  assetRefs: Record<string, Ref>;
  tileRefs: Record<string, string>;
  records: Record<string, string>;
};

/** This draft's manifest, the current frame's top layer asset and its record kinds. */
const stored = (page: Page, id: string) =>
  page.evaluate(
    (draftId) =>
      new Promise<Stored>((resolve, reject) => {
        const opened = indexedDB.open('pixelforge-documents');
        opened.onerror = () => reject(opened.error);
        opened.onsuccess = () => {
          const database = opened.result;
          const transaction = database.transaction(['drafts', 'draftBlobs']);
          const pointer = transaction.objectStore('drafts').get(draftId);
          const range = IDBKeyRange.bound(`asset:${draftId}:`, `asset:${draftId}:~`);
          const values = transaction.objectStore('draftBlobs').getAll(range);
          const keys = transaction.objectStore('draftBlobs').getAllKeys(range);
          transaction.oncomplete = () => {
            database.close();
            const value = pointer.result;
            const frame = value.history[value.index];
            const records: Record<string, string> = {};
            keys.result.forEach((key, index) => {
              records[key as string] = values.result[index].kind;
            });
            resolve({
              format: value.format,
              historyLength: value.history.length,
              layerAsset: frame.layers.at(-1).asset,
              layers: frame.layers.map((layer: { id: string; kind: string; asset?: string }) => ({
                id: layer.id,
                kind: layer.kind,
                asset: layer.asset,
              })),
              assetRefs: value.assetRefs,
              tileRefs: value.tileRefs || {},
              records,
            });
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    id,
  );

/** Poll the stored draft until `ready` holds (saves are debounced). */
async function storedWhen(page: Page, id: string, ready: (value: Stored) => boolean) {
  let latest: Stored | undefined;
  await expect
    .poll(
      async () => {
        latest = await stored(page, id).catch(() => undefined);
        return latest !== undefined && ready(latest);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await saved(page);
  return stored(page, id);
}

/** SHA-256 of the composited editor canvas. */
const digest = (page: Page) =>
  canvas(page).evaluate(async (element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    const hash = await crypto.subtle.digest('SHA-256', pixels);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  });
async function settledDigest(page: Page) {
  await settled(page);
  let previous = '';
  let current = await digest(page);
  for (let attempt = 0; attempt < 30 && current !== previous; attempt += 1) {
    await page.waitForTimeout(300);
    previous = current;
    current = await digest(page);
  }
  return current;
}

async function importPhoto(page: Page) {
  await page.getByTestId('file-input').setInputFiles({ name: 'noisy-photo.png', mimeType: 'image/png', buffer: noisyPng() });
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await settled(page);
  await saved(page);
}

/** A short horizontal brush stroke at document row y (from x0 to x1). */
async function stroke(page: Page, pointerId: number, x0: number, x1: number, y: number) {
  const before = await historyPosition(page).innerText();
  await canvas(page).scrollIntoViewIfNeeded();
  await canvas(page).evaluate(
    async (element: HTMLCanvasElement, { pointerId, x0, x1, y }) => {
      element.setPointerCapture = () => undefined;
      const rect = element.getBoundingClientRect();
      const client = (x: number) => ({
        clientX: rect.left + ((x + 0.5) / element.width) * rect.width,
        clientY: rect.top + ((y + 0.5) / element.height) * rect.height,
      });
      const common = { pointerId, pointerType: 'mouse', pressure: 1, isPrimary: true, bubbles: true };
      element.dispatchEvent(new PointerEvent('pointerdown', { ...common, buttons: 1, button: 0, ...client(x0) }));
      for (let i = 1; i <= 12; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        element.dispatchEvent(new PointerEvent('pointermove', { ...common, buttons: 1, ...client(x0 + ((x1 - x0) * i) / 12) }));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      element.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0, button: 0, ...client(x1) }));
    },
    { pointerId, x0, x1, y },
  );
  await expect(historyPosition(page)).not.toHaveText(before, { timeout: 60_000 });
  await settled(page);
}

async function menu(page: Page, name: string, item: RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
  await settled(page);
}

test('a stroke on a large photo layer stores only the tiles it touched, with exact undo, redo and reload', async ({ page }) => {
  test.setTimeout(240_000);
  await importPhoto(page);
  const id = draftId(page);
  const first = await storedWhen(page, id, (value) => value.assetRefs[value.layerAsset]?.w === W);
  expect(first.format).toBe(4);
  const photo = first.assetRefs[first.layerAsset];
  expect(photo.w).toBe(W);
  expect(photo.tileSize).toBe(256);
  expect(photo.tiles).toHaveLength(TILES);
  expect(new Set(photo.tiles).size).toBe(TILES);
  // One record per distinct tile; the manifest carries no pixels.
  expect(Object.values(first.records).filter((kind) => kind === 'pixelforge-draft-tile')).toHaveLength(
    Object.keys(first.tileRefs).length,
  );
  const original = await settledDigest(page);

  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('24');
  // Inside tile column 2 (512–767), row 2 (512–767).
  await stroke(page, 61, 560, 700, 600);
  const second = await storedWhen(page, id, (value) => value.historyLength === first.historyLength + 1);
  const painted = second.assetRefs[second.layerAsset];
  expect(second.layerAsset).not.toBe(first.layerAsset);
  expect(painted.tiles).toHaveLength(TILES);
  const changed = painted.tiles!.flatMap((key, index) => (key === photo.tiles![index] ? [] : [index]));
  expect(changed.length).toBeGreaterThanOrEqual(1);
  expect(changed.length).toBeLessThanOrEqual(2);
  expect(changed).toContain(2 * 7 + 2);
  // The save wrote exactly the new tiles and kept every record history needs.
  const added = Object.keys(second.records).filter((key) => !(key in first.records));
  const removed = Object.keys(first.records).filter((key) => !(key in second.records));
  expect(added).toHaveLength(changed.length);
  expect(removed).toHaveLength(0);
  expect(second.assetRefs[first.layerAsset]).toEqual(photo);

  const painted1 = await settledDigest(page);
  expect(painted1).not.toBe(original);
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(original);
  await menu(page, 'Edit', /^Redo/);
  expect(await settledDigest(page)).toBe(painted1);

  // A second stroke elsewhere shares every other tile again.
  await stroke(page, 62, 1300, 1420, 1100);
  const third = await storedWhen(page, id, (value) => value.historyLength === second.historyLength + 1);
  const painted2 = third.assetRefs[third.layerAsset];
  const changedAgain = painted2.tiles!.flatMap((key, index) => (key === painted.tiles![index] ? [] : [index]));
  expect(changedAgain).toEqual([4 * 7 + 5]);
  const beforeReload = await settledDigest(page);

  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await expect(canvas(page)).toHaveJSProperty('width', W);
  expect(await settledDigest(page)).toBe(beforeReload);
  await saved(page);
  const reloaded = await stored(page, id);
  expect(reloaded.assetRefs).toEqual(third.assetRefs);
  expect(Object.keys(reloaded.records).sort()).toEqual(Object.keys(third.records).sort());
  // History survived the reload with the same pixels.
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(painted1);
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(original);
});

test('a tiled document exports single-PNG .pixelforge assets that import, render and become tiled again on edit', async ({ page }) => {
  test.setTimeout(240_000);
  await importPhoto(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('30');
  await stroke(page, 71, 200, 400, 300);
  await saved(page);
  const painted = await settledDigest(page);

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download project file', exact: true }).click();
  const download = await pending;
  const path = (await download.path())!;
  const project = (await downloadedProject(path)) as {
    history: Array<{ layers: Array<{ asset?: string }> }>;
    index: number;
    assets: Record<string, { url: string; w: number; h: number }>;
  };
  // v3 files keep one PNG per asset: tiles are flattened on export.
  const photoAssets = Object.values(project.assets).filter((asset) => asset.w === W && asset.h === H);
  expect(photoAssets.length).toBeGreaterThanOrEqual(2);
  for (const asset of photoAssets) expect(asset.url.startsWith('data:image/png;base64,')).toBe(true);
  const exportedLayer = project.assets[project.history[project.index].layers.at(-1)!.asset!];
  // The flattened PNG holds exactly the painted layer pixels.
  const layerPixels = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.naturalWidth;
    surface.height = image.naturalHeight;
    const context = surface.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const hash = await crypto.subtle.digest('SHA-256', context.getImageData(0, 0, surface.width, surface.height).data);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }, exportedLayer.url);
  expect(layerPixels).toBe(painted);

  // Open the file in a fresh document: the legacy (data-URL) assets load and
  // render identically.
  await page.getByTestId('project-input').setInputFiles(path);
  await settled(page);
  await saved(page);
  expect(await settledDigest(page)).toBe(painted);
  const id = draftId(page);
  const opened = await storedWhen(page, id, (value) => value.assetRefs[value.layerAsset]?.w === W && value.format === 3);
  expect(opened.format).toBe(3);
  expect(opened.assetRefs[opened.layerAsset].hash).toMatch(/^[a-f0-9]{64}$/);

  // The next edit stores that layer tiled; undo returns to the data-URL asset.
  await stroke(page, 72, 900, 1100, 900);
  const edited = await storedWhen(page, id, (value) => value.historyLength === opened.historyLength + 1);
  expect(edited.format).toBe(4);
  expect(edited.assetRefs[edited.layerAsset].tiles).toHaveLength(TILES);
  expect(edited.assetRefs[opened.layerAsset]).toEqual(opened.assetRefs[opened.layerAsset]);
  const after = await settledDigest(page);
  expect(after).not.toBe(painted);
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(painted);
  await menu(page, 'Edit', /^Redo/);
  expect(await settledDigest(page)).toBe(after);
});

/** Image point at `radius` from (cx, cy), `degrees` clockwise from +x. */
const polar = (cx: number, cy: number, radius: number, degrees: number): [number, number] => [
  cx + radius * Math.cos((degrees * Math.PI) / 180),
  cy + radius * Math.sin((degrees * Math.PI) / 180),
];

const pixelAt = (page: Page, x: number, y: number) =>
  canvas(page).evaluate(
    (element: HTMLCanvasElement, point) =>
      Array.from(element.getContext('2d')!.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data),
    { x, y },
  );

async function setColor(page: Page, value: string) {
  await page.getByLabel('Drawing color', { exact: true }).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Tile indexes whose key differs between two tiled refs. */
const changedTiles = (before: Ref, after: Ref) =>
  after.tiles!.flatMap((key, index) => (key === before.tiles![index] ? [] : [index]));

test('symmetry strokes and Stroke Path with Brush on a large tiled layer store only touched tiles and survive reload', async ({ page }) => {
  test.setTimeout(300_000);
  await importPhoto(page);
  const id = draftId(page);
  const first = await storedWhen(page, id, (value) => value.assetRefs[value.layerAsset]?.w === W);
  const photoLayer = first.layers.at(-1)!;
  const photo = first.assetRefs[photoLayer.asset!];
  expect(photo.tiles).toHaveLength(TILES);
  const original = await settledDigest(page);

  // Radial symmetry (8 copies about the canvas centre) on the photo layer.
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('20');
  await setColor(page, '#ff0000');
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption('radial');
  await expect(page.getByTestId('paint-symmetry-summary')).toHaveText('8 copies per dab');
  const [cx, cy] = [W / 2, H / 2];
  const from = polar(cx, cy, 380, 0), to = polar(cx, cy, 440, 0);
  await stroke(page, 81, from[0], to[0], from[1]);
  const second = await storedWhen(page, id, (value) => value.historyLength === first.historyLength + 1);
  const mirrored = second.assetRefs[second.layers.find((layer) => layer.id === photoLayer.id)!.asset!];
  expect(mirrored.tiles).toHaveLength(TILES);
  const symmetryTiles = changedTiles(photo, mirrored);
  // Eight short copies touch a handful of tiles each side of the centre, not the layer.
  expect(symmetryTiles.length).toBeGreaterThanOrEqual(8);
  expect(symmetryTiles.length).toBeLessThan(TILES / 2);
  const added = Object.keys(second.records).filter((key) => !(key in first.records));
  expect(added).toHaveLength(symmetryTiles.length);
  for (const k of [0, 2, 3, 5]) {
    const [x, y] = polar(cx, cy, 410, 45 * k);
    expect((await pixelAt(page, x, y)).slice(0, 3), `copy ${k}`).toEqual([255, 0, 0]);
  }
  const symmetric = await settledDigest(page);
  expect(symmetric).not.toBe(original);
  await page.getByLabel('Paint symmetry', { exact: true }).selectOption('off');

  // Stroke Path with Brush: a Curvature Pen path stroked onto the photo layer.
  await selectTool(page, 'Curvature Pen');
  for (const [x, y] of [[300, 300], [800, 180], [1300, 420], [300, 300]]) {
    const box = (await canvas(page).boundingBox())!;
    await page.mouse.click(box.x + (x / W) * box.width, box.y + (y / H) * box.height);
  }
  await expect(page.locator('footer')).toContainText('Editable curvature path layer added');
  await settled(page);
  await selectTool(page, 'Brush');
  await page.getByLabel('Size', { exact: true }).fill('24');
  await page.getByLabel('Size', { exact: true }).press('Enter');
  await setColor(page, '#0000ff');
  const withPath = await storedWhen(page, id, (value) => value.layers.some((layer) => layer.kind === 'path'));
  const beforePath = await settledDigest(page);
  await page.getByRole('button', { name: 'Layer', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stroke Path with Brush…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke Path with Brush' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Stroke target layer').selectOption(photoLayer.id);
  await dialog.getByRole('button', { name: 'Stroke path', exact: true }).click();
  await expect(page.locator('footer')).toContainText('Path stroked with Brush');
  await settled(page);
  const third = await storedWhen(page, id, (value) => value.historyLength === withPath.historyLength + 1);
  const pathed = third.assetRefs[third.layers.find((layer) => layer.id === photoLayer.id)!.asset!];
  expect(pathed.tiles).toHaveLength(TILES);
  const pathTiles = changedTiles(mirrored, pathed);
  expect(pathTiles.length).toBeGreaterThanOrEqual(3);
  expect(pathTiles.length).toBeLessThan(TILES);
  const pathAdded = Object.keys(third.records).filter((key) => !(key in withPath.records));
  expect(pathAdded).toHaveLength(pathTiles.length);
  // Tiles neither edit touched are still the imported photo's tile objects' keys.
  const untouched = photo.tiles!.filter((key, index) => !symmetryTiles.includes(index) && !pathTiles.includes(index));
  for (const key of untouched) expect(pathed.tiles).toContain(key);
  const stroked = await settledDigest(page);
  expect(stroked).not.toBe(beforePath);

  // Undo / redo across both edits.
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(beforePath);
  await menu(page, 'Edit', /^Redo/);
  expect(await settledDigest(page)).toBe(stroked);

  // Format 4 draft reload: identical pixels, refs and records; history undoable.
  await saved(page);
  const final = await stored(page, id);
  expect(final.format).toBe(4);
  await page.reload();
  await expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
  await expect(canvas(page)).toHaveJSProperty('width', W);
  expect(await settledDigest(page)).toBe(stroked);
  await saved(page);
  const reloaded = await stored(page, id);
  expect(reloaded.assetRefs).toEqual(final.assetRefs);
  expect(Object.keys(reloaded.records).sort()).toEqual(Object.keys(final.records).sort());
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(beforePath);
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(symmetric);
  await menu(page, 'Edit', /^Undo/);
  expect(await settledDigest(page)).toBe(original);
});
