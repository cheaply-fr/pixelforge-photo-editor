import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TILE_BYTES,
  TILE_SIZE,
  assetStorageUnits,
  clearTileIndexForTesting,
  dataUrlBytes,
  hashTilePixels,
  internTile,
  isTiledAsset,
  knownTile,
  tileAssetFromBands,
  tileBudgetBytes,
  tileGrid,
  tileRect,
  tiledAssetFingerprint,
  uniqueAssetBytes,
  validTiledAsset,
} from '../src/tiledAssets.ts';
import { validAsset } from '../src/document.ts';
import { assetFingerprint, assetFingerprints } from '../src/layerFilterCache.ts';
import { assetsToSend, resolveRequestAssets, retainedAssetStore } from '../src/workerAssets.ts';
import {
  historyAssetBytes,
  persistableHistoryDraft,
  selectPersistedHistory,
  trimHistoryToBudget,
} from '../src/historyBudget.ts';
import { assetBytes as projectAssetBytes } from '../src/projectLimits.ts';
import { readPortableBundle, writePortableBundle } from '../src/portableBundle.ts';
import { CURRENT_DRAFT_VERSION } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

/** RGBA image as a Uint8ClampedArray with a deterministic, non-repeating pattern. */
function image(w, h, seed = 1) {
  const data = new Uint8ClampedArray(w * h * 4);
  let state = seed >>> 0;
  for (let i = 0; i < data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data[i] = state & 255;
    data[i + 1] = (state >>> 8) & 255;
    data[i + 2] = (state >>> 16) & 255;
    data[i + 3] = 255;
  }
  return data;
}
const bandReader = (data, w) => (y, rows) => data.subarray(y * w * 4, (y + rows) * w * 4);
/** Fake encoder: records each encoded rectangle and returns a small Blob. */
function recorder() {
  const calls = [];
  return {
    calls,
    encode: (x, y, w, h) => {
      calls.push([x, y, w, h]);
      return new Blob([new Uint8Array(64 + calls.length)], { type: 'image/png' });
    },
  };
}
const words = (data) => new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);

test('tile grid covers the asset with smaller edge tiles', () => {
  assert.deepEqual(tileGrid(256, 256), { cols: 1, rows: 1 });
  assert.deepEqual(tileGrid(600, 300), { cols: 3, rows: 2 });
  assert.deepEqual(tileGrid(2646, 4096), { cols: 11, rows: 16 });
  assert.deepEqual(tileRect(600, 300, 0), { x: 0, y: 0, w: 256, h: 256 });
  assert.deepEqual(tileRect(600, 300, 2), { x: 512, y: 0, w: 88, h: 256 });
  assert.deepEqual(tileRect(600, 300, 5), { x: 512, y: 256, w: 88, h: 44 });
});

test('tile keys are content addresses: equal pixels match, any change or shape differs, empty is null', () => {
  const a = image(256, 256, 3),
    b = image(256, 256, 3),
    c = image(256, 256, 3);
  c[4 * 1000 + 1] ^= 1; // one channel of one pixel
  const key = hashTilePixels(words(a), 256, 0, 0, 256, 256);
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(hashTilePixels(words(b), 256, 0, 0, 256, 256), key);
  assert.notEqual(hashTilePixels(words(c), 256, 0, 0, 256, 256), key);
  // Same words in another shape are a different tile.
  const flat = image(64, 32, 9);
  assert.notEqual(hashTilePixels(words(flat), 64, 0, 0, 64, 32), hashTilePixels(words(flat), 32, 0, 0, 32, 64));
  // A sub-rectangle hashes like an identical standalone tile.
  const wide = new Uint8ClampedArray(512 * 256 * 4);
  for (let row = 0; row < 256; row += 1) wide.set(a.subarray(row * 1024, row * 1024 + 1024), (row * 512 + 256) * 4);
  assert.equal(hashTilePixels(words(wide), 512, 256, 0, 256, 256), key);
  assert.equal(hashTilePixels(words(wide), 512, 0, 0, 256, 256), null, 'fully transparent tile');
});

