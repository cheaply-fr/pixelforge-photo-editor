import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ByteLruCache,
  LAYER_FILTER_CACHE_DESKTOP_BYTES,
  LAYER_FILTER_CACHE_LARGE_DESKTOP_BYTES,
  LAYER_FILTER_CACHE_LOW_MEMORY_BYTES,
  LAYER_FILTER_CACHE_MOBILE_BYTES,
  assetFingerprint,
  assetFingerprints,
  hashString,
  layerFilterCacheBudgetForDevice,
  layerFilterCacheDelta,
  layerFilterCacheKey,
  primeAssetFingerprints,
  stableSerialize,
  validLayerFilterCacheStats,
} from '../src/layerFilterCache.ts';
import {
  clearDecodedAssetCache,
  decodeAsset,
  decodedAssetBudgetForDevice,
  decodedAssetCacheStats,
  neutral,
  releaseRetiredDecodedAssets,
  renderFrame,
} from '../src/document.ts';

// ---------------------------------------------------------------------------
// Fixtures

/** A syntactically valid PNG data URL whose IHDR declares w x h (+ salt bytes). */
function pngUrl(w, h, salt = 0) {
  const bytes = new Uint8Array(33 + 3);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, w);
  new DataView(bytes.buffer).setUint32(20, h);
  bytes.set([8, 6, 0, 0, 0], 24);
  bytes.set([salt & 255, (salt >> 8) & 255, 7], 33);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

const ASSET = 'asset-a';
const assetsFor = (w = 24, h = 16, salt = 0) => ({ [ASSET]: { url: pngUrl(w, h, salt), w, h } });

function layer(id, patch = {}) {
  return {
    id,
    name: id,
    visible: true,
    locked: false,
    opacity: 1,
    blend: 'source-over',
    matrix: [1, 0, 0, 1, 0, 0],
    adjustments: structuredClone(neutral),
    kind: 'raster',
    asset: ASSET,
    fillColor: '#336699',
    ...patch,
  };
}

const clouds = (patch = {}) => ({
  type: 'clouds',
  amount: 100,
  radius: 16,
  angle: 0,
  centerX: 0.5,
  centerY: 0.5,
  seed: 9,
  cloudRender: { foreground: '#e08a30', background: '#080c28', scale: 8, fill: true },
  ...patch,
});
const withFilter = (filterEffects, patch = {}) => {
  const base = layer('filtered', patch);
  base.adjustments.filterEffects = filterEffects;
  return base;
};

// ---------------------------------------------------------------------------
// Key canonicalization

test('equivalent filter parameters share one canonical key', () => {
  const assets = assetsFor();
  const reference = layerFilterCacheKey(withFilter(clouds()), assets);
  assert.equal(typeof reference, 'string');
  // Property order, out-of-range clamping, fractional seeds and irrelevant
  // fields all normalize away through effectiveFilterEffects.
  const reordered = {
    cloudRender: { fill: true, scale: 8, background: '#080c28', foreground: '#e08a30' },
    seed: 9.75,
    centerY: 0.5,
    centerX: 0.5,
    angle: 0,
    radius: 16.2,
    amount: 140,
    type: 'clouds',
    noiseDistribution: 'gaussian',
    liquifyMode: 'push',
  };
  assert.equal(layerFilterCacheKey(withFilter(reordered), assets), reference);
  // Compositing metadata applied after the local stage never changes the key.
  const composited = withFilter(clouds(), {
    opacity: 0.25,
    blend: 'multiply',
    visible: false,
    matrix: [2, 0, 0, 2, 40, -3],
    mask: 'mask-asset',
    maskEnabled: true,
    groupId: 'group-1',
  });
  composited.adjustments.hue = 90;
  composited.adjustments.levelsGamma = 1.4;
  assert.equal(layerFilterCacheKey(composited, assets), reference);
  // Asset objects with the same content (a structured clone) key the same.
  assert.equal(layerFilterCacheKey(withFilter(clouds()), structuredClone(assets)), reference);
});

