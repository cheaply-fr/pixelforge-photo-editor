import test from 'node:test';
import assert from 'node:assert/strict';
import { insertLayerAboveActive } from '../src/layerInsertion.ts';
import { clippingGroupBase } from '../src/layerClipping.ts';
import {
  CompositeCache,
  compositeEquivalenceKey,
} from '../src/compositeCache.ts';
import {
  assetIsKnownTransparent,
  frameCompositeKey,
  layerCompositeInert,
  neutral,
  renderFrame,
} from '../src/document.ts';

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const raster = (n, patch = {}) => ({
  id: id(n),
  name: `Paint ${n}`,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: structuredClone(neutral),
  kind: 'raster',
  asset: `asset-${n}`,
  ...patch,
});
const emptyTiled = { w: 512, h: 512, tileSize: 256, tiles: [null, null, null, null] };
const paintedTiled = (hash) => ({
  w: 512,
  h: 512,
  tileSize: 256,
  tiles: [{ key: hash, blob: undefined }, null, null, null],
});
const frameOf = (layers, patch = {}) => ({
  w: 512,
  h: 512,
  layers,
  groups: [],
  active: layers[0]?.id,
  selectedLayerIds: layers[0] ? [layers[0].id] : [],
  ...patch,
});
const fresh = () => raster(99, { name: 'New', asset: 'asset-new' });
const ids = (frame) => frame.layers.map((layer) => layer.id);

// ---------------------------------------------------------------- insertion

test('a new layer goes directly above the active layer and becomes the only selection', () => {
  const frame = frameOf([raster(1), raster(2), raster(3)], { active: id(2), selectedLayerIds: [id(2), id(3)] });
  const before = structuredClone(frame);
  const result = insertLayerAboveActive(frame, fresh());
  assert.deepEqual(ids(result.frame), [id(1), id(2), id(99), id(3)]);
  assert.equal(result.index, 2);
  assert.equal(result.clipped, false);
  assert.equal(result.frame.active, id(99));
  assert.deepEqual(result.frame.selectedLayerIds, [id(99)]);
  assert.deepEqual(frame, before, 'the input frame is not mutated');
});

test('bottom, top and missing active layers', () => {
  const layers = [raster(1), raster(2)];
  assert.deepEqual(ids(insertLayerAboveActive(frameOf(layers, { active: id(1) }), fresh()).frame), [id(1), id(99), id(2)]);
  assert.deepEqual(ids(insertLayerAboveActive(frameOf(layers, { active: id(2) }), fresh()).frame), [id(1), id(2), id(99)]);
  const none = insertLayerAboveActive(frameOf(layers, { active: 'gone' }), fresh());
  assert.deepEqual(ids(none.frame), [id(1), id(2), id(99)], 'unknown active: top of the stack');
  assert.equal(none.index, 2);
  const empty = insertLayerAboveActive(frameOf([], { active: undefined }), fresh());
  assert.deepEqual(ids(empty.frame), [id(99)]);
});

test('caller-supplied groupId and clippingTo are ignored in favour of the active layer', () => {
  const frame = frameOf([raster(1), raster(2)], { active: id(1) });
  const result = insertLayerAboveActive(frame, { ...fresh(), groupId: 'stale', clippingTo: id(2) });
  const inserted = result.frame.layers[1];
  assert.equal(inserted.groupId, undefined);
  assert.equal(inserted.clippingTo, undefined);
});

test('inside an unlocked folder the layer joins the folder and keeps it contiguous', () => {
  const frame = frameOf(
    [raster(1), raster(2, { groupId: 'g' }), raster(3, { groupId: 'g' }), raster(4)],
    { active: id(2), groups: [{ id: 'g', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false }] },
  );
  const result = insertLayerAboveActive(frame, fresh());
  assert.deepEqual(ids(result.frame), [id(1), id(2), id(99), id(3), id(4)]);
  assert.equal(result.frame.layers[2].groupId, 'g');
  const members = result.frame.layers.map((layer, index) => (layer.groupId === 'g' ? index : -1)).filter((i) => i >= 0);
  assert.deepEqual(members, [1, 2, 3]);
});