test('a commit encodes only changed tiles and shares the rest by object', () => {
  clearTileIndexForTesting();
  const w = 600,
    h = 300,
    first = image(w, h, 11);
  const one = recorder();
  const { asset: base, stats } = tileAssetFromBands(w, h, bandReader(first, w), one.encode);
  assert.equal(stats.encoded, 6);
  assert.equal(one.calls.length, 6);
  assert.deepEqual(one.calls.at(-1), [512, 256, 88, 44], 'edge tiles are encoded at their own size');
  assert.ok(validTiledAsset(base) && validAsset(base) && isTiledAsset(base));

  // A "stroke" inside tile (1, 0) only.
  const edited = first.slice();
  for (let y = 10; y < 40; y += 1) for (let x = 300; x < 340; x += 1) edited[(y * w + x) * 4] = 7;
  const two = recorder();
  const { asset: next, stats: nextStats } = tileAssetFromBands(w, h, bandReader(edited, w), two.encode, base);
  assert.deepEqual(two.calls, [[256, 0, 256, 256]]);
  assert.deepEqual(nextStats, { tiles: 6, encoded: 1, reused: 5, empty: 0, hashed: 6, skipped: 0, hinted: false });
  next.tiles.forEach((tile, index) => {
    if (index === 1) assert.notEqual(tile, base.tiles[1]);
    else assert.equal(tile, base.tiles[index], `tile ${index} is shared by object`);
  });
  // Undoing the stroke and committing again re-uses the original tile (tab-wide index).
  const three = recorder();
  const { asset: again } = tileAssetFromBands(w, h, bandReader(first, w), three.encode);
  assert.equal(three.calls.length, 0);
  assert.equal(tiledAssetFingerprint(again), tiledAssetFingerprint(base));
});

test('transparent tiles are stored as null and never encoded', () => {
  clearTileIndexForTesting();
  const w = 512,
    h = 512,
    data = new Uint8ClampedArray(w * h * 4);
  data.set(image(10, 10, 5), 0); // first 100 pixels of row 0
  const rec = recorder();
  const { asset, stats } = tileAssetFromBands(w, h, bandReader(data, w), rec.encode);
  assert.equal(stats.empty, 3);
  assert.equal(rec.calls.length, 1);
  assert.deepEqual(asset.tiles.map((tile) => tile !== null), [true, false, false, false]);
  assert.deepEqual(assetStorageUnits('x', asset).length, 1);
});

test('identical tiles anywhere in the tab are shared, and released tiles are re-encoded', () => {
  clearTileIndexForTesting();
  const tileData = image(256, 256, 21);
  const twice = new Uint8ClampedArray(512 * 256 * 4);
  for (let row = 0; row < 256; row += 1) {
    twice.set(tileData.subarray(row * 1024, row * 1024 + 1024), row * 512 * 4);
    twice.set(tileData.subarray(row * 1024, row * 1024 + 1024), (row * 512 + 256) * 4);
  }
  const rec = recorder();
  const { asset } = tileAssetFromBands(512, 256, bandReader(twice, 512), rec.encode);
  assert.equal(rec.calls.length, 1, 'a repeated tile is encoded once');
  assert.equal(asset.tiles[0], asset.tiles[1]);
  assert.equal(uniqueAssetBytes({ a: asset }), tileBudgetBytes(asset.tiles[0]));
  assert.equal(knownTile(asset.tiles[0].key), asset.tiles[0]);
  const duplicate = { key: asset.tiles[0].key, blob: new Blob([new Uint8Array(3)]) };
  assert.equal(internTile(duplicate), asset.tiles[0], 'interning keeps the first live tile');
  clearTileIndexForTesting();
  assert.equal(knownTile(asset.tiles[0].key), undefined);
});