test('every input of the local filter stage changes the key', () => {
  const assets = assetsFor();
  const reference = layerFilterCacheKey(withFilter(clouds()), assets);
  const variants = {
    amount: withFilter(clouds({ amount: 60 })),
    radius: withFilter(clouds({ radius: 12 })),
    seed: withFilter(clouds({ seed: 10 })),
    cloudScale: withFilter(clouds({ cloudRender: { foreground: '#e08a30', background: '#080c28', scale: 9, fill: true } })),
    cloudColour: withFilter(clouds({ cloudRender: { foreground: '#ffffff', background: '#080c28', scale: 8, fill: true } })),
    cloudFill: withFilter(clouds({ cloudRender: { foreground: '#e08a30', background: '#080c28', scale: 8, fill: false } })),
    type: withFilter(clouds({ type: 'difference-clouds' })),
    fill: withFilter(clouds(), { fillColor: '#000000' }),
    smartFilters: withFilter(clouds(), { smartFilters: [{ type: 'gaussian-blur', amount: 50, radius: 2, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 }] }),
    matting: withFilter(clouds(), { matting: { defringe: 2, removeBlackMatte: false, removeWhiteMatte: false } }),
    styles: withFilter(clouds(), { styles: { colorOverlay: { enabled: true, color: '#ff0000', opacity: 1 } } }),
    spotHealing: withFilter(clouds(), { spotHealing: [{ x: 1, y: 1, radius: 2 }] }),
  };
  const keys = new Set([reference]);
  for (const [name, value] of Object.entries(variants)) {
    const key = layerFilterCacheKey(value, assets);
    assert.equal(typeof key, 'string', name);
    assert.notEqual(key, reference, name);
    keys.add(key);
  }
  assert.equal(keys.size, Object.keys(variants).length + 1);
  // Noise options are part of an Add Noise key.
  const noise = (patch) => withFilter({ type: 'add-noise', amount: 20, radius: 0, angle: 0, centerX: 0.5, centerY: 0.5, seed: 3, ...patch });
  assert.notEqual(
    layerFilterCacheKey(noise({ noiseDistribution: 'uniform' }), assets),
    layerFilterCacheKey(noise({ noiseDistribution: 'gaussian' }), assets),
  );
  assert.notEqual(
    layerFilterCacheKey(noise({ noiseMonochromatic: false }), assets),
    layerFilterCacheKey(noise({ noiseMonochromatic: true }), assets),
  );
  // Same asset id with different pixels (e.g. another imported project).
  const image = withFilter(clouds(), { fillColor: undefined });
  assert.notEqual(
    layerFilterCacheKey(image, assetsFor(24, 16, 1)),
    layerFilterCacheKey(image, assetsFor(24, 16, 2)),
  );
  assert.notEqual(
    layerFilterCacheKey(image, assetsFor(24, 16, 1)),
    layerFilterCacheKey(image, assetsFor(16, 24, 1)),
  );
  // Content-aware masks are keyed by their own content too.
  const masked = withFilter(clouds(), { contentAwareFills: [{ mask: 'm1', sampleRadius: 4 }] });
  const withMask = (salt) => ({ ...assets, m1: { url: pngUrl(24, 16, salt), w: 24, h: 16 } });
  assert.notEqual(layerFilterCacheKey(masked, withMask(5)), layerFilterCacheKey(masked, withMask(6)));
});

test('layers without an expensive stage, nested contents or the tiled adapter are not cached', () => {
  const assets = assetsFor();
  assert.equal(layerFilterCacheKey(layer('plain'), assets), undefined);
  assert.equal(layerFilterCacheKey(withFilter(clouds({ amount: 0 })), assets), undefined);
  assert.equal(layerFilterCacheKey({ ...withFilter(clouds()), kind: 'text' }, assets), undefined);
  assert.equal(
    layerFilterCacheKey({ ...withFilter(clouds()), kind: 'smart-object', contents: { w: 1, h: 1, layers: [] } }, assets),
    undefined,
  );
  assert.equal(layerFilterCacheKey(withFilter(clouds()), {}), undefined);
  const blur = withFilter({ type: 'gaussian-blur', amount: 100, radius: 3, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 });
  assert.equal(typeof layerFilterCacheKey(blur, assets), 'string');
  assert.equal(layerFilterCacheKey(blur, assets, { tiledFilter: true }), undefined);
  // Smart Filters alone are an expensive stage.
  assert.equal(
    typeof layerFilterCacheKey(layer('smart', { smartFilters: [clouds()] }), assets),
    'string',
  );
});

test('stable serialization and hashing are order independent and content sensitive', () => {
  assert.equal(stableSerialize({ b: 1, a: [1, { d: 2, c: 3 }] }), stableSerialize({ a: [1, { c: 3, d: 2 }], b: 1 }));
  assert.equal(stableSerialize({ a: undefined, b: 1 }), stableSerialize({ b: 1 }));
  assert.notEqual(stableSerialize({ a: 1 }), stableSerialize({ a: '1' }));
  assert.match(hashString('abc'), /^[0-9a-f]{16}$/);
  assert.notEqual(hashString('abc'), hashString('abd'));
  assert.equal(hashString('x'.repeat(1000)), hashString('x'.repeat(1000)));
});