test('a locked folder is not edited: the layer goes above the folder', () => {
  const frame = frameOf(
    [raster(1), raster(2, { groupId: 'g' }), raster(3, { groupId: 'g' }), raster(4)],
    { active: id(2), groups: [{ id: 'g', name: 'Folder', visible: true, locked: true, opacity: 1, blend: 'source-over', collapsed: false }] },
  );
  const result = insertLayerAboveActive(frame, fresh());
  assert.deepEqual(ids(result.frame), [id(1), id(2), id(3), id(99), id(4)]);
  assert.equal(result.frame.layers[3].groupId, undefined);
});

test('above a clipping base with clipped layers the new layer joins the group', () => {
  // base 1, 2 clipped to 1, 3 clipped to 2 (stored adjacent chain), 4 free.
  const frame = frameOf(
    [raster(1), raster(2, { clippingTo: id(1) }), raster(3, { clippingTo: id(2) }), raster(4)],
    { active: id(1) },
  );
  const result = insertLayerAboveActive(frame, fresh());
  assert.deepEqual(ids(result.frame), [id(1), id(99), id(2), id(3), id(4)]);
  assert.equal(result.clipped, true);
  const [base, added, second, third, free] = result.frame.layers;
  assert.equal(added.clippingTo, base.id);
  assert.equal(second.clippingTo, added.id, 'the clipped layer above is re-pointed');
  for (const layer of [added, second, third]) assert.equal(clippingGroupBase(result.frame, layer)?.id, base.id);
  assert.equal(clippingGroupBase(result.frame, free), undefined);
});

test('above a clipped layer the new layer joins the same clipping group', () => {
  const top = frameOf([raster(1), raster(2, { clippingTo: id(1) }), raster(3)], { active: id(2) });
  const atTop = insertLayerAboveActive(top, fresh());
  assert.deepEqual(ids(atTop.frame), [id(1), id(2), id(99), id(3)]);
  assert.equal(atTop.clipped, true);
  assert.equal(clippingGroupBase(atTop.frame, atTop.frame.layers[2])?.id, id(1));
  assert.equal(atTop.frame.layers[3].clippingTo, undefined);

  const middle = frameOf(
    [raster(1), raster(2, { clippingTo: id(1) }), raster(3, { clippingTo: id(2) })],
    { active: id(2) },
  );
  const inMiddle = insertLayerAboveActive(middle, fresh());
  assert.deepEqual(ids(inMiddle.frame), [id(1), id(2), id(99), id(3)]);
  assert.equal(inMiddle.frame.layers[3].clippingTo, id(99));
  for (const layer of inMiddle.frame.layers.slice(1))
    assert.equal(clippingGroupBase(inMiddle.frame, layer)?.id, id(1));
});

test('an unclipped active layer with a free layer above does not create clipping', () => {
  const frame = frameOf([raster(1), raster(2)], { active: id(1) });
  const result = insertLayerAboveActive(frame, fresh());
  assert.equal(result.clipped, false);
  assert.ok(result.frame.layers.every((layer) => layer.clippingTo === undefined));
});

test('artboards listing the active layer also list the new layer', () => {
  const frame = frameOf([raster(1), raster(2)], {
    active: id(1),
    artboards: [
      { id: 'a', name: 'A', x: 0, y: 0, w: 10, h: 10, layerIds: [id(1)] },
      { id: 'b', name: 'B', x: 0, y: 0, w: 10, h: 10, layerIds: [id(2)] },
    ],
  });
  const result = insertLayerAboveActive(frame, fresh());
  assert.deepEqual(result.frame.artboards[0].layerIds, [id(1), id(99)]);
  assert.deepEqual(result.frame.artboards[1].layerIds, [id(2)]);
});

// ------------------------------------------------------------ inert layers

test('known-transparent assets: all-empty tiled assets yes, painted tiles and large PNGs no', async () => {
  assert.equal(await assetIsKnownTransparent(emptyTiled), true);
  assert.equal(await assetIsKnownTransparent(paintedTiled('a'.repeat(32))), false);
  assert.equal(await assetIsKnownTransparent({ w: 4096, h: 4096, url: 'data:image/png;base64,' }), false);
  assert.equal(await assetIsKnownTransparent(undefined), false);
});

