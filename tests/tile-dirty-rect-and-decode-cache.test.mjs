import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECODED_TILE_CACHE_DESKTOP_BYTES,
  DECODED_TILE_CACHE_LARGE_DESKTOP_BYTES,
  DECODED_TILE_CACHE_LOW_MEMORY_BYTES,
  DECODED_TILE_CACHE_MOBILE_BYTES,
  DecodedTileCache,
  TILE_SIZE,
  clearTileIndexForTesting,
  decodedTileCacheBudgetForDevice,
  decodedTileCacheDelta,
  dirtyTileRange,
  drawTiledAsset,
  emptyTiledAsset,
  seedDecodedTiles,
  tileAssetFromBands,
  tileGrid,
  tileHintFallback,
  tileRect,
  tiledContentRegion,
  validDecodedTileCacheStats,
} from '../src/tiledAssets.ts';
import {
  canvasDirtyBox,
  noteCanvasWrite,
  noteCanvasWriteUnknown,
  trackCanvasWrites,
  unionDirtyBox,
  untrackCanvasWrites,
} from '../src/canvasDirty.ts';
import { planLayerTrim } from '../src/layerTrim.ts';

// W4-5 (dirty-rectangle hints for tiled commits) and W4-7 (decoded-tile
// cache); see docs/tiled-layer-assets-contract.md.

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
/** Opaque noisy RGBA image (every tile distinct). */
function noisy(w, h, seed = 1) {
  const data = new Uint8ClampedArray(w * h * 4);
  const next = rng(seed);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = next() * 256;
    data[i + 1] = next() * 256;
    data[i + 2] = next() * 256;
    data[i + 3] = 255;
  }
  return data;
}
/** Paint a semi-transparent rectangle (like a soft dab) into `data`. */
function paint(data, w, rect, seed) {
  const next = rng(seed);
  for (let y = rect.y; y < rect.y + rect.h; y += 1)
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * w + x) * 4;
      data[i] = next() * 256;
      data[i + 1] = 40;
      data[i + 2] = 200;
      data[i + 3] = 1 + Math.floor(next() * 254);
    }
}
/** Band reader honouring the column window, recording each read. */
function reader(data, w) {
  const reads = [];
  return {
    reads,
    read: (y, rows, x, width) => {
      reads.push({ y, rows, x, width });
      const out = new Uint8ClampedArray(width * rows * 4);
      for (let row = 0; row < rows; row += 1)
        out.set(data.subarray(((y + row) * w + x) * 4, ((y + row) * w + x + width) * 4), row * width * 4);
      return out;
    },
  };
}
function encoder() {
  const calls = [];
  return {
    calls,
    encode: (x, y, w, h) => {
      calls.push([x, y, w, h]);
      return new Blob([new Uint8Array(80 + calls.length)], { type: 'image/png' });
    },
  };
}
const full = (data, w, h, base) => tileAssetFromBands(w, h, reader(data, w).read, encoder().encode, base);
const keys = (asset) => asset.tiles.map((tile) => (tile ? tile.key : null));

test('a hint is used only with a same-size tiled base and a finite rectangle', () => {
  const base = emptyTiledAsset(1100, 1030);
  assert.equal(tileHintFallback(1100, 1030, { base, dirty: { x: 0, y: 0, w: 5, h: 5 } }), undefined);
  assert.equal(tileHintFallback(1100, 1030, { base, dirty: null }), undefined);
  assert.equal(tileHintFallback(1100, 1030, { base: undefined, dirty: null }), 'no-base');
  assert.equal(tileHintFallback(1100, 1030, { base: { url: 'data:image/png;base64,', w: 1100, h: 1030 }, dirty: null }), 'no-base');
  // Expansion or trim since the buffer was drawn: the base no longer lines up.
  assert.equal(tileHintFallback(1101, 1030, { base, dirty: null }), 'base-size');
  assert.equal(tileHintFallback(1100, 1024, { base, dirty: null }), 'base-size');
  assert.equal(
    tileHintFallback(1100, 1030, { base: { ...base, tiles: base.tiles.slice(1) }, dirty: null }),
    'base-invalid',
  );
  assert.equal(
    tileHintFallback(1100, 1030, { base: { ...base, tiles: [{ key: 'nope', blob: new Blob([]) }, ...base.tiles.slice(1)] }, dirty: null }),
    'base-invalid',
  );
  for (const dirty of [{ x: NaN, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: -1, h: 1 }, { x: 0, y: 0, w: Infinity, h: 1 }, 'all'])
    assert.equal(tileHintFallback(1100, 1030, { base, dirty }), 'dirty-invalid');
});

