// Local measurement of structural layer edits on a large stack (not part of CI).
//
//   node scripts/measure-structural-edits.mjs <baseUrl> [width] [height] [layers]
//
// Builds a synthetic portable project (default 2646 x 4096, 40 layers) with
// Clouds and Motion Blur filters, pixel masks, Inner Shadow / Outer Glow
// styles, clipping groups, folders and software blend modes (Overlay, Soft
// Light), opens it in Chromium and times, for one mid-stack layer: an opacity
// change, hide, show, Send Backward, undo, and Delete. For each edit it
// reports the wall time until the canvas settles, the `pixelforge.render`
// measures and the `pixelforge.layer-filter-cache` and
// `pixelforge.composite-cache` marks. Numbers are local evidence for one
// machine only.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { writePortableBundle } from '../src/portableBundle.ts';
import { CURRENT_DRAFT_VERSION } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';
import { neutralLayerStyles } from '../src/layerStyles.ts';

const [baseUrl, widthArg, heightArg, layersArg] = process.argv.slice(2);
if (!baseUrl) {
  console.error('usage: node scripts/measure-structural-edits.mjs <baseUrl> [width] [height] [layers]');
  process.exit(2);
}
const W = Number(widthArg || 2646), H = Number(heightArg || 4096), N = Number(layersArg || 40);

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
/** RGBA PNG data URL; `pixel(x, y)` returns [r, g, b, a]. */
function png(w, h, pixel) {
  const stride = w * 4 + 1, raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y), offset = y * stride + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { url: `data:image/png;base64,${bytes.toString('base64')}`, w, h };
}
const uuid = (prefix, n) => `${prefix}-1111-4111-8111-${String(n).padStart(12, '0')}`;
const colors = [[220, 60, 60], [60, 160, 220], [240, 200, 40], [90, 200, 110], [170, 90, 220], [250, 130, 40]];