test('only undecorated transparent plain rasters, hidden or 0% layers are inert', () => {
  const transparent = new Set(['asset-1']);
  assert.equal(layerCompositeInert(raster(1), transparent), true);
  assert.equal(layerCompositeInert(raster(2), transparent), false, 'unknown pixels');
  assert.equal(layerCompositeInert(raster(2, { visible: false }), transparent), true);
  assert.equal(layerCompositeInert(raster(2, { opacity: 0 }), transparent), true);
  // Anything able to paint outside the layer's own pixels keeps it live.
  assert.equal(layerCompositeInert(raster(1, { fillColor: '#ff0000' }), transparent), false);
  assert.equal(layerCompositeInert(raster(1, { smartFilters: [{}] }), transparent), false);
  assert.equal(layerCompositeInert(raster(1, { vectorMask: { enabled: true } }), transparent), false);
  assert.equal(layerCompositeInert(raster(1, { spotHealing: [{}] }), transparent), false);
  assert.equal(
    layerCompositeInert(raster(1, { adjustments: { ...structuredClone(neutral), brightness: 20 } }), transparent),
    false,
  );
  assert.equal(
    layerCompositeInert(raster(1, { styles: { outerGlow: { enabled: true, opacity: 1, size: 10, color: '#fff', spread: 0, blend: 'screen' } } }), transparent),
    false,
  );
  assert.equal(layerCompositeInert({ ...raster(1), kind: 'adjustment' }, transparent), false);
});

// ------------------------------------------------------ equivalence keys

const keyOf = (frame, inertIds = new Set()) =>
  compositeEquivalenceKey(
    frame,
    Object.fromEntries(frame.layers.map((layer) => [layer.asset, paintedTiled(layer.asset.padEnd(32, '0'))])),
    (layer) => inertIds.has(layer.id) || !layer.visible || layer.opacity === 0,
    (layer) => clippingGroupBase(frame, layer),
  );

test('adding or deleting an inert layer, renaming, locking and reselecting keep the key', () => {
  const frame = frameOf([raster(1), raster(2), raster(3)], { active: id(3) });
  const base = keyOf(frame);
  const inserted = insertLayerAboveActive({ ...frame, active: id(1) }, fresh()).frame;
  assert.equal(keyOf(inserted, new Set([id(99)])), base, 'insert empty layer');
  assert.notEqual(keyOf(inserted), base, 'the same layer with pixels changes the key');
  const renamed = { ...frame, layers: frame.layers.map((l, i) => (i === 1 ? { ...l, name: 'X', locked: true } : l)) };
  assert.equal(keyOf(renamed), base, 'rename and lock');
  assert.equal(keyOf({ ...frame, active: id(1), selectedLayerIds: [id(1), id(2)] }), base, 'reselect');
  const hiddenDeleted = { ...frame, layers: [frame.layers[0], { ...frame.layers[1], visible: false }, frame.layers[2]] };
  assert.equal(keyOf({ ...frame, layers: [frame.layers[0], frame.layers[2]] }), keyOf(hiddenDeleted), 'hidden == deleted');
});

test('pixel-affecting edits change the key', () => {
  const frame = frameOf([raster(1), raster(2), raster(3)]);
  const base = keyOf(frame);
  const edit = (patch) => ({ ...frame, layers: frame.layers.map((l, i) => (i === 1 ? { ...l, ...patch } : l)) });
  for (const patch of [{ opacity: 0.5 }, { blend: 'multiply' }, { matrix: [1, 0, 0, 1, 3, 0] }, { asset: 'asset-x' }])
    assert.notEqual(keyOf(edit(patch)), base, JSON.stringify(patch));
  assert.notEqual(keyOf({ ...frame, layers: [frame.layers[1], frame.layers[0], frame.layers[2]] }), base, 'reorder');
  assert.notEqual(keyOf({ ...frame, colorMode: 'grayscale' }), base, 'colour mode');
  assert.notEqual(keyOf({ ...frame, w: 256 }), base, 'size');
});

test('inserting an empty layer inside a clipping group keeps the key; real clipping changes do not', () => {
  const frame = frameOf([raster(1), raster(2, { clippingTo: id(1) }), raster(3, { clippingTo: id(2) })], { active: id(1) });
  const base = keyOf(frame);
  const inserted = insertLayerAboveActive(frame, fresh()).frame;
  assert.equal(keyOf(inserted, new Set([id(99)])), base, 're-pointed links, same clipping base');
  const unclipped = { ...frame, layers: frame.layers.map((l, i) => (i === 2 ? { ...l, clippingTo: undefined } : l)) };
  assert.notEqual(keyOf(unclipped), base, 'releasing a layer from the group');
});

