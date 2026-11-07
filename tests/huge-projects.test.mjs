import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAssetByteBudgetForEdit,
  commonLayer,
  layerRenderSkippable,
  neutral,
  validateFrame,
} from '../src/document.ts';
import {
  LAYER_PIXEL_CEILING,
  MAX_DOCUMENT_GROUPS,
  MAX_DOCUMENT_LAYERS,
  MAX_PROJECT_ASSETS,
  PROJECT_ASSET_BYTES_CEILING,
  assetByteBudgetMessage,
  assetBytes,
  projectLimitsForDevice,
} from '../src/projectLimits.ts';
import {
  EXPANDING_PAINT_TOOLS,
  AUTO_TRIM_MARGIN,
  autoTrimCandidates,
  planLayerTrim,
  coversCanvas,
  historySourceOffset,
} from '../src/layerTrim.ts';
import { CURRENT_DRAFT_VERSION, validateDraft } from '../src/drafts.ts';
import {
  PORTABLE_MAX_BYTES,
  crc32,
  readPortableBundle,
  writePortableBundle,
} from '../src/portableBundle.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
const url = `data:image/png;base64,${png}`;
const MiB = 1024 * 1024;
const id = (prefix, n) => `${prefix}-1111-4111-8111-${String(n).padStart(12, '0')}`;
const assetId = (n) => id('11111111', n);
const layerId = (n) => id('22222222', n);
const raster = (n, asset, patch = {}) => ({ ...commonLayer('Paint'), id: layerId(n), kind: 'raster', asset, ...patch });
const POSTER = { w: 2646, h: 4096 };

test('device tiers: 10x the former 64 MP / 64 MB on desktops, conservative on phones and low memory', () => {
  const desktop = projectLimitsForDevice({ deviceMemory: 8 });
  assert.deepEqual(desktop, { tier: 'desktop', layerPixelBudget: 1_024_000_000, assetByteBudget: 1024 * MiB });
  assert.ok(desktop.layerPixelBudget >= 10 * 64_000_000);
  assert.ok(desktop.assetByteBudget >= 10 * 64 * MiB);
  // Firefox/Safari do not expose deviceMemory: a desktop browser keeps the desktop tier.
  assert.equal(projectLimitsForDevice({}).tier, 'desktop');
  assert.equal(projectLimitsForDevice({ deviceMemory: Number.NaN }).tier, 'desktop');
  assert.deepEqual(projectLimitsForDevice({ deviceMemory: 4 }), { tier: 'standard', layerPixelBudget: 384_000_000, assetByteBudget: 384 * MiB });
  assert.deepEqual(projectLimitsForDevice({ mobile: true, deviceMemory: 8 }), { tier: 'mobile', layerPixelBudget: 256_000_000, assetByteBudget: 256 * MiB });
  assert.deepEqual(projectLimitsForDevice({ deviceMemory: 2 }), { tier: 'low-memory', layerPixelBudget: 128_000_000, assetByteBudget: 128 * MiB });
  assert.equal(projectLimitsForDevice({ mobile: true, deviceMemory: 1 }).tier, 'low-memory');
  // Every tier stays within the device-independent format ceilings.
  for (const hints of [{}, { deviceMemory: 4 }, { mobile: true }, { deviceMemory: 0.5 }]) {
    const limits = projectLimitsForDevice(hints);
    assert.ok(limits.layerPixelBudget <= LAYER_PIXEL_CEILING);
    assert.ok(limits.assetByteBudget <= PROJECT_ASSET_BYTES_CEILING);
    assert.ok(limits.layerPixelBudget >= 2 * 64_000_000, 'every tier at least doubles the former budget');
  }
  assert.ok(MAX_DOCUMENT_LAYERS >= 320 && MAX_DOCUMENT_GROUPS >= 32 && MAX_PROJECT_ASSETS >= 768);
});