test('dirty rectangles map to inclusive tile ranges, clamped to the asset', () => {
  assert.deepEqual(dirtyTileRange(1100, 1030, { x: 0, y: 0, w: 1, h: 1 }), { col0: 0, col1: 0, row0: 0, row1: 0 });
  assert.deepEqual(dirtyTileRange(1100, 1030, { x: 255, y: 255, w: 2, h: 2 }), { col0: 0, col1: 1, row0: 0, row1: 1 });
  assert.deepEqual(dirtyTileRange(1100, 1030, { x: 256, y: 0, w: 256, h: 256 }), { col0: 1, col1: 1, row0: 0, row1: 0 });
  // Fractional edges round outwards.
  assert.deepEqual(dirtyTileRange(1100, 1030, { x: 511.5, y: 0.2, w: 0.6, h: 0.1 }), { col0: 1, col1: 2, row0: 0, row1: 0 });
  // Brush reach beyond the layer is clamped; edge tiles are included.
  assert.deepEqual(dirtyTileRange(1100, 1030, { x: -50, y: 1000, w: 5000, h: 900 }), { col0: 0, col1: 4, row0: 3, row1: 4 });
  assert.equal(dirtyTileRange(1100, 1030, { x: 1100, y: 0, w: 10, h: 10 }), null);
  assert.equal(dirtyTileRange(1100, 1030, { x: -20, y: -20, w: 20, h: 5 }), null);
  assert.equal(dirtyTileRange(1100, 1030, { x: 3, y: 3, w: 0, h: 9 }), null);
  assert.equal(dirtyTileRange(1100, 1030, null), null);
});

test('a hinted commit is identical to the full scan and reads only the dirty tiles', () => {
  clearTileIndexForTesting();
  const w = 1300,
    h = 1100;
  const { cols, rows } = tileGrid(w, h);
  const original = noisy(w, h, 5);
  const base = full(original, w, h).asset;
  const next = rng(99);
  for (let trial = 0; trial < 24; trial += 1) {
    const edited = original.slice();
    const rect = {
      x: Math.floor(next() * (w - 1)),
      y: Math.floor(next() * (h - 1)),
      w: 1 + Math.floor(next() * 400),
      h: 1 + Math.floor(next() * 300),
    };
    rect.w = Math.min(rect.w, w - rect.x);
    rect.h = Math.min(rect.h, h - rect.y);
    paint(edited, w, rect, trial + 1);
    // The gesture's hint may be looser than the pixels it changed.
    const pad = Math.floor(next() * 40);
    const dirty = { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad };
    const reference = full(edited, w, h);
    const scan = reader(edited, w),
      enc = encoder();
    const hinted = tileAssetFromBands(w, h, scan.read, enc.encode, undefined, { base, dirty });
    assert.deepEqual(keys(hinted.asset), keys(reference.asset), `trial ${trial}`);
    // Bit-identical down to the shared tile objects.
    hinted.asset.tiles.forEach((tile, index) => assert.equal(tile, reference.asset.tiles[index]));
    const range = dirtyTileRange(w, h, dirty);
    const touched = (range.col1 - range.col0 + 1) * (range.row1 - range.row0 + 1);
    assert.equal(hinted.stats.hinted, true);
    assert.equal(hinted.stats.fallback, undefined);
    assert.equal(hinted.stats.hashed, touched);
    assert.equal(hinted.stats.skipped, cols * rows - touched);
    assert.equal(hinted.stats.tiles, cols * rows);
    // Every read stays inside the dirty tile columns and rows.
    for (const read of scan.reads) {
      assert.equal(read.x, range.col0 * TILE_SIZE);
      assert.equal(read.x + read.width, Math.min(w, (range.col1 + 1) * TILE_SIZE));
      assert.ok(read.y >= range.row0 * TILE_SIZE && read.y + read.rows <= Math.min(h, (range.row1 + 1) * TILE_SIZE));
    }
    assert.equal(scan.reads.length, range.row1 - range.row0 + 1);
    // The reference already encoded the new tiles, so the hinted commit
    // reuses them all; neither path encodes an unchanged tile.
    assert.equal(enc.calls.length, 0);
  }
});