test('folder keys ignore inert members, folder names and collapse state', () => {
  const group = { id: 'g', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false };
  const frame = frameOf([raster(1, { groupId: 'g' }), raster(2, { groupId: 'g' }), raster(3)], { groups: [group] });
  const base = keyOf(frame);
  const inserted = insertLayerAboveActive({ ...frame, active: id(1) }, fresh()).frame;
  assert.equal(inserted.layers[1].groupId, 'g');
  assert.equal(keyOf(inserted, new Set([id(99)])), base);
  assert.equal(keyOf({ ...frame, groups: [{ ...group, name: 'Renamed', collapsed: true, locked: true }] }), base);
  assert.notEqual(keyOf({ ...frame, groups: [{ ...group, opacity: 0.5 }] }), base);
});

test('frameCompositeKey treats a new empty tiled paint layer as inert', async () => {
  const frame = frameOf([raster(1), raster(2)], { active: id(1) });
  const assets = { 'asset-1': paintedTiled('1'.repeat(32)), 'asset-2': paintedTiled('2'.repeat(32)) };
  const base = await frameCompositeKey(frame, assets);
  const inserted = insertLayerAboveActive(frame, fresh()).frame;
  assert.equal(await frameCompositeKey(inserted, { ...assets, 'asset-new': emptyTiled }), base);
  assert.notEqual(
    await frameCompositeKey(inserted, { ...assets, 'asset-new': paintedTiled('9'.repeat(32)) }),
    base,
  );
});

// ------------------------------------------------- finished composite cache

test('CompositeCache keeps one finished composite matched by key and size', () => {
  const cache = new CompositeCache();
  assert.equal(cache.matchFinal(4, 4, 'k'), undefined);
  const surface = { name: 'final' };
  cache.storeFinal({ key: 'k', w: 4, h: 4, surface });
  assert.equal(cache.matchFinal(4, 4, 'k'), surface);
  assert.equal(cache.matchFinal(4, 4, 'other'), undefined);
  assert.equal(cache.matchFinal(8, 4, 'k'), undefined);
  assert.equal(cache.finalHits, 1);
  assert.equal(cache.reusableFinal(4, 4), surface);
  assert.equal(cache.reusableFinal(5, 4), undefined);
  cache.clear();
  assert.equal(cache.matchFinal(4, 4, 'k'), undefined);
});

async function withRecordingSurface(run) {
  const original = globalThis.OffscreenCanvas;
  const surfaces = [];
  class RecordingSurface {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.operations = [];
      const state = {};
      const stack = [];
      this.context = {
        save: () => stack.push({ ...state }),
        restore: () => {
          const prior = stack.pop();
          Object.keys(state).forEach((key) => delete state[key]);
          Object.assign(state, prior);
        },
        setTransform: (...matrix) => { state.matrix = matrix; },
        fillRect: () => this.operations.push({ kind: 'fill', ...state }),
        clearRect: () => this.operations.push({ kind: 'clear' }),
        drawImage: (source) => this.operations.push({ kind: 'draw', source, ...state }),
      };
      for (const name of ['globalAlpha', 'globalCompositeOperation', 'filter', 'fillStyle', 'strokeStyle', 'lineWidth'])
        Object.defineProperty(this.context, name, {
          get: () => state[name],
          set: (value) => { state[name] = value; },
        });
      surfaces.push(this);
    }
    getContext() { return this.context; }
  }
  globalThis.OffscreenCanvas = RecordingSurface;
  try {
    await run(surfaces);
  } finally {
    if (original === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = original;
  }
}

const rectangle = (n) => ({
  id: id(n),
  name: `R${n}`,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, n, n],
  adjustments: structuredClone(neutral),
  kind: 'rectangle',
  width: 2,
  height: 2,
  color: '#ff0000',
  stroke: 1,
  fill: true,
});