test('a poster frame holds 512 layers (sparse and full) and refuses the 513th', () => {
  const assets = { [assetId(1)]: { url, w: 1, h: 1 }, [assetId(2)]: { url, ...POSTER } };
  const layers = Array.from({ length: MAX_DOCUMENT_LAYERS }, (_, n) =>
    raster(n, n % 10 === 0 ? assetId(2) : assetId(1), { matrix: [1, 0, 0, 1, n % 2000, n] }),
  );
  const frame = { ...POSTER, layers, active: layers[0].id };
  // 52 full poster layers (~564 MP) + 460 sparse layers.
  assert.doesNotThrow(() => validateFrame(frame, assets));
  const extra = raster(MAX_DOCUMENT_LAYERS, assetId(1));
  assert.throws(() => validateFrame({ ...frame, layers: [...layers, extra] }, assets), /Invalid layer document/);
  const groups = Array.from({ length: MAX_DOCUMENT_GROUPS + 1 }, (_, n) => ({
    id: id('33333333', n), name: `Folder ${n}`, visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false,
  }));
  assert.doesNotThrow(() => validateFrame({ ...frame, groups: groups.slice(0, MAX_DOCUMENT_GROUPS) }, assets));
  assert.throws(() => validateFrame({ ...frame, groups }, assets), /Invalid layer document/);
});

test('auto-trim considers only stored-bounds paint layers whose pixels the newest step replaced', () => {
  const sizes = { full: { w: 2646, h: 4096 }, full2: { w: 2646, h: 4096 }, tiny: { w: 1, h: 1 }, c: { w: 300, h: 200 }, d: { w: 320, h: 220 } };
  // A new empty paint layer (1 x 1) painted after its expansion step.
  const empty = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'tiny')] };
  const expanded = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'full2')] };
  const stroke = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'full')] };
  assert.deepEqual(autoTrimCandidates(expanded, empty, sizes, new Set()), [layerId(1)], 'a stroke-less expansion is trimmed back');
  assert.deepEqual(autoTrimCandidates(stroke, expanded, sizes, new Set(), layerId(1)), [layerId(1)], 'the stroke after an expansion');
  // Without the expansion marker a full-canvas layer keeps its storage (e.g. an opened photo).
  assert.deepEqual(autoTrimCandidates(stroke, expanded, sizes, new Set()), []);
  // A trimmed (stored-bounds) layer edited in place is trimmed again.
  const trimmed = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'c', { matrix: [1, 0, 0, 1, 50, 60] })] };
  const repainted = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'd', { matrix: [1, 0, 0, 1, 40, 60] })] };
  assert.deepEqual(autoTrimCandidates(repainted, trimmed, sizes, new Set()), [layerId(1)]);
  // Unchanged layers, already-known tight assets and 1 x 1 results are skipped.
  assert.deepEqual(autoTrimCandidates(repainted, trimmed, sizes, new Set(['d'])), []);
  assert.deepEqual(autoTrimCandidates(trimmed, trimmed, sizes, new Set()), []);
  assert.deepEqual(autoTrimCandidates(empty, expanded, sizes, new Set()), []);
  // New layers and opening a project (no previous step) are never rewritten.
  assert.deepEqual(autoTrimCandidates({ ...POSTER, layers: [raster(9, 'c')] }, { ...POSTER, layers: [] }, sizes, new Set()), []);
  assert.deepEqual(autoTrimCandidates(repainted, undefined, sizes, new Set()), []);
  // Layers whose metadata is tied to asset coordinates or bounds are never trimmed.
  for (const patch of [
    { styles: { dropShadow: { enabled: true, color: '#000000', opacity: 0.5, angle: 120, distance: 5, size: 5 } } },
    { spotHealing: [{ points: [] }] },
    { patchStrokes: [{ points: [] }] },
    { fillColor: '#ff0000' },
    { matrix: [2, 0, 0, 2, 0, 0] },
    { matrix: [1, 0, 0, 1, 0.5, 0] },
    { smartFilters: [{ type: 'emboss' }] },
  ]) {
    const layer = raster(1, 'full', patch);
    assert.deepEqual(autoTrimCandidates({ ...stroke, layers: [layer] }, expanded, sizes, new Set(), layerId(1)), [], JSON.stringify(patch));
  }
  assert.equal(coversCanvas({ w: 2646, h: 4096 }, [1, 0, 0, 1, 0, 0], 2646, 4096), true);
  assert.equal(coversCanvas({ w: 2646, h: 4096 }, [1, 0, 0, 1, 1, 0], 2646, 4096), false);
  assert.equal(coversCanvas({ w: 10, h: 10 }, [2, 0, 0, 2, 0, 0], 2646, 4096), true, 'transformed layers are left alone');
});