test('the first hinted commit encodes exactly the changed tiles a full scan would', () => {
  clearTileIndexForTesting();
  const w = 1024,
    h = 1024;
  const original = noisy(w, h, 8);
  const base = full(original, w, h).asset;
  const edited = original.slice();
  paint(edited, w, { x: 250, y: 600, w: 20, h: 10 }, 3); // straddles tiles (0,2) and (1,2)
  const enc = encoder();
  const hinted = tileAssetFromBands(w, h, reader(edited, w).read, enc.encode, undefined, {
    base,
    dirty: { x: 240, y: 590, w: 40, h: 30 },
  });
  assert.deepEqual(enc.calls, [
    [0, 512, 256, 256],
    [256, 512, 256, 256],
  ]);
  assert.equal(hinted.stats.encoded, 2);
  assert.equal(hinted.stats.hashed, 2);
  assert.equal(hinted.stats.skipped, 14);
  const changed = keys(hinted.asset).flatMap((key, index) => (key === base.tiles[index].key ? [] : [index]));
  assert.deepEqual(changed, [8, 9]);
  assert.deepEqual(keys(full(edited, w, h).asset), keys(hinted.asset));
});

test('transparent pixels and erased tiles match the full scan (null tiles)', () => {
  clearTileIndexForTesting();
  const w = 1100,
    h = 1000;
  // A sparse layer: transparent except a semi-transparent stroke.
  const original = new Uint8ClampedArray(w * h * 4);
  paint(original, w, { x: 100, y: 100, w: 300, h: 40 }, 4);
  const base = full(original, w, h).asset;
  assert.equal(base.tiles.filter(Boolean).length, 2);
  // Erase the stroke completely and paint elsewhere.
  const edited = original.slice();
  edited.fill(0, (100 * w) * 4, (140 * w) * 4);
  paint(edited, w, { x: 900, y: 800, w: 50, h: 50 }, 6);
  const hinted = tileAssetFromBands(w, h, reader(edited, w).read, encoder().encode, undefined, {
    base,
    dirty: { x: 0, y: 90, w: 1000, h: 800 },
  });
  assert.deepEqual(keys(hinted.asset), keys(full(edited, w, h).asset));
  assert.equal(hinted.asset.tiles.filter(Boolean).length, 1);
});

test('nothing dirty reuses the base tiles without any readback', () => {
  clearTileIndexForTesting();
  const w = 1024,
    h = 1024,
    data = noisy(w, h, 2);
  const base = full(data, w, h).asset;
  for (const dirty of [null, { x: 2000, y: 0, w: 10, h: 10 }]) {
    const scan = reader(data, w);
    const result = tileAssetFromBands(w, h, scan.read, encoder().encode, undefined, { base, dirty });
    assert.equal(scan.reads.length, 0);
    assert.equal(result.stats.hashed, 0);
    assert.equal(result.stats.skipped, 16);
    result.asset.tiles.forEach((tile, index) => assert.equal(tile, base.tiles[index]));
  }
});