test('tiled asset validation fails closed on malformed grids, keys, blobs and sizes', () => {
  clearTileIndexForTesting();
  const { asset } = tileAssetFromBands(300, 300, bandReader(image(300, 300, 2), 300), recorder().encode);
  assert.ok(validTiledAsset(asset));
  const tile = asset.tiles[0];
  const variants = [
    { ...asset, tileSize: 512 },
    { ...asset, tiles: asset.tiles.slice(1) },
    { ...asset, tiles: [...asset.tiles, null] },
    { ...asset, w: 0 },
    { ...asset, w: 16001 },
    { ...asset, w: 5000, h: 5000, tiles: Array.from({ length: 400 }, () => null) },
    { ...asset, tiles: [{ key: 'XYZ', blob: tile.blob }, ...asset.tiles.slice(1)] },
    { ...asset, tiles: [{ key: tile.key, blob: 'data:image/png;base64,AAAA' }, ...asset.tiles.slice(1)] },
    { ...asset, tiles: [{ key: tile.key, blob: new Blob([]) }, ...asset.tiles.slice(1)] },
    { ...asset, tiles: [{ key: tile.key, blob: new Blob([new Uint8Array(MAX_TILE_BYTES + 1)]) }, ...asset.tiles.slice(1)] },
  ];
  for (const [index, variant] of variants.entries()) {
    assert.equal(validTiledAsset(variant), false, `variant ${index}`);
    assert.equal(validAsset(variant), false, `validAsset variant ${index}`);
  }
  // A fully transparent grid is valid.
  assert.ok(validTiledAsset({ w: 300, h: 300, tileSize: TILE_SIZE, tiles: [null, null, null, null] }));
});

test('fingerprints identify tiled content, not objects, and feed worker transfer by content', () => {
  clearTileIndexForTesting();
  const data = image(512, 256, 4);
  const { asset } = tileAssetFromBands(512, 256, bandReader(data, 512), recorder().encode);
  const copy = { ...asset, tiles: [...asset.tiles] };
  assert.equal(assetFingerprint(copy), assetFingerprint(asset));
  assert.match(assetFingerprint(asset), /^512x256:t2:[0-9a-f]{16}$/);
  const changed = { ...asset, tiles: [asset.tiles[1], asset.tiles[0]] };
  assert.notEqual(assetFingerprint(changed), assetFingerprint(asset));
  const legacy = { url: 'data:image/png;base64,AAAA', w: 1, h: 1 };
  const keys = assetFingerprints({ tiled: asset, legacy });
  assert.deepEqual(Object.keys(keys).sort(), ['legacy', 'tiled']);
  const store = retainedAssetStore({ tiled: asset, legacy }, keys);
  const sent = assetsToSend({ tiled: copy, legacy }, assetFingerprints({ tiled: copy, legacy }), new Set(store.keys()));
  assert.deepEqual(sent, {}, 'equal tile content is not resent');
  const resolved = resolveRequestAssets({}, { tiled: keys.tiled }, store);
  assert.equal(resolved.assets.tiled, asset);
  // Blobs survive the structured clone a worker request uses.
  const cloned = structuredClone(asset);
  assert.ok(validTiledAsset(cloned));
  assert.equal(assetFingerprint(cloned), assetFingerprint(asset));
});