test('every pixel-writing tool family grows a stored-bounds layer first', () => {
  for (const tool of [
    'brush', 'pencil', 'eraser', 'background-eraser', 'magic-eraser', 'fill', 'gradient', 'color-replace',
    'clone', 'heal', 'pattern-stamp', 'smudge', 'dodge', 'burn', 'sponge', 'blur', 'sharpen', 'mixer-brush',
    'spot-heal', 'patch', 'red-eye', 'history-brush', 'art-history-brush',
  ])
    assert.ok(EXPANDING_PAINT_TOOLS.includes(tool), tool);
});

test('history sources stored at different bounds align in document space', () => {
  assert.deepEqual(historySourceOffset([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 120, 340]), { x: 120, y: 340 });
  assert.deepEqual(historySourceOffset([1, 0, 0, 1, -10, 5], [1, 0, 0, 1, 0, 0]), { x: 10, y: -5 });
  assert.equal(historySourceOffset([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 0, 0]), null);
  assert.equal(historySourceOffset([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0.5, 0]), null);
});

test('the renderer skips transparent and off-canvas plain layers but never ones that can paint elsewhere', () => {
  const assets = { [assetId(1)]: { url, w: 100, h: 100 } };
  const frame = { w: 500, h: 400, layers: [] };
  const at = (x, y, patch = {}) => raster(1, assetId(1), { matrix: [1, 0, 0, 1, x, y], ...patch });
  assert.equal(layerRenderSkippable(at(10, 10), frame, assets), false);
  assert.equal(layerRenderSkippable(at(10, 10, { opacity: 0 }), frame, assets), true);
  assert.equal(layerRenderSkippable({ ...commonLayer('Text'), kind: 'text', opacity: 0 }, frame, assets), true);
  assert.equal(layerRenderSkippable(at(500, 0), frame, assets), true);
  assert.equal(layerRenderSkippable(at(-100, 0), frame, assets), true);
  assert.equal(layerRenderSkippable(at(0, -100), frame, assets), true);
  assert.equal(layerRenderSkippable(at(-99, -99), frame, assets), false);
  assert.equal(layerRenderSkippable(at(499, 399), frame, assets), false);
  const styled = at(600, 0, { styles: { dropShadow: { enabled: true, color: '#000000', opacity: 0.5, angle: 120, distance: 5, size: 5 } } });
  assert.equal(layerRenderSkippable(styled, frame, assets), false);
  assert.equal(layerRenderSkippable(at(600, 0, { matrix: [2, 0, 0, 2, 600, 0] }), frame, assets), false);
  const base = at(600, 0);
  assert.equal(layerRenderSkippable(base, { ...frame, layers: [base, { ...at(0, 0), id: layerId(7), clippingTo: base.id }] }, assets), false);
  assert.equal(layerRenderSkippable({ ...commonLayer('Adjust'), kind: 'adjustment' }, frame, assets), false);
});

test('the asset byte budget refuses growth past the tier and allows edits that do not grow', () => {
  const big = (n, size) => ({ url: 'x'.repeat(size), w: 1, h: 1, n });
  const assets = { [assetId(1)]: big(1, 600), [assetId(2)]: big(2, 600), [assetId(3)]: big(3, 10) };
  const previous = { w: 1, h: 1, layers: [raster(1, assetId(1))], active: layerId(1) };
  const grown = { ...previous, layers: [raster(1, assetId(1)), raster(2, assetId(2))] };
  const retained = { [assetId(1)]: assets[assetId(1)], [assetId(2)]: assets[assetId(2)] };
  assert.equal(assetBytes(retained), 1200);
  assert.throws(() => assertAssetByteBudgetForEdit(retained, grown, previous, assets, 1000), (error) => error.message === assetByteBudgetMessage(1000));
  assert.doesNotThrow(() => assertAssetByteBudgetForEdit(retained, grown, previous, assets, 2000));
  // Shrinking (e.g. trimming) a document that is over this device's budget is allowed.
  const shrunk = { ...grown, layers: [raster(1, assetId(1)), raster(2, assetId(3))] };
  assert.doesNotThrow(() => assertAssetByteBudgetForEdit(retained, shrunk, grown, assets, 1000));
  assert.match(assetByteBudgetMessage(256 * MiB), /exceed 256 MB on this device/);
});