test('an unusable hint falls back to the full scan with the same result', () => {
  clearTileIndexForTesting();
  const w = 1100,
    h = 1030,
    data = noisy(w, h, 12);
  const reference = full(data, w, h);
  const smaller = full(noisy(1024, 1030, 12), 1024, 1030).asset;
  for (const [base, reason] of [
    [undefined, 'no-base'],
    [smaller, 'base-size'],
    [{ url: 'data:image/png;base64,AAAA', w, h }, 'no-base'],
  ]) {
    const scan = reader(data, w);
    const result = tileAssetFromBands(w, h, scan.read, encoder().encode, undefined, {
      base,
      dirty: { x: 0, y: 0, w: 1, h: 1 },
    });
    assert.equal(result.stats.fallback, reason);
    assert.equal(result.stats.hinted, false);
    assert.equal(result.stats.hashed, reference.stats.tiles);
    assert.equal(scan.reads.length, tileGrid(w, h).rows);
    assert.ok(scan.reads.every((read) => read.x === 0 && read.width === w));
    assert.deepEqual(keys(result.asset), keys(reference.asset));
  }
});

test('an expansion hint over an empty base reads only the tiles under the drawn layer', () => {
  clearTileIndexForTesting();
  const w = 2646,
    h = 1200;
  const canvas = new Uint8ClampedArray(w * h * 4);
  // A trimmed 300 × 200 layer drawn back at (700, 500) of the grown canvas.
  paint(canvas, w, { x: 700, y: 500, w: 300, h: 200 }, 21);
  const scan = reader(canvas, w);
  const hinted = tileAssetFromBands(w, h, scan.read, encoder().encode, undefined, {
    base: emptyTiledAsset(w, h),
    dirty: { x: 700, y: 500, w: 300, h: 200 },
  });
  assert.deepEqual(keys(hinted.asset), keys(full(canvas, w, h).asset));
  assert.equal(hinted.stats.hashed, 4); // columns 2–3, rows 1–2
  assert.equal(hinted.stats.skipped, hinted.stats.tiles - 4);
  assert.equal(emptyTiledAsset(w, h).tiles.length, tileGrid(w, h).cols * tileGrid(w, h).rows);
  assert.ok(emptyTiledAsset(w, h).tiles.every((tile) => tile === null));
});

test('the hint is trusted: callers must report every write (documented contract)', () => {
  clearTileIndexForTesting();
  const w = 1024,
    h = 1024,
    original = noisy(w, h, 30);
  const base = full(original, w, h).asset;
  const edited = original.slice();
  paint(edited, w, { x: 900, y: 900, w: 10, h: 10 }, 1); // outside the hint
  const hinted = tileAssetFromBands(w, h, reader(edited, w).read, encoder().encode, undefined, {
    base,
    dirty: { x: 0, y: 0, w: 10, h: 10 },
  });
  // The unreported tile keeps the base tile: this is why page code only
  // passes hints for buffers whose every write is tracked.
  assert.equal(hinted.asset.tiles[15], base.tiles[15]);
  assert.notDeepEqual(keys(hinted.asset), keys(full(edited, w, h).asset));
});