/** Synthetic poster, bottom to top. Returns the project and the probed layer's name. */
function buildProject() {
  const assets = {}, layers = [], groups = [];
  const layer = (n, patch) => ({
    id: uuid('22222222', n), name: `Layer ${n}`, visible: true, locked: false, opacity: 1, blend: 'source-over',
    matrix: [1, 0, 0, 1, 0, 0], adjustments: structuredClone(neutral), kind: 'raster', ...patch,
  });
  const full = uuid('11111111', 0);
  assets[full] = png(W, H, () => [0, 0, 0, 0]);
  layers.push(layer(0, { name: 'Background', asset: full, fillColor: '#f4efe6' }));
  const blobW = Math.round(W * 0.45), blobH = Math.round(H * 0.3);
  const mask = uuid('33333333', 0);
  assets[mask] = png(W, H, (x, y) => [0, 0, 0, x > W * 0.15 && x < W * 0.85 && y > H * 0.1 && y < H * 0.9 ? 255 : 0]);
  let folder = 0;
  for (let n = 1; n < N; n++) {
    const kind = n % 7, [r, g, b] = colors[n % colors.length];
    const id = uuid('11111111', n);
    const x = Math.round(((n * 397) % 100) / 100 * (W - blobW)), y = Math.round(((n * 211) % 100) / 100 * (H - blobH));
    if (kind === 1) {
      // A full-canvas Clouds layer in a software blend mode.
      assets[id] = png(W, H, () => [r, g, b, 255]);
      layers.push(layer(n, {
        asset: id, opacity: 0.35, blend: n % 2 ? 'overlay' : 'soft-light',
        adjustments: { ...structuredClone(neutral), filterEffects: { type: 'clouds', amount: 100, radius: 48, angle: 0, centerX: 0.5, centerY: 0.5, seed: n } },
      }));
      continue;
    }
    assets[id] = png(blobW, blobH, (px, py) => {
      const dx = (px - blobW / 2) / (blobW / 2), dy = (py - blobH / 2) / (blobH / 2);
      return dx * dx + dy * dy <= 1 ? [r, g, b, 255] : [0, 0, 0, 0];
    });
    const base = { asset: id, matrix: [1, 0, 0, 1, x, y] };
    if (kind === 2)
      layers.push(layer(n, { ...base, adjustments: { ...structuredClone(neutral), filterEffects: { type: 'motion-blur', amount: 100, radius: 24, angle: 30, centerX: 0.5, centerY: 0.5, seed: 0 } } }));
    else if (kind === 3)
      layers.push(layer(n, {
        ...base, mask, maskEnabled: true, maskInverted: false,
        styles: { ...structuredClone(neutralLayerStyles), outerGlow: { ...neutralLayerStyles.outerGlow, enabled: true, size: 24 } },
      }));
    else if (kind === 4)
      layers.push(layer(n, {
        ...base, clippingTo: uuid('22222222', n - 1),
        styles: { ...structuredClone(neutralLayerStyles), innerShadow: { ...neutralLayerStyles.innerShadow, enabled: true } },
      }));
    else if (kind === 5 || kind === 6) {
      if (kind === 5) groups.push({ id: uuid('44444444', ++folder), name: `Folder ${folder}`, visible: true, locked: false, opacity: 0.9, blend: 'source-over', collapsed: false });
      layers.push(layer(n, { ...base, groupId: uuid('44444444', folder), blend: kind === 6 ? 'soft-light' : 'source-over' }));
    } else layers.push(layer(n, { ...base, blend: 'multiply' }));
  }
  // Probe a Motion Blur layer in the middle of the stack (kind 2).
  let probe = Math.floor(N / 2);
  while (probe % 7 !== 2) probe++;
  return {
    probeName: `Layer ${probe}`,
    draft: {
      version: CURRENT_DRAFT_VERSION,
      name: 'Structural edits probe',
      index: 0,
      settings: { tool: 'move', zoom: 25, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
      assets,
      history: [{ w: W, h: H, active: layers.at(-1).id, layers, groups }],
    },
  };
}

const { draft, probeName } = buildProject();
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pixelforge-structural-')), 'probe.pixelforge');
fs.writeFileSync(file, Buffer.from(await (await writePortableBundle(draft)).arrayBuffer()));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('crash', () => console.error('PAGE CRASHED'));
await page.route('https://marketplace.cheaply.fr/marketplace/api/photoeditor**', (route) =>
  route.fulfill({ json: { authenticated: false } }),
);
await page.goto(`${baseUrl}/editor?new=1`);
await page.locator('[role="application"][aria-busy="false"]').waitFor();
const settled = () =>
  page.waitForFunction(
    () => document.querySelector('[data-testid="editor-canvas"]')?.getAttribute('data-rendering') === 'false',
    undefined,
    { timeout: 900_000, polling: 20 },
  );
const footer = page.locator('footer');
const started = performance.now();
await page.getByTestId('project-input').setInputFiles(file);
await footer.filter({ hasText: /Project opened|could not|Invalid/i }).waitFor({ timeout: 900_000 });
await settled();
const results = { size: `${W}x${H}`, layers: N, probe: probeName, importMs: Math.round(performance.now() - started), edits: [] };

const clear = () =>
  page.evaluate(() => {
    for (const name of ['pixelforge.layer-filter-cache', 'pixelforge.composite-cache']) performance.clearMarks(name);
    performance.clearMeasures('pixelforge.render');
  });
const collect = () =>
  page.evaluate(() => ({
    renders: performance.getEntriesByName('pixelforge.render', 'measure').map((entry) => Math.round(entry.duration)),
    layerCache: performance.getEntriesByName('pixelforge.layer-filter-cache', 'mark').map((mark) => {
      const { hits, misses, stores, evictions, rejected, entries, bytes } = mark.detail;
      return { hits, misses, stores, evictions, rejected, entries, mb: Math.round(bytes / 1048576) };
    }),
    composite: performance.getEntriesByName('pixelforge.composite-cache', 'mark').map((mark) => mark.detail),
  }));
const menu = async (name, item) => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
};
async function edit(label, run) {
  await clear();
  const start = performance.now();
  await run();
  await settled();
  const entry = { label, ms: Math.round(performance.now() - start), ...(await collect()) };
  results.edits.push(entry);
  console.error(JSON.stringify(entry));
}

const select = async (name) => {
  await page.getByRole('button', { name: `Select layer ${name}`, exact: true }).click();
  await settled();
};
const opacity = (value) => page.getByLabel('Layer opacity', { exact: true }).fill(String(value));
const visible = () => page.getByRole('checkbox', { name: 'Visible', exact: true }).click();
const remove = () => page.getByRole('button', { name: 'Delete layer', exact: true }).click();
const top = `Layer ${N - 1}`;

await select(probeName);
// Warm-up: an opacity change fills the caches the next edits read.
await edit('opacity 80% (warm-up)', () => opacity(80));
await edit('opacity 60%', () => opacity(60));
await edit('hide', visible);
await edit('show', visible);
await edit('send backward', () => menu('Layer', /^Send Backward/));
await edit('undo', () => menu('Edit', /^Undo/));
await edit('delete', remove);
await edit('undo delete', () => menu('Edit', /^Undo/));
// The reported flow: work on another layer, then select a mid-stack layer
// (selection alone never recomposites) and delete or hide it.
await select(top);
await edit('opacity 90% on the top layer', () => opacity(90));
await select(probeName);
await edit('delete after selecting', remove);
await edit('undo delete after selecting', () => menu('Edit', /^Undo/));
await select(top);
await edit('opacity 80% on the top layer', () => opacity(80));
await select(probeName);
await edit('hide after selecting', visible);
await edit('show after selecting', visible);
console.log(JSON.stringify(results, null, 2));
await browser.close();
fs.rmSync(path.dirname(file), { recursive: true, force: true });
