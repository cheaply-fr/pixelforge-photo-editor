import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { writePortableBundle } from '../../src/portableBundle';
import { CURRENT_DRAFT_VERSION } from '../../src/drafts';
import { neutral } from '../../src/document';
import { neutralLayerStyles } from '../../src/layerStyles';

// Delete, hide, show and reorder of a mid-stack layer on a worker-sized
// document resume from a prefix snapshot below the change and reuse the
// cached filtered, clipped and masked results above it, with the same pixels
// as a cold render after reload.

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://marketplace.cheaply.fr/marketplace/api/photoeditor**',
    (route) => route.fulfill({ json: { authenticated: false } }),
  );
  await page.goto('/editor?new=1');
  await ready(page);
});

const canvas = (page: Page) => page.getByTestId('editor-canvas');
const footer = (page: Page) => page.locator('footer');
const ready = (page: Page) =>
  expect(page.getByRole('application')).toHaveAttribute('aria-busy', 'false', { timeout: 60_000 });
const settled = (page: Page) =>
  expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 120_000 });
const selectLayer = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `Select layer ${name}`, exact: true }).click();
  await settled(page);
};
async function menu(page: Page, name: string, item: RegExp) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}
const order = (page: Page) =>
  page
    .getByRole('button', { name: /^Select layer / })
    .evaluateAll((items) => items.map((item) => (item.getAttribute('aria-label') || '').replace(/^Select layer /, '')));
const digest = (page: Page) =>
  canvas(page).evaluate((element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ data[i], 0x01000193);
    return (hash >>> 0).toString(16);
  });

type Reuse = { final: boolean; clippedHits: number; reusedLayers: number; layerHits: number };
const clearMarks = (page: Page) =>
  page.evaluate(() => {
    performance.clearMarks('pixelforge.composite-cache');
    performance.clearMarks('pixelforge.layer-filter-cache');
  });
/** Cache outcome of the committed render(s) since the last clearMarks. */
const reuse = (page: Page): Promise<Reuse> =>
  page.evaluate(() => {
    const composite = performance.getEntriesByName('pixelforge.composite-cache', 'mark') as PerformanceMark[];
    const layer = performance.getEntriesByName('pixelforge.layer-filter-cache', 'mark') as PerformanceMark[];
    const last = (composite.at(-1)?.detail ?? {}) as Partial<Reuse>;
    return {
      final: last.final ?? false,
      clippedHits: composite.reduce((sum, mark) => sum + ((mark.detail as Partial<Reuse>).clippedHits ?? 0), 0),
      reusedLayers: last.reusedLayers ?? 0,
      layerHits: layer.reduce((sum, mark) => sum + ((mark.detail as { hits?: number }).hits ?? 0), 0),
    };
  });

// ----------------------------------------------------------- the document

const W = 1500, H = 1500;
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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
/** An RGBA PNG asset; `pixel` returns [r, g, b, a]. */
function png(w: number, h: number, pixel: (x: number, y: number) => number[]) {
  const stride = w * 4 + 1, raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) raw.set(pixel(x, y), y * stride + 1 + x * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { url: `data:image/png;base64,${bytes.toString('base64')}`, w, h };
}
const uuid = (prefix: string, n: number) => `${prefix}-1111-4111-8111-${String(n).padStart(12, '0')}`;
const layerId = (n: number) => uuid('22222222', n);
const filter = (type: string, radius = 0) => ({
  ...structuredClone(neutral),
  filterEffects: { type, amount: 100, radius, angle: 30, centerX: 0.5, centerY: 0.5, seed: 3 },
});
const styles = (patch: Record<string, unknown>) => ({ ...structuredClone(neutralLayerStyles), ...patch });

/**
 * 14 layers, bottom to top: background fill, Clouds (Overlay), multiply
 * blob, Motion Blur blob, a masked Outer Glow base with two clipped layers
 * (one with Inner Shadow), the probed Layer 7 (Motion Blur), Clouds (Soft
 * Light), a folder with a Soft Light member, a masked Outer Glow base with
 * a clipped layer, and a top blob.
 */