test('canvas write tracking unions rectangles and fails safe', () => {
  const canvas = {},
    other = {};
  assert.equal(canvasDirtyBox(canvas), undefined);
  noteCanvasWrite(canvas, 0, 0, 10, 10); // untracked: ignored
  assert.equal(canvasDirtyBox(canvas), undefined);
  trackCanvasWrites(canvas);
  assert.equal(canvasDirtyBox(canvas), null);
  noteCanvasWrite(canvas, 10, 20, 5, 5);
  noteCanvasWrite(canvas, 2.5, 30, 1, 0.2); // fractional: rounded outwards
  noteCanvasWrite(canvas, 50, 50, 0, 10); // empty: ignored
  noteCanvasWrite(other, 500, 500, 5, 5); // another canvas
  assert.deepEqual(canvasDirtyBox(canvas), { x: 2, y: 20, w: 13, h: 11 });
  // Returned boxes are copies.
  canvasDirtyBox(canvas).x = 99;
  assert.equal(canvasDirtyBox(canvas).x, 2);
  noteCanvasWrite(canvas, NaN, 0, 1, 1);
  assert.equal(canvasDirtyBox(canvas), undefined);
  noteCanvasWrite(canvas, 0, 0, 1, 1);
  assert.equal(canvasDirtyBox(canvas), undefined);
  trackCanvasWrites(canvas); // a new gesture starts clean
  assert.equal(canvasDirtyBox(canvas), null);
  noteCanvasWriteUnknown(canvas);
  assert.equal(canvasDirtyBox(canvas), undefined);
  trackCanvasWrites(canvas);
  noteCanvasWrite(canvas, 1, 1, 1, 1);
  untrackCanvasWrites(canvas);
  assert.equal(canvasDirtyBox(canvas), undefined);
  assert.deepEqual(unionDirtyBox(null, null), null);
  assert.deepEqual(unionDirtyBox({ x: 1, y: 1, w: 1, h: 1 }, null), { x: 1, y: 1, w: 1, h: 1 });
  assert.deepEqual(unionDirtyBox({ x: 5, y: 5, w: 1, h: 1 }, { x: -1, y: 7, w: 2, h: 3 }), { x: -1, y: 5, w: 7, h: 5 });
});

test('trimming from the non-empty tile region plans exactly like the whole layer', () => {
  clearTileIndexForTesting();
  const w = 1300,
    h = 1100,
    matrix = [1, 0, 0, 1, -40, 12];
  const next = rng(7);
  for (let trial = 0; trial < 12; trial += 1) {
    const data = new Uint8ClampedArray(w * h * 4);
    const rect = { x: Math.floor(next() * 1200), y: Math.floor(next() * 1000), w: 1 + Math.floor(next() * 90), h: 1 + Math.floor(next() * 90) };
    paint(data, w, rect, trial);
    if (trial % 3 === 0) paint(data, w, { x: 1299, y: 1099, w: 1, h: 1 }, 2);
    const asset = full(data, w, h).asset;
    const region = tiledContentRegion(asset);
    const cropped = new Uint8ClampedArray(region.width * region.height * 4);
    for (let row = 0; row < region.height; row += 1)
      cropped.set(
        data.subarray(((region.y + row) * w + region.x) * 4, ((region.y + row) * w + region.x + region.width) * 4),
        row * region.width * 4,
      );
    for (const margin of [0, 4, 64])
      assert.deepEqual(planLayerTrim(cropped, w, h, matrix, margin, region), planLayerTrim(data, w, h, matrix, margin));
  }
  // Every tile empty: the region is null and the plan is the empty layer.
  const empty = new Uint8ClampedArray(w * h * 4);
  assert.equal(tiledContentRegion(emptyTiledAsset(w, h)), null);
  assert.deepEqual(planLayerTrim([], w, h, matrix, 4, null), planLayerTrim(empty, w, h, matrix, 4));
});

// ---------------------------------------------------------------------------
// Decoded-tile cache.

/** Fake decoded bitmap. */
function bitmap(width, height) {
  return { width, height, closed: false, close() { this.closed = true; } };
}
const tile = (key, size = 100) => ({ key: key.padStart(32, '0'), blob: new Blob([new Uint8Array(size)], { type: 'image/png' }) });