test('renderFrame reuses the finished composite after adding and deleting an empty layer', async () => {
  await withRecordingSurface(async (surfaces) => {
    const cache = new CompositeCache();
    const layers = Array.from({ length: 10 }, (_, index) => rectangle(index + 1));
    const frame = { w: 64, h: 64, layers, groups: [], active: id(5), selectedLayerIds: [id(5)] };
    const assets = { 'asset-new': emptyTiled };
    const progress = [];
    const render = async (value) => {
      progress.length = 0;
      const before = surfaces.length;
      const out = await renderFrame(value, assets, undefined, {
        compositeCache: cache,
        onProgress: (done, total) => progress.push([done, total]),
      });
      return { out, created: surfaces.slice(before) };
    };
    const first = await render(frame);
    assert.equal(first.out.operations.filter((op) => op.kind === 'fill').length, 10, 'cold render fills every layer');
    assert.equal(cache.finalHits, 0);

    const added = insertLayerAboveActive(frame, { ...raster(99, { asset: 'asset-new' }) }).frame;
    assert.equal(added.layers.length, 11);
    const second = await render(added);
    assert.equal(cache.finalHits, 1, 'empty layer add reuses the finished composite');
    assert.equal(second.out.operations.filter((op) => op.kind === 'fill').length, 0, 'no layer recomposited');
    assert.deepEqual(progress, [[11, 11]], 'progress completes at once');

    const deleted = { ...added, layers: added.layers.filter((layer) => layer.id !== id(99)), active: id(5) };
    await render(deleted);
    assert.equal(cache.finalHits, 2, 'deleting the empty layer reuses it too');

    const recoloured = { ...deleted, layers: deleted.layers.map((l, i) => (i === 7 ? { ...l, color: '#00ff00' } : l)) };
    const fourth = await render(recoloured);
    assert.equal(cache.finalHits, 2, 'a pixel change misses');
    assert.ok(fourth.out.operations.some((op) => op.kind === 'fill'), 'and recomposites');
  });
});

test('live overrides never use or replace the finished composite', async () => {
  await withRecordingSurface(async () => {
    const cache = new CompositeCache();
    const layers = Array.from({ length: 9 }, (_, index) => rectangle(index + 1));
    const frame = { w: 32, h: 32, layers, groups: [], active: id(9), selectedLayerIds: [id(9)] };
    await renderFrame(frame, {}, undefined, { compositeCache: cache });
    const live = new globalThis.OffscreenCanvas(32, 32);
    const out = await renderFrame(frame, {}, { [id(9)]: live }, { compositeCache: cache });
    assert.equal(cache.finalHits, 0);
    assert.ok(out.operations.length > 1);
    await renderFrame(frame, {}, undefined, { compositeCache: cache });
    assert.equal(cache.finalHits, 1, 'the committed render still matches the stored composite');
  });
});

// ----------------------------------------------------------------- duplicate

test('Duplicate puts each copy directly above its source and selects the copies', async () => {
  const { insertCopiesAboveSources } = await import('../src/layerInsertion.ts');
  const frame = frameOf([raster(1), raster(2), raster(3), raster(4)], { active: id(3), selectedLayerIds: [id(1), id(3)] });
  const copyOf = (n) => raster(50 + n, { name: `Paint ${n} copy` });
  const next = insertCopiesAboveSources(frame, [frame.layers[0], frame.layers[2]], [copyOf(1), copyOf(3)]);
  assert.deepEqual(ids(next), [id(1), id(51), id(2), id(3), id(53), id(4)]);
  assert.equal(next.active, id(53));
  assert.deepEqual(next.selectedLayerIds, [id(51), id(53)]);
});

test('a copy of a clipped layer or of a clipping base stays in the clipping group', async () => {
  const { insertCopiesAboveSources } = await import('../src/layerInsertion.ts');
  const frame = frameOf([raster(1), raster(2, { clippingTo: id(1) }), raster(3)], { active: id(2) });
  const clippedCopy = insertCopiesAboveSources(frame, [frame.layers[1]], [raster(60, { clippingTo: id(1) })]);
  assert.deepEqual(ids(clippedCopy), [id(1), id(2), id(60), id(3)]);
  assert.equal(clippingGroupBase(clippedCopy, clippedCopy.layers[2])?.id, id(1));
  assert.equal(clippedCopy.layers[3].clippingTo, undefined);

  const baseCopy = insertCopiesAboveSources(frame, [frame.layers[0]], [raster(61)]);
  assert.deepEqual(ids(baseCopy), [id(1), id(61), id(2), id(3)]);
  assert.equal(baseCopy.layers[1].clippingTo, id(1));
  assert.equal(baseCopy.layers[2].clippingTo, id(61), 'the group above stays linked');
  assert.equal(clippingGroupBase(baseCopy, baseCopy.layers[2])?.id, id(1));
});