const settings = { tool: 'move', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral };

/** A 1 x 1 PNG followed by `extra` deterministic bytes, as a data URL (header-valid, unique). */
function paddedPng(seed, extra) {
  const head = Buffer.from(png, 'base64');
  const tail = Buffer.alloc(extra);
  let state = seed * 2654435761 >>> 0;
  for (let index = 0; index < extra; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    tail[index] = state >>> 24;
  }
  return `data:image/png;base64,${Buffer.concat([head, tail]).toString('base64')}`;
}

function bigDraft(count, bytesEach) {
  const assets = {};
  const layers = [];
  for (let n = 0; n < count; n += 1) {
    assets[assetId(n)] = { url: paddedPng(n + 1, bytesEach), w: 1, h: 1 };
    layers.push({ ...raster(n, assetId(n)), adjustments: { ...neutral } });
  }
  return {
    version: CURRENT_DRAFT_VERSION,
    name: 'Huge project',
    index: 0,
    settings,
    assets,
    history: [{ w: 1, h: 1, active: layers[0].id, layers }],
  };
}

test('drafts and portable bundles above the former 64 MB cap round-trip with integrity checks', async () => {
  const draft = bigDraft(9, 8 * MiB);
  const total = assetBytes(draft.assets);
  assert.ok(total > 64 * MiB, `fixture carries ${total} bytes of asset data`);
  assert.doesNotThrow(() => validateDraft(draft));
  const blob = await writePortableBundle(draft);
  assert.ok(blob.size > 64 * MiB && blob.size <= PORTABLE_MAX_BYTES, `archive is ${blob.size} bytes`);
  const restored = await readPortableBundle(blob);
  assert.equal(Object.keys(restored.assets).length, 9);
  for (const [key, asset] of Object.entries(draft.assets)) assert.equal(restored.assets[key].url, asset.url);
  assert.equal(restored.history[0].layers.length, 9);
  // Corruption deep inside a large asset is still detected.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  bytes[Math.floor(bytes.length / 2)] ^= 0xff;
  await assert.rejects(() => readPortableBundle(bytes), /checksum|integrity/i);
});

test('draft validation refuses more assets than the project ceiling', () => {
  const draft = bigDraft(1, 16);
  const url = draft.assets[assetId(0)].url;
  const tooMany = { ...draft, assets: {} };
  for (let n = 0; n <= MAX_PROJECT_ASSETS; n += 1) tooMany.assets[id('44444444', n)] = { url, w: 1, h: 1 };
  assert.throws(() => validateDraft(tooMany), /Invalid project assets/);
});

test('table CRC-32 matches the IEEE reference values', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
  assert.equal(crc32(new Uint8Array([0])), 0xd202ef8d);
});