test('worker fingerprint priming accepts only values that match the asset', () => {
  const source = assetsFor(24, 16, 3);
  const keys = assetFingerprints(source);
  assert.equal(keys[ASSET], assetFingerprint(source[ASSET]));
  const cloned = structuredClone(source);
  primeAssetFingerprints(cloned, keys);
  assert.equal(assetFingerprint(cloned[ASSET]), keys[ASSET]);
  // A forged or mismatched fingerprint is ignored and recomputed locally.
  const other = structuredClone(assetsFor(24, 16, 4));
  primeAssetFingerprints(other, { [ASSET]: keys[ASSET].replace(/^24x16/, '16x24'), missing: 'x' });
  assert.notEqual(assetFingerprint(other[ASSET]), keys[ASSET]);
  primeAssetFingerprints(other, 'not-an-object');
});

// ---------------------------------------------------------------------------
// LRU bounds

test('the LRU evicts least-recently used entries by byte size', () => {
  const cache = new ByteLruCache(100);
  assert.equal(cache.set('a', 'A', 40), true);
  assert.equal(cache.set('b', 'B', 40), true);
  assert.equal(cache.get('a'), 'A'); // a is now most recent
  assert.equal(cache.set('c', 'C', 40), true);
  assert.deepEqual(cache.keys(), ['a', 'c']);
  assert.equal(cache.bytes, 80);
  assert.equal(cache.get('b'), undefined);
  // Replacing a key releases its old size before eviction is considered.
  assert.equal(cache.set('a', 'A2', 60), true);
  assert.deepEqual(cache.keys(), ['c', 'a']);
  assert.equal(cache.bytes, 100);
  // An entry larger than the whole budget is rejected without evicting.
  assert.equal(cache.set('huge', 'H', 101), false);
  assert.deepEqual(cache.keys(), ['c', 'a']);
  const stats = cache.stats();
  assert.deepEqual(
    { hits: stats.hits, misses: stats.misses, evictions: stats.evictions, rejected: stats.rejected, entries: stats.entries, bytes: stats.bytes },
    { hits: 1, misses: 1, evictions: 1, rejected: 1, entries: 2, bytes: 100 },
  );
  assert.equal(validLayerFilterCacheStats(stats), true);
  assert.equal(validLayerFilterCacheStats({ ...stats, hits: -1 }), false);
  const delta = layerFilterCacheDelta({ ...stats, hits: 0, misses: 0 }, stats);
  assert.equal(delta.hits, 1);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
  assert.throws(() => new ByteLruCache(-1), RangeError);
  assert.throws(() => cache.set('x', 'X', 1.5), RangeError);
});

test('the cache budget follows coarse device memory hints', () => {
  assert.equal(layerFilterCacheBudgetForDevice({}), LAYER_FILTER_CACHE_DESKTOP_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ deviceMemory: 8 }), LAYER_FILTER_CACHE_LARGE_DESKTOP_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ deviceMemory: 8, mobile: true }), LAYER_FILTER_CACHE_MOBILE_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ deviceMemory: 6 }), LAYER_FILTER_CACHE_DESKTOP_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ deviceMemory: 4 }), LAYER_FILTER_CACHE_MOBILE_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ mobile: true }), LAYER_FILTER_CACHE_MOBILE_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ deviceMemory: 2, mobile: false }), LAYER_FILTER_CACHE_LOW_MEMORY_BYTES);
  assert.equal(layerFilterCacheBudgetForDevice({ deviceMemory: Number.NaN }), LAYER_FILTER_CACHE_DESKTOP_BYTES);
  assert.equal(LAYER_FILTER_CACHE_DESKTOP_BYTES, 256 * 1024 * 1024);
  assert.equal(decodedAssetBudgetForDevice(LAYER_FILTER_CACHE_DESKTOP_BYTES), 64_000_000);
  assert.equal(decodedAssetBudgetForDevice(LAYER_FILTER_CACHE_MOBILE_BYTES), 32_000_000);
  assert.equal(decodedAssetBudgetForDevice(LAYER_FILTER_CACHE_LOW_MEMORY_BYTES), 16_000_000);
});

// ---------------------------------------------------------------------------
// Renderer integration on a pixel-backed fake OffscreenCanvas