/* History budget and project limits count unique tiles. */
const layerId = '22222222-2222-4222-8222-222222222222';
const frame = (asset, w = 600, h = 300) => ({
  w,
  h,
  active: layerId,
  layers: [
    {
      id: layerId,
      name: 'Photo',
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      matrix: [1, 0, 0, 1, 0, 0],
      adjustments: { ...neutral },
      kind: 'raster',
      asset,
    },
  ],
});
const fixedEncoder = (size) => () => new Blob([new Uint8Array(size)], { type: 'image/png' });
/** `steps` versions of a 600×300 layer, each step changing one more pixel in tile 0. */
function strokeHistory(steps, tileBytes = 3000) {
  clearTileIndexForTesting();
  const data = image(600, 300, 31);
  const assets = {};
  const history = [];
  let previous;
  for (let step = 0; step < steps; step += 1) {
    if (step) data[(step * 600 + 3) * 4] ^= 0x55;
    const { asset } = tileAssetFromBands(600, 300, bandReader(data, 600), fixedEncoder(tileBytes), previous);
    const id = `${(step + 16).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
    assets[id] = asset;
    history.push(frame(id));
    previous = asset;
  }
  return { assets, history };
}

test('history bytes count each distinct tile once across steps', () => {
  const tileBytes = 3000,
    unit = Math.ceil(tileBytes / 3) * 4;
  const { assets, history } = strokeHistory(5, tileBytes);
  // 6 tiles for the first version, then one new tile per step.
  assert.equal(historyAssetBytes(history, assets), (6 + 4) * unit);
  assert.equal(historyAssetBytes([history[4]], assets), 6 * unit);
  assert.equal(projectAssetBytes(assets), (6 + 4) * unit);
  // The window budget keeps every step when shared tiles are counted once…
  const kept = trimHistoryToBudget(history, 4, assets, { maxSteps: 100, maxBytes: 10 * unit });
  assert.equal(kept.history.length, 5);
  assert.equal(kept.bytes, 10 * unit);
  // …and drops the oldest steps only by the tiles they alone hold.
  const trimmed = trimHistoryToBudget(history, 4, assets, { maxSteps: 100, maxBytes: 8 * unit });
  assert.equal(trimmed.history.length, 3);
  assert.equal(trimmed.droppedUndo, 2);
  assert.equal(trimmed.bytes, 8 * unit);
  // Persisted windows: drafts share tiles; flattened interchange pays per asset.
  assert.equal(selectPersistedHistory(history, 4, assets, { maxBytes: 10 * unit }).start, 0);
  const flat = selectPersistedHistory(history, 4, assets, { maxBytes: 13 * unit, flattened: true });
  assert.equal(flat.start, 3, 'each flattened version costs its full size');
  const draft = persistableHistoryDraft(
    { history, index: 4, assets, settings: {} },
    { maxBytes: 13 * unit, flattened: true },
  ).draft;
  assert.equal(draft.history.length, 2);
  assert.equal(Object.keys(draft.assets).length, 2);
});

test('legacy data-URL assets keep their per-id cost next to tiles', () => {
  const { assets, history } = strokeHistory(2, 300);
  const legacy = { url: `data:image/png;base64,${'A'.repeat(400)}`, w: 1, h: 1 };
  const mixed = { ...assets, legacyId: legacy };
  assert.deepEqual(assetStorageUnits('legacyId', legacy), [['asset:legacyId', legacy.url.length]]);
  assert.equal(projectAssetBytes(mixed), projectAssetBytes(assets) + legacy.url.length);
  assert.equal(historyAssetBytes(history, assets), 7 * 400);
});

test('portable v3 export flattens tiled assets and the file reads back as PNG assets', async () => {
  // A real 1×1 PNG stands in for the flattened pixels of a 1×1 tiled asset.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=';
  clearTileIndexForTesting();
  const { asset: tiled } = tileAssetFromBands(1, 1, () => new Uint8ClampedArray([1, 2, 3, 255]), fixedEncoder(80));
  const id = '00000010-1111-4111-8111-111111111111';
  const draft = {
    version: CURRENT_DRAFT_VERSION,
    name: 'Tiled',
    index: 0,
    settings: { tool: 'brush', zoom: 72, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
    assets: { [id]: tiled },
    history: [frame(id, 1, 1)],
  };
  await assert.rejects(writePortableBundle(draft), /flattened/);
  const flattened = [];
  const blob = await writePortableBundle(draft, {
    flatten: async (asset) => {
      flattened.push(asset);
      return { url: png, w: asset.w, h: asset.h };
    },
  });
  assert.deepEqual(flattened, [tiled]);
  const read = await readPortableBundle(blob);
  assert.deepEqual(read.assets[id], { url: png, w: 1, h: 1 });
  assert.equal(read.history[0].layers[0].asset, id);
});

test('data URL bytes decode natively or by the manual fallback', () => {
  const bytes = dataUrlBytes('data:image/png;base64,AAECAwQ=');
  assert.deepEqual([...bytes], [0, 1, 2, 3, 4]);
});