test('a copy of a folder member stays in the folder next to its source', async () => {
  const { insertCopiesAboveSources } = await import('../src/layerInsertion.ts');
  const group = { id: 'g', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false };
  const frame = frameOf([raster(1, { groupId: 'g' }), raster(2, { groupId: 'g' }), raster(3)], { groups: [group], active: id(1) });
  const next = insertCopiesAboveSources(frame, [frame.layers[0]], [raster(70, { groupId: 'g' })]);
  assert.deepEqual(ids(next), [id(1), id(70), id(2), id(3)]);
  assert.equal(next.layers[1].groupId, 'g');
});

// ------------------------------------------------------ clipped layer cache

test('alphaBounds finds the visible rectangle, or nothing', async () => {
  const { alphaBounds } = await import('../src/compositeCache.ts');
  const w = 6, h = 5, pixels = new Uint8ClampedArray(w * h * 4);
  assert.equal(alphaBounds(pixels, w, h), undefined);
  const set = (x, y) => { pixels[(y * w + x) * 4 + 3] = 1; };
  set(2, 1);
  assert.deepEqual(alphaBounds(pixels, w, h), { x: 2, y: 1, w: 1, h: 1 });
  set(4, 3);
  set(1, 2);
  assert.deepEqual(alphaBounds(pixels, w, h), { x: 1, y: 1, w: 4, h: 3 });
  set(5, 4);
  set(0, 0);
  assert.deepEqual(alphaBounds(pixels, w, h), { x: 0, y: 0, w: 6, h: 5 });
});

test('clipped-layer keys follow source and base content, not position, names or the outer blend', async () => {
  const { clippedLayerCacheKey } = await import('../src/compositeCache.ts');
  const assets = { 'asset-1': paintedTiled('1'.repeat(32)), 'asset-2': paintedTiled('2'.repeat(32)) };
  const base = raster(1), source = raster(2, { clippingTo: id(1) });
  const frame = frameOf([base, source]);
  const key = clippedLayerCacheKey(frame, source, base, assets);
  assert.ok(key);
  // Reordering other layers, renaming, locking, outer opacity/blend and the
  // raw link (stored adjacent vs. resolved base) do not change the result.
  const moved = frameOf([raster(7), base, raster(8), source]);
  assert.equal(clippedLayerCacheKey(moved, source, base, assets), key);
  assert.equal(
    clippedLayerCacheKey(frame, { ...source, name: 'x', locked: true, opacity: 0.3, blend: 'multiply', clippingTo: 'other', groupId: 'g' }, { ...base, name: 'y' }, assets),
    key,
  );
  // Anything the clipped pixels depend on does.
  const changed = [
    clippedLayerCacheKey(frame, { ...source, matrix: [1, 0, 0, 1, 4, 0] }, base, assets),
    clippedLayerCacheKey(frame, source, { ...base, opacity: 0.5 }, assets),
    clippedLayerCacheKey(frame, source, { ...base, matrix: [1, 0, 0, 1, 0, 4] }, assets),
    clippedLayerCacheKey(frame, source, base, { ...assets, 'asset-2': paintedTiled('3'.repeat(32)) }),
    clippedLayerCacheKey(frame, source, base, { ...assets, 'asset-1': paintedTiled('4'.repeat(32)) }),
    clippedLayerCacheKey({ ...frame, colorMode: 'grayscale' }, source, base, assets),
    clippedLayerCacheKey({ ...frame, w: 256 }, source, base, assets),
  ];
  for (const other of changed) assert.notEqual(other, key);
  assert.equal(new Set(changed).size, changed.length);
  // Live overrides on either layer are never cached.
  assert.equal(clippedLayerCacheKey(frame, source, base, assets, { [id(2)]: {} }), undefined);
  assert.equal(clippedLayerCacheKey(frame, source, base, assets, { [id(1)]: {} }), undefined);
  assert.ok(clippedLayerCacheKey(frame, source, base, assets, { [id(9)]: {} }));
});

test('the clipped-layer cache is cleared with the layer cache and uses half its budget', async () => {
  const { clearLayerFilterCache, sharedClippedLayerCache, detectLayerFilterCacheBudget } = await import('../src/layerFilterCache.ts');
  const cache = sharedClippedLayerCache();
  assert.equal(cache.maxBytes, Math.floor(detectLayerFilterCacheBudget() / 2));
  cache.set('k', { surface: undefined, x: 0, y: 0 }, 64);
  assert.equal(cache.has('k'), true);
  clearLayerFilterCache();
  assert.equal(cache.has('k'), false);
});