test('the decoded-tile cache is a byte-bounded LRU that closes what it evicts', () => {
  const tileBytes = 256 * 256 * 4;
  const cache = new DecodedTileCache(tileBytes * 3);
  const tiles = ['a', 'b', 'c', 'd'].map((key) => tile(key));
  const bitmaps = tiles.map(() => bitmap(256, 256));
  for (let index = 0; index < 3; index += 1) assert.equal(cache.set(tiles[index], bitmaps[index]), true);
  assert.equal(cache.get(tiles[0]), bitmaps[0]); // a becomes most recent
  assert.equal(cache.set(tiles[3], bitmaps[3]), true); // evicts b
  assert.equal(bitmaps[1].closed, true);
  assert.equal(cache.has(tiles[1]), false);
  assert.equal(cache.get(tiles[1]), undefined);
  assert.equal(cache.get(tiles[2]), bitmaps[2]);
  // A structured clone of a tile (worker copy) hits the same entry; another
  // encoding with the same key but a different size does not.
  assert.equal(cache.get({ key: tiles[2].key, blob: new Blob([new Uint8Array(100)]) }), bitmaps[2]);
  assert.equal(cache.get({ key: tiles[2].key, blob: new Blob([new Uint8Array(101)]) }), undefined);
  // A second set for a cached tile is refused (the caller keeps its bitmap).
  const duplicate = bitmap(256, 256);
  assert.equal(cache.set(tiles[2], duplicate), false);
  assert.equal(duplicate.closed, false);
  const stats = cache.stats();
  assert.deepEqual(
    { hits: stats.hits, misses: stats.misses, stores: stats.stores, evictions: stats.evictions, entries: stats.entries },
    { hits: 3, misses: 2, stores: 4, evictions: 1, entries: 3 },
  );
  assert.equal(stats.bytes, tileBytes * 3);
  assert.equal(stats.maxBytes, tileBytes * 3);
  assert.ok(validDecodedTileCacheStats(stats));
  cache.clear();
  assert.ok([bitmaps[0], bitmaps[2], bitmaps[3]].every((item) => item.closed));
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().bytes, 0);
});

test('tiles larger than the budget, or a zero budget, are rejected, not stored', () => {
  const none = new DecodedTileCache(0);
  assert.equal(none.set(tile('a'), bitmap(1, 1)), false);
  assert.equal(none.stats().rejected, 1);
  const small = new DecodedTileCache(1000);
  assert.equal(small.set(tile('b'), bitmap(256, 256)), false);
  assert.equal(small.set(tile('c'), bitmap(10, 10)), true);
  assert.throws(() => new DecodedTileCache(-1), RangeError);
  assert.throws(() => new DecodedTileCache(1.5), RangeError);
});

test('decoded-tile budgets follow the device tiers', () => {
  assert.equal(decodedTileCacheBudgetForDevice(), DECODED_TILE_CACHE_DESKTOP_BYTES);
  assert.equal(decodedTileCacheBudgetForDevice({ deviceMemory: 8 }), DECODED_TILE_CACHE_LARGE_DESKTOP_BYTES);
  assert.equal(decodedTileCacheBudgetForDevice({ mobile: true }), DECODED_TILE_CACHE_MOBILE_BYTES);
  assert.equal(decodedTileCacheBudgetForDevice({ mobile: true, deviceMemory: 8 }), DECODED_TILE_CACHE_MOBILE_BYTES);
  assert.equal(decodedTileCacheBudgetForDevice({ deviceMemory: 4 }), DECODED_TILE_CACHE_MOBILE_BYTES);
  assert.equal(decodedTileCacheBudgetForDevice({ deviceMemory: 2 }), DECODED_TILE_CACHE_LOW_MEMORY_BYTES);
  assert.equal(decodedTileCacheBudgetForDevice({ deviceMemory: Number.NaN }), DECODED_TILE_CACHE_DESKTOP_BYTES);
  assert.ok(DECODED_TILE_CACHE_MOBILE_BYTES < DECODED_TILE_CACHE_DESKTOP_BYTES);
  // A 2646 × 4096 layer (176 tiles) fits the desktop budget.
  assert.ok(2646 * 4096 * 4 < DECODED_TILE_CACHE_DESKTOP_BYTES);
});