test('composite prefix keys change only for the layers an edit touches', async () => {
  const { compositeLayerKeys, compositeCheckpoint, sharedPrefix, CompositeCache } = await import('../src/compositeCache.ts');
  const assets = { a: { url, w: 1, h: 1 }, b: { url: url.replace('AAAA', 'AAAB'), w: 1, h: 1 }, m: { url, w: 1, h: 1 } };
  const layers = Array.from({ length: 10 }, (_, n) => raster(n, n % 2 ? 'a' : 'b'));
  const frame = { w: 50, h: 40, layers, active: layers[6].id };
  const keys = compositeLayerKeys(frame, assets);
  assert.equal(keys.length, 10);
  assert.deepEqual(compositeLayerKeys(frame, assets), keys, 'stable across renders');
  // Editing layer 6 leaves layers 0..5 reusable.
  const edited = { ...frame, layers: layers.map((layer, n) => (n === 6 ? { ...layer, opacity: 0.5 } : layer)) };
  assert.equal(sharedPrefix(keys, compositeLayerKeys(edited, assets)), 6);
  // Same asset id, different pixels: the key changes (content fingerprints, not ids).
  const swapped = { ...assets, a: assets.b };
  assert.equal(sharedPrefix(keys, compositeLayerKeys(frame, swapped)), 1);
  // A live override (stroke preview) never matches, and a mask asset is part of the key.
  assert.notEqual(compositeLayerKeys(frame, assets, { [layers[3].id]: {} })[3], keys[3]);
  const masked = { ...frame, layers: layers.map((layer, n) => (n === 2 ? { ...layer, mask: 'm' } : layer)) };
  assert.equal(sharedPrefix(keys, compositeLayerKeys(masked, assets)), 2);
  // A folder is drawn at its first member, so every member's key covers the whole folder.
  const group = { id: 'g', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false };
  const grouped = { ...frame, groups: [group], layers: layers.map((layer, n) => (n === 1 || n === 8 ? { ...layer, groupId: 'g' } : layer)) };
  const groupedKeys = compositeLayerKeys(grouped, assets);
  const memberEdited = { ...grouped, layers: grouped.layers.map((layer, n) => (n === 8 ? { ...layer, opacity: 0.2 } : layer)) };
  assert.equal(sharedPrefix(groupedKeys, compositeLayerKeys(memberEdited, assets)), 1);
  // Checkpoint: just below the first override, else just below the active layer.
  assert.equal(compositeCheckpoint(frame), 5);
  assert.equal(compositeCheckpoint(frame, { [layers[2].id]: {} }), 1);
  assert.equal(compositeCheckpoint({ ...frame, active: layers[0].id }), -1);
  // The cache only answers when every layer in its snapshot is unchanged.
  const cache = new CompositeCache();
  cache.store({ w: 50, h: 40, keys: keys.slice(0, 6), index: 5, surface: 'S', groups: [] });
  assert.equal(cache.match(50, 40, compositeLayerKeys(edited, assets))?.surface, 'S');
  assert.equal(cache.match(50, 40, compositeLayerKeys(masked, assets)), undefined);
  assert.equal(cache.match(60, 40, keys), undefined);
  assert.equal(cache.reusable(50, 40), 'S');
  cache.clear();
  assert.equal(cache.match(50, 40, keys), undefined);
});

test('automatic storage keeps a clamped transparent margin; Trim Layer to Content stays tight', () => {
  const data = new Uint8ClampedArray(400 * 300 * 4);
  for (let y = 140; y < 160; y += 1) for (let x = 100; x < 130; x += 1) data[(y * 400 + x) * 4 + 3] = 255;
  const identity = [1, 0, 0, 1, 0, 0];
  assert.deepEqual(planLayerTrim(data, 400, 300, identity).crop, { x: 100, y: 140, width: 30, height: 20 });
  const padded = planLayerTrim(data, 400, 300, identity, AUTO_TRIM_MARGIN);
  assert.equal(AUTO_TRIM_MARGIN, 64);
  assert.deepEqual(padded.crop, { x: 36, y: 76, width: 158, height: 148 });
  assert.deepEqual(padded.matrix, [1, 0, 0, 1, 36, 76]);
  // Clamped to the asset near its edges; an asset already within the margin is left alone.
  const corner = new Uint8ClampedArray(200 * 100 * 4);
  corner[3] = 255;
  assert.deepEqual(planLayerTrim(corner, 200, 100, identity, AUTO_TRIM_MARGIN).crop, { x: 0, y: 0, width: 65, height: 65 });
  assert.equal(planLayerTrim(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100, identity, AUTO_TRIM_MARGIN), null);
  // Empty layers still collapse to one transparent pixel.
  assert.deepEqual(planLayerTrim(new Uint8ClampedArray(50 * 40 * 4), 50, 40, identity, AUTO_TRIM_MARGIN).crop, { x: 0, y: 0, width: 1, height: 1 });
});

test('baking a filtered or styled layer (Rasterize) stores the result at its content bounds', () => {
  const sizes = { full: { w: 2646, h: 4096 }, baked: { w: 2646, h: 4096 } };
  const filtered = raster(1, 'full', { adjustments: { ...neutral, filterEffects: { type: 'gaussian-blur', amount: 100, radius: 8 } } });
  const before = { ...POSTER, layers: [raster(0, 'full'), filtered] };
  const rasterized = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'baked')] };
  assert.deepEqual(autoTrimCandidates(rasterized, before, sizes, new Set()), [layerId(1)]);
  // A plain full-canvas layer edited in place keeps its storage.
  const plain = { ...POSTER, layers: [raster(0, 'full'), raster(1, 'full')] };
  assert.deepEqual(autoTrimCandidates(rasterized, plain, sizes, new Set()), []);
});