function project() {
  const assets: Record<string, { url: string; w: number; h: number }> = {};
  const layers: Record<string, unknown>[] = [];
  const blobW = 520, blobH = 420;
  const blob = (n: number, color: number[]) => {
    assets[uuid('11111111', n)] = png(blobW, blobH, (x, y) => {
      const dx = (x - blobW / 2) / (blobW / 2), dy = (y - blobH / 2) / (blobH / 2);
      return dx * dx + dy * dy <= 1 ? [...color, 255] : [0, 0, 0, 0];
    });
    return uuid('11111111', n);
  };
  const full = (n: number, color: number[]) => {
    assets[uuid('11111111', n)] = png(W, H, () => [...color, 255]);
    return uuid('11111111', n);
  };
  const mask = uuid('33333333', 0);
  assets[mask] = png(W, H, (x, y) => [0, 0, 0, x > 200 && x < 1300 && y > 150 && y < 1350 ? 255 : 0]);
  const layer = (n: number, patch: Record<string, unknown>) =>
    layers.push({
      id: layerId(n), name: `Layer ${n}`, visible: true, locked: false, opacity: 1, blend: 'source-over',
      matrix: [1, 0, 0, 1, (n * 97) % (W - blobW), (n * 151) % (H - blobH)], adjustments: structuredClone(neutral),
      kind: 'raster', ...patch,
    });
  const identity = [1, 0, 0, 1, 0, 0];
  const glow = styles({ outerGlow: { ...neutralLayerStyles.outerGlow, enabled: true, size: 20 } });
  layer(0, { name: 'Background', asset: full(0, [0, 0, 0]), fillColor: '#f4efe6', matrix: identity });
  layer(1, { asset: full(1, [60, 120, 200]), matrix: identity, opacity: 0.4, blend: 'overlay', adjustments: filter('clouds', 40) });
  layer(2, { asset: blob(2, [220, 60, 60]), blend: 'multiply' });
  layer(3, { asset: blob(3, [60, 160, 90]), adjustments: filter('motion-blur', 18) });
  layer(4, { asset: blob(4, [240, 200, 40]), mask, maskEnabled: true, maskInverted: false, styles: glow });
  layer(5, { asset: blob(5, [170, 90, 220]), clippingTo: layerId(4), styles: styles({ innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true } }) });
  layer(6, { asset: blob(6, [250, 130, 40]), clippingTo: layerId(5), opacity: 0.7 });
  // Overlaps the clipping group, so moving it below the group changes pixels.
  layer(7, { asset: blob(7, [30, 30, 160]), matrix: [1, 0, 0, 1, 450, 700], adjustments: filter('motion-blur', 24) });
  layer(8, { asset: full(8, [200, 80, 40]), matrix: identity, opacity: 0.35, blend: 'soft-light', adjustments: filter('clouds', 40) });
  layer(9, { asset: blob(9, [20, 140, 140]), groupId: uuid('44444444', 1) });
  layer(10, { asset: blob(10, [240, 240, 60]), groupId: uuid('44444444', 1), blend: 'soft-light' });
  layer(11, { asset: blob(11, [90, 200, 110]), mask, maskEnabled: true, maskInverted: false, styles: glow });
  layer(12, { asset: blob(12, [200, 40, 120]), clippingTo: layerId(11) });
  layer(13, { asset: blob(13, [40, 40, 40]), opacity: 0.8 });
  const groups = [{ id: uuid('44444444', 1), name: 'Folder', visible: true, locked: false, opacity: 0.9, blend: 'source-over', collapsed: false }];
  return {
    version: CURRENT_DRAFT_VERSION,
    name: 'Structural edits',
    index: 0,
    settings: { tool: 'move', zoom: 40, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
    assets,
    history: [{ w: W, h: H, active: layerId(13), layers, groups }],
  };
}