test('cache counter deltas and validation', () => {
  const before = { hits: 1, misses: 2, stores: 3, seeded: 0, evictions: 0, rejected: 0, entries: 3, bytes: 30, maxBytes: 100 };
  const after = { hits: 5, misses: 2, stores: 4, seeded: 1, evictions: 1, rejected: 0, entries: 3, bytes: 30, maxBytes: 100 };
  assert.deepEqual(decodedTileCacheDelta(before, after), {
    hits: 4, misses: 0, stores: 1, seeded: 1, evictions: 1, rejected: 0, entries: 3, bytes: 30, maxBytes: 100,
  });
  assert.equal(validDecodedTileCacheStats({ ...after, hits: -1 }), false);
  assert.equal(validDecodedTileCacheStats({ ...after, bytes: 1.5 }), false);
  assert.equal(validDecodedTileCacheStats(null), false);
  assert.equal(validDecodedTileCacheStats([]), false);
});

/** Install a fake createImageBitmap that decodes Blobs by a size table. */
function fakeDecoder(sizes) {
  const calls = [];
  const previous = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async (source, sx, sy, sw, sh) => {
    if (source instanceof Blob) {
      calls.push(source);
      const [width, height] = sizes.get(source) ?? [1, 1];
      return bitmap(width, height);
    }
    calls.push([sx, sy, sw, sh]);
    return bitmap(sw, sh);
  };
  return { calls, restore: () => (globalThis.createImageBitmap = previous) };
}
/** Fake 2D context recording drawImage calls. */
function recordingContext() {
  const draws = [];
  return { draws, drawImage: (image, x, y) => draws.push([image, x, y]) };
}
function fakeTiledAsset(w, h, seed, shared = new Map()) {
  const { cols, rows } = tileGrid(w, h);
  const sizes = new Map();
  const tiles = Array.from({ length: cols * rows }, (_, index) => {
    if ((index + seed) % 5 === 0) return null;
    const rect = tileRect(w, h, index);
    const id = `${seed}-${index}`;
    const key = (shared.get(index) ?? id).replace(/[^0-9a-f]/g, 'a');
    const made = { key: key.padStart(32, 'f').slice(-32), blob: new Blob([new Uint8Array(50 + index)], { type: 'image/png' }) };
    sizes.set(made.blob, [rect.w, rect.h]);
    return made;
  });
  return { asset: { w, h, tileSize: TILE_SIZE, tiles }, sizes };
}

test('assembling a version that shares tiles draws them from the cache instead of decoding', async () => {
  const w = 1100,
    h = 900;
  const { asset, sizes } = fakeTiledAsset(w, h, 1);
  // The next version replaces two tiles and shares every other one.
  const tiles = asset.tiles.slice();
  const replaced = [];
  for (const index of [3, 7]) {
    const rect = tileRect(w, h, index);
    tiles[index] = { key: `${'e'.repeat(31)}${index}`, blob: new Blob([new Uint8Array(999 + index)], { type: 'image/png' }) };
    sizes.set(tiles[index].blob, [rect.w, rect.h]);
    replaced.push(index);
  }
  const next = { ...asset, tiles };
  const decoder = fakeDecoder(sizes);
  try {
    const cache = new DecodedTileCache(64 * 1024 * 1024);
    const nonEmpty = asset.tiles.filter(Boolean).length;
    const first = recordingContext();
    await drawTiledAsset(asset, first, 4, cache);
    assert.equal(decoder.calls.length, nonEmpty);
    assert.equal(first.draws.length, nonEmpty);
    assert.equal(cache.stats().entries, nonEmpty);
    const second = recordingContext();
    await drawTiledAsset(next, second, 4, cache);
    // Only the two replaced tiles were decoded; everything else was a hit.
    assert.equal(decoder.calls.length, nonEmpty + replaced.length);
    assert.equal(second.draws.length, next.tiles.filter(Boolean).length);
    for (const [, x, y] of second.draws) assert.ok(Number.isInteger(x) && Number.isInteger(y));
    const positions = second.draws.map(([, x, y]) => `${x},${y}`).sort();
    const expected = next.tiles.flatMap((item, index) => {
      if (!item) return [];
      const rect = tileRect(w, h, index);
      return [`${rect.x},${rect.y}`];
    }).sort();
    assert.deepEqual(positions, expected);
    assert.equal(cache.stats().hits, nonEmpty - replaced.filter((index) => asset.tiles[index]).length);
    // Undo back to the first version: every tile is cached now.
    const third = recordingContext();
    await drawTiledAsset(asset, third, 4, cache);
    assert.equal(decoder.calls.length, nonEmpty + replaced.length);
    // Without a cache every tile is decoded again (the previous behaviour).
    await drawTiledAsset(asset, recordingContext(), 4, null);
    assert.equal(decoder.calls.length, nonEmpty * 2 + replaced.length);
  } finally {
    decoder.restore();
  }
});