class PixelSurface {
  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }
  getContext() {
    const surface = this;
    if (surface.pixels.length !== surface.width * surface.height * 4)
      surface.pixels = new Uint8ClampedArray(surface.width * surface.height * 4);
    const state = { alpha: 1, op: 'source-over', tx: 0, ty: 0, fill: '#000000' };
    const stack = [];
    return {
      set globalAlpha(value) { state.alpha = value; },
      get globalAlpha() { return state.alpha; },
      set globalCompositeOperation(value) { state.op = value; },
      get globalCompositeOperation() { return state.op; },
      set fillStyle(value) { state.fill = value; },
      get fillStyle() { return state.fill; },
      filter: 'none',
      save() { stack.push({ ...state }); },
      restore() { Object.assign(state, stack.pop()); },
      setTransform(a, b, c, d, e, f) {
        assert.deepEqual([a, b, c, d], [1, 0, 0, 1], 'fixture supports translation only');
        state.tx = e;
        state.ty = f;
      },
      fillRect(x, y, w, h) {
        const rgb = [1, 3, 5].map((i) => Number.parseInt(state.fill.slice(i, i + 2), 16));
        for (let py = y; py < y + h; py += 1)
          for (let px = x; px < x + w; px += 1) surface.pixels.set([...rgb, 255], (py * surface.width + px) * 4);
      },
      getImageData(x, y, w, h) {
        assert.deepEqual([x, y, w, h], [0, 0, surface.width, surface.height]);
        return { data: new Uint8ClampedArray(surface.pixels), width: w, height: h };
      },
      putImageData(image) {
        surface.pixels.set(image.data);
      },
      drawImage(source, dx = 0, dy = 0) {
        const src = source.pixels;
        for (let sy = 0; sy < source.height; sy += 1) {
          for (let sx = 0; sx < source.width; sx += 1) {
            const x = sx + dx + state.tx, y = sy + dy + state.ty;
            if (x < 0 || y < 0 || x >= surface.width || y >= surface.height) continue;
            const s = (sy * source.width + sx) * 4, d = (y * surface.width + x) * 4;
            const a = (src[s + 3] / 255) * state.alpha, b = surface.pixels[d + 3] / 255;
            const out = a + b * (1 - a);
            for (let c = 0; c < 3; c += 1)
              surface.pixels[d + c] = out === 0 ? 0 : Math.round((src[s + c] * a + surface.pixels[d + c] * b * (1 - a)) / out);
            surface.pixels[d + 3] = Math.round(out * 255);
          }
        }
      },
    };
  }
}