test('delete, hide, show and reorder of a mid-stack layer resume from cached composites', async ({ page }) => {
  test.setTimeout(420_000);
  const file = test.info().outputPath('structural.pixelforge');
  await writeFile(file, Buffer.from(await (await writePortableBundle(project())).arrayBuffer()));
  await page.getByTestId('project-input').setInputFiles(file);
  await expect(footer(page)).toContainText('Project opened with editable layers and history', { timeout: 120_000 });
  await expect(canvas(page)).toHaveJSProperty('width', W);
  await settled(page);

  // Work on the top layer, then select Layer 7. Selecting renders nothing
  // new, so no snapshot sits directly below Layer 7.
  await selectLayer(page, 'Layer 13');
  await page.getByLabel('Layer opacity', { exact: true }).fill('70');
  await settled(page);
  await selectLayer(page, 'Layer 7');
  const before = await digest(page);

  // Delete Layer 7.
  await clearMarks(page);
  await page.getByRole('button', { name: 'Delete layer', exact: true }).click();
  await settled(page);
  expect(await order(page)).not.toContain('Layer 7');
  let outcome = await reuse(page);
  expect(outcome.final).toBe(false);
  expect(outcome.reusedLayers, 'resumes from a snapshot below Layer 7').toBeGreaterThan(0);
  expect(outcome.reusedLayers).toBeLessThanOrEqual(7);
  expect(outcome.clippedHits, 'the clipping group above is reused').toBeGreaterThanOrEqual(1);
  expect(outcome.layerHits, 'filtered layers above are reused').toBeGreaterThanOrEqual(1);
  const deleted = await digest(page);
  expect(deleted).not.toBe(before);

  // Undo resumes directly below Layer 7.
  await clearMarks(page);
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  outcome = await reuse(page);
  expect(outcome.reusedLayers).toBe(7);
  expect(await digest(page)).toBe(before);

  // Hide and show.
  const visible = page.getByRole('checkbox', { name: 'Visible', exact: true });
  await clearMarks(page);
  await visible.click();
  await settled(page);
  outcome = await reuse(page);
  expect(outcome.reusedLayers).toBe(7);
  expect(outcome.clippedHits).toBeGreaterThanOrEqual(1);
  const hidden = await digest(page);
  expect(hidden).not.toBe(before);
  await clearMarks(page);
  await visible.click();
  await settled(page);
  expect((await reuse(page)).reusedLayers).toBe(7);
  expect(await digest(page)).toBe(before);

  // Send Backward jumps the whole clipping group (Layers 4-6), so the
  // change starts at index 4. Desktops keep a snapshot below it; a phone
  // keeps two snapshots (both above it here) but still reuses the cached
  // filtered, clipped and masked layers.
  await clearMarks(page);
  await menu(page, 'Layer', /^Send Backward/);
  await settled(page);
  const moved = await order(page);
  expect(moved.indexOf('Layer 7')).toBeGreaterThan(moved.indexOf('Layer 4'));
  outcome = await reuse(page);
  if (test.info().project.name !== 'mobile') expect(outcome.reusedLayers).toBeGreaterThan(0);
  expect(outcome.reusedLayers).toBeLessThanOrEqual(4);
  expect(outcome.clippedHits).toBeGreaterThanOrEqual(1);
  expect(outcome.layerHits).toBeGreaterThanOrEqual(1);
  const reordered = await digest(page);
  expect(reordered).not.toBe(before);
  await clearMarks(page);
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect((await reuse(page)).reusedLayers).toBeGreaterThan(0);
  expect(await digest(page)).toBe(before);
  await menu(page, 'Edit', /^Redo/);
  await settled(page);
  expect(await digest(page)).toBe(reordered);

  // A cold render (reload: no snapshots, no cached layers) gives the same pixels.
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', {
    timeout: 60_000,
  });
  await page.reload();
  await ready(page);
  await settled(page);
  expect(await digest(page)).toBe(reordered);
  // Undo after the reload restores the earlier pixels too.
  await menu(page, 'Edit', /^Undo/);
  await settled(page);
  expect(await digest(page)).toBe(before);
});