test('equal tiles in one asset decode once; a wrong-size tile fails and is not cached', async () => {
  const w = 1024,
    h = 512;
  const same = { key: 'c'.repeat(32), blob: new Blob([new Uint8Array(70)], { type: 'image/png' }) };
  const sizes = new Map([[same.blob, [256, 256]]]);
  const asset = { w, h, tileSize: TILE_SIZE, tiles: Array.from({ length: 8 }, () => same) };
  const decoder = fakeDecoder(sizes);
  try {
    const cache = new DecodedTileCache(16 * 1024 * 1024);
    const context = recordingContext();
    await drawTiledAsset(asset, context, 8, cache);
    assert.equal(decoder.calls.length, 1);
    assert.equal(context.draws.length, 8);
    const bad = { key: 'd'.repeat(32), blob: new Blob([new Uint8Array(71)], { type: 'image/png' }) };
    sizes.set(bad.blob, [255, 256]);
    const broken = { ...asset, tiles: [bad, ...asset.tiles.slice(1)] };
    await assert.rejects(drawTiledAsset(broken, recordingContext(), 8, cache), /dimensions do not match/);
    assert.equal(cache.has(bad), false);
  } finally {
    decoder.restore();
  }
});

test('seeding copies a committed buffer into the cache once, within half the budget', async () => {
  const w = 1100,
    h = 900;
  const { asset, sizes } = fakeTiledAsset(w, h, 2);
  const decoder = fakeDecoder(sizes);
  try {
    const cache = new DecodedTileCache(64 * 1024 * 1024);
    const nonEmpty = asset.tiles.filter(Boolean).length;
    const source = { width: w, height: h };
    assert.equal(await seedDecodedTiles(asset, source, cache), nonEmpty);
    assert.equal(cache.stats().seeded, nonEmpty);
    // Each seed is the tile's own rectangle of the source.
    const rects = decoder.calls.map((call) => call.join(','));
    asset.tiles.forEach((item, index) => {
      if (!item) return;
      const rect = tileRect(w, h, index);
      assert.ok(rects.includes(`${rect.x},${rect.y},${rect.w},${rect.h}`));
    });
    assert.equal(await seedDecodedTiles(asset, source, cache), 0); // already cached
    const context = recordingContext();
    await drawTiledAsset(asset, context, 4, cache);
    assert.equal(decoder.calls.length, nonEmpty); // no Blob decode at all
    // A cache too small for half the asset is left alone.
    const small = new DecodedTileCache(256 * 256 * 4 * 3);
    assert.equal(await seedDecodedTiles(asset, source, small), 0);
    assert.equal(small.stats().entries, 0);
  } finally {
    decoder.restore();
  }
});