async function withPixelSurfaces(run) {
  const original = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = PixelSurface;
  try {
    return await run();
  } finally {
    if (original === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = original;
  }
}

const frameOf = (layers, w = 24, h = 16) => ({ w, h, layers, active: layers[0].id });
const FILTERS = {
  clouds: clouds(),
  'add-noise': { type: 'add-noise', amount: 35, radius: 0, angle: 0, centerX: 0.5, centerY: 0.5, seed: 11, noiseDistribution: 'gaussian' },
  'gaussian-blur': { type: 'gaussian-blur', amount: 100, radius: 3, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 },
};

for (const [name, effect] of Object.entries(FILTERS)) {
  test(`cached ${name} output is bit-identical to an uncached render`, async () => {
    await withPixelSurfaces(async () => {
      const assets = assetsFor();
      // A half-transparent stripe gives blur/noise real structure to work on.
      // Blur needs structure: a seeded Add Noise Smart Filter runs first.
      const filtered = withFilter(effect, {
        fillColor: '#c06030',
        matrix: [1, 0, 0, 1, 2, 1],
        ...(name === 'gaussian-blur' ? { smartFilters: [FILTERS['add-noise']] } : {}),
      });
      const other = layer('other', { fillColor: '#205080', opacity: 0.4 });
      const frame = frameOf([other, filtered]);
      const fresh = await renderFrame(frame, assets, undefined, { layerFilterCache: null });
      // The fixture must exercise the filter, not just copy a flat fill.
      const unfiltered = await renderFrame(
        frameOf([other, { ...filtered, adjustments: { ...filtered.adjustments, filterEffects: { type: 'none' } } }]),
        assets, undefined, { layerFilterCache: null },
      );
      assert.notDeepEqual(fresh.pixels, unfiltered.pixels);
      const cache = new ByteLruCache(1024 * 1024);
      const first = await renderFrame(frame, assets, undefined, { layerFilterCache: cache });
      // The filtered layer is not the active layer, so only its final
      // surface is kept (no separate filter-stack entry).
      const stores = 1;
      assert.deepEqual(cache.stats().stores, stores);
      assert.deepEqual(first.pixels, fresh.pixels);
      // An unrelated opacity edit and a move of the filtered layer reuse it.
      const edited = frameOf([
        { ...other, opacity: 0.8 },
        { ...filtered, matrix: [1, 0, 0, 1, -1, 3], opacity: 0.7, blend: 'source-over' },
      ]);
      const cached = await renderFrame(edited, assets, undefined, { layerFilterCache: cache });
      const uncached = await renderFrame(edited, assets, undefined, { layerFilterCache: null });
      assert.equal(cache.stats().hits, 1);
      assert.equal(cache.stats().stores, stores);
      assert.deepEqual(cached.pixels, uncached.pixels);
      // Undo to the original frame also hits and matches the first render.
      const undone = await renderFrame(frame, assets, undefined, { layerFilterCache: cache });
      assert.equal(cache.stats().hits, 2);
      assert.deepEqual(undone.pixels, fresh.pixels);
      // Cached surfaces are never mutated by compositing.
      const [key] = cache.keys();
      const stored = cache.get(key);
      const snapshot = new Uint8ClampedArray(stored.pixels);
      await renderFrame(edited, assets, undefined, { layerFilterCache: cache });
      assert.deepEqual(stored.pixels, snapshot);
    });
  });
}

test('a changed filter parameter misses and renders the new result', async () => {
  await withPixelSurfaces(async () => {
    const assets = assetsFor();
    const cache = new ByteLruCache(1024 * 1024);
    await renderFrame(frameOf([withFilter(clouds())]), assets, undefined, { layerFilterCache: cache });
    const next = frameOf([withFilter(clouds({ seed: 99 }))]);
    const cached = await renderFrame(next, assets, undefined, { layerFilterCache: cache });
    const fresh = await renderFrame(next, assets, undefined, { layerFilterCache: null });
    assert.equal(cache.stats().hits, 0);
    assert.equal(cache.stats().stores, 2);
    assert.deepEqual(cached.pixels, fresh.pixels);
  });
});

test('a cancelled render does not populate the cache', async () => {
  await withPixelSurfaces(async () => {
    const assets = assetsFor();
    const cache = new ByteLruCache(1024 * 1024);
    const frame = frameOf([withFilter(clouds())]);
    await assert.rejects(
      renderFrame(frame, assets, undefined, { layerFilterCache: cache, isCancelled: () => true }),
      { name: 'AbortError' },
    );
    assert.equal(cache.size, 0);
    // Cancelled before the second filtered layer: only the completed first
    // layer's full local result may be retained, never the unfinished one.
    let checks = 0;
    const second = { ...withFilter(clouds({ seed: 5 })), id: 'second' };
    await assert.rejects(
      renderFrame(frameOf([withFilter(clouds()), second]), assets, undefined, {
        layerFilterCache: cache,
        isCancelled: () => (checks += 1) > 1,
      }),
      { name: 'AbortError' },
    );
    assert.equal(cache.size, 1);
    assert.equal(cache.keys()[0], layerFilterCacheKey(withFilter(clouds()), assets));
  });
});

test('a budget smaller than one layer computes correctly without retaining it', async () => {
  await withPixelSurfaces(async () => {
    const assets = assetsFor();
    const cache = new ByteLruCache(100);
    const frame = frameOf([withFilter(clouds())]);
    const first = await renderFrame(frame, assets, undefined, { layerFilterCache: cache });
    const fresh = await renderFrame(frame, assets, undefined, { layerFilterCache: null });
    assert.deepEqual(first.pixels, fresh.pixels);
    assert.equal(cache.size, 0);
    assert.equal(cache.stats().rejected, 1);
  });
});

// ---------------------------------------------------------------------------
// Decoded source cache

test('decoded sources are shared by content, bounded, and closed after release', async () => {
  const original = globalThis.createImageBitmap;
  const decodes = [];
  globalThis.createImageBitmap = async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const image = { width: view.getUint32(16), height: view.getUint32(20), closed: false, close() { this.closed = true; } };
    decodes.push(image);
    return image;
  };
  try {
    clearDecodedAssetCache();
    releaseRetiredDecodedAssets();
    const asset = { url: pngUrl(4000, 4000, 1), w: 4000, h: 4000 };
    const a = await decodeAsset(asset);
    // A structured clone (as the worker receives every request) hits.
    assert.equal(await decodeAsset(structuredClone(asset)), a);
    assert.equal(decodes.length, 1);
    // Same dimensions, different content: decoded separately.
    const b = await decodeAsset({ url: pngUrl(4000, 4000, 2), w: 4000, h: 4000 });
    assert.notEqual(b, a);
    // Fill past the 64 MP desktop bound: the least recent source is retired
    // but stays open until the render that may use it releases it.
    for (let salt = 3; salt <= 5; salt += 1)
      await decodeAsset({ url: pngUrl(4000, 4000, salt), w: 4000, h: 4000 });
    assert.equal(decodedAssetCacheStats().entries, 4);
    assert.ok(decodedAssetCacheStats().pixels <= decodedAssetCacheStats().maxPixels);
    assert.equal(a.closed, false);
    releaseRetiredDecodedAssets();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(a.closed, true);
    assert.equal(b.closed, false);
    // Clearing retires everything; release closes it.
    clearDecodedAssetCache();
    assert.equal(decodedAssetCacheStats().entries, 0);
    releaseRetiredDecodedAssets();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(decodes.every((image) => image.closed));
    // Invalid assets are rejected and never cached.
    await assert.rejects(decodeAsset(undefined), /Invalid or oversized/);
    await assert.rejects(decodeAsset({ url: 'data:image/png;base64,AAAA', w: 1, h: 1 }), /Invalid or oversized/);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(decodedAssetCacheStats().entries, 0);
  } finally {
    clearDecodedAssetCache();
    releaseRetiredDecodedAssets();
    if (original === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = original;
  }
});

test('scrubbing the live filter reuses the cached filter stack and matches an uncached render', async () => {
  await withPixelSurfaces(async () => {
    const assets = assetsFor();
    const stacked = (radius) =>
      frameOf([
        withFilter(
          { type: 'gaussian-blur', amount: 100, radius, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 },
          { fillColor: '#c06030', smartFilters: [clouds()] },
        ),
      ]);
    const cache = new ByteLruCache(4 * 1024 * 1024);
    await renderFrame(stacked(3), assets, undefined, { layerFilterCache: cache });
    assert.equal(cache.stats().stores, 2, 'stack result and stack+live result');
    for (const radius of [2, 5, 1]) {
      const before = cache.stats();
      const cached = await renderFrame(stacked(radius), assets, undefined, { layerFilterCache: cache });
      const fresh = await renderFrame(stacked(radius), assets, undefined, { layerFilterCache: null });
      assert.deepEqual(cached.pixels, fresh.pixels, `radius ${radius}`);
      const after = cache.stats();
      // The stacked Clouds come from the cache; only the live blur is new.
      assert.equal(after.hits - before.hits, 1, `radius ${radius} reuses the stack`);
      assert.equal(after.stores - before.stores, 1, `radius ${radius} stores only the new live result`);
    }
  });
});

test('a style edit reuses the cached filter result and matches an uncached render', async () => {
  await withPixelSurfaces(async () => {
    const assets = assetsFor();
    const glow = (opacity) => ({
      outerGlow: { enabled: true, color: '#ffffff', opacity, size: 4, spread: 50, blend: 'source-over' },
    });
    const frame = (opacity) =>
      frameOf([withFilter(clouds(), { styles: { ...glow(opacity), innerShadow: { enabled: true, color: '#000000', opacity: 1, offsetX: 2, offsetY: 2, blur: 0, distance: 1, falloff: 'gaussian' } } })]);
    const cache = new ByteLruCache(4 * 1024 * 1024);
    const first = await renderFrame(frame(0.5), assets, undefined, { layerFilterCache: cache });
    const fresh = await renderFrame(frame(0.5), assets, undefined, { layerFilterCache: null });
    assert.deepEqual(first.pixels, fresh.pixels);
    assert.equal(cache.stats().stores, 2, 'filtered result and styled result');
    const before = cache.stats();
    const edited = await renderFrame(frame(0.9), assets, undefined, { layerFilterCache: cache });
    const editedFresh = await renderFrame(frame(0.9), assets, undefined, { layerFilterCache: null });
    assert.deepEqual(edited.pixels, editedFresh.pixels);
    const after = cache.stats();
    assert.equal(after.hits - before.hits, 1, 'the filtered clouds are reused');
    assert.equal(after.stores - before.stores, 1, 'only the restyled result is new');
  });
});
