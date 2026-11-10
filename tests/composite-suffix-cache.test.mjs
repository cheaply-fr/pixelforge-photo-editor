import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSITE_SUFFIX_MIN_PIXELS,
  CompositeCache,
  compositeSuffixStart,
  validCompositeReuse,
} from '../src/compositeCache.ts';
import { layerIgnoresBackdrop, neutral, renderFrame } from '../src/document.ts';

// While a low layer is painted, the layers above it are drawn from one cached
// composite ("suffix"). These tests pin where that range starts and when the
// cache slot may be reused.

const layer = (n, extra = {}) => ({ id: `l${n}`, ...extra });
const stack = (count, extra = {}) => Array.from({ length: count }, (_, n) => layer(n, extra[n] ?? {}));
const always = () => true;

test('the cached range starts just above the active layer', () => {
  const frame = { layers: stack(10), active: 'l2' };
  assert.equal(compositeSuffixStart(frame, { independent: always }), 3);
  assert.equal(compositeSuffixStart({ ...frame, active: 'l0' }, { independent: always }), 1);
});

test('a live override is the edited layer even when another layer is active', () => {
  const frame = { layers: stack(10), active: 'l7' };
  assert.equal(compositeSuffixStart(frame, { independent: always, overrides: { l1: {} } }), 2);
});

test('too few layers above the edited one keep no cached range', () => {
  const frame = { layers: stack(10), active: 'l8' };
  assert.equal(compositeSuffixStart(frame, { independent: always }), -1, 'one layer above');
  assert.equal(compositeSuffixStart({ ...frame, active: 'l9' }, { independent: always }), -1, 'top layer');
  assert.equal(compositeSuffixStart(frame, { independent: always, minLayers: 1 }), 9);
  assert.equal(compositeSuffixStart({ ...frame, active: 'missing' }, { independent: always }), -1);
});

test('a layer that reads the backdrop moves the start above it', () => {
  const frame = { layers: stack(12), active: 'l1' };
  // l5 is e.g. Multiply or an adjustment layer: l2..l5 render every time.
  const independent = (index) => index !== 5;
  assert.equal(compositeSuffixStart(frame, { independent }), 6);
  // Blocking near the top leaves too little to cache.
  assert.equal(compositeSuffixStart(frame, { independent: (index) => index !== 10 }), -1);
});

test('a clipped layer needs its base inside the cached range', () => {
  // l4 is clipped to l3; editing l3 (the base) must re-render l4.
  const layers = stack(10, { 4: { clippingTo: 'l3' } });
  assert.equal(compositeSuffixStart({ layers, active: 'l3' }, { independent: always }), 5);
  // Editing l1: base l3 and clipped l4 are both above, so both are cached.
  assert.equal(compositeSuffixStart({ layers, active: 'l1' }, { independent: always }), 2);
  // A chain: l5 clipped to l4 clipped to l3. Editing l3 pushes past both.
  const chain = stack(10, { 4: { clippingTo: 'l3' }, 5: { clippingTo: 'l3' } });
  assert.equal(compositeSuffixStart({ layers: chain, active: 'l3' }, { independent: always }), 6);
});

test('folders are whole units and must themselves use source-over', () => {
  const layers = stack(12, { 3: { groupId: 'g' }, 4: { groupId: 'g' }, 5: { groupId: 'g' } });
  const groups = [{ id: 'g', blend: 'source-over' }];
  // Editing a member: the folder is the edited unit, the range starts above it.
  assert.equal(compositeSuffixStart({ layers, groups, active: 'l4' }, { independent: always }), 6);
  // Editing below the folder: a Normal folder is cached with the rest.
  assert.equal(compositeSuffixStart({ layers, groups, active: 'l1' }, { independent: always }), 2);
  // A Multiply folder reads the backdrop: start above it.
  const multiply = [{ id: 'g', blend: 'multiply' }];
  assert.equal(compositeSuffixStart({ layers, groups: multiply, active: 'l1' }, { independent: always }), 6);
  // Members' own modes do not matter: the folder is rendered in isolation.
  assert.equal(
    compositeSuffixStart({ layers, groups, active: 'l1' }, { independent: (index) => index !== 4 }),
    2,
  );
});

test('the range never splits a folder that starts below it', () => {
  // Folder members l2 and l6 are not adjacent; editing l4 (between them).
  const layers = stack(12, { 2: { groupId: 'g' }, 6: { groupId: 'g' } });
  const groups = [{ id: 'g', blend: 'source-over' }];
  assert.equal(compositeSuffixStart({ layers, groups, active: 'l4' }, { independent: always }), 7);
});

test('layers that draw nothing or use Normal without backdrop styles qualify', () => {
  const base = { kind: 'raster', visible: true, opacity: 1, blend: 'source-over', adjustments: structuredClone(neutral) };
  assert.equal(layerIgnoresBackdrop(base), true);
  assert.equal(layerIgnoresBackdrop({ ...base, opacity: 0.4 }), true, 'opacity is fine');
  assert.equal(layerIgnoresBackdrop({ ...base, blend: 'multiply' }), false);
  assert.equal(layerIgnoresBackdrop({ ...base, blend: 'multiply', visible: false }), true, 'hidden');
  assert.equal(layerIgnoresBackdrop({ ...base, blend: 'multiply', opacity: 0 }), true, '0%');
  assert.equal(layerIgnoresBackdrop({ ...base, kind: 'adjustment' }), false);
  const shadow = (blend) => ({
    dropShadow: { enabled: true, opacity: 0.5, blend, color: '#000000', angle: 120, distance: 4, size: 4 },
  });
  assert.equal(layerIgnoresBackdrop({ ...base, styles: shadow('multiply') }), false, 'Multiply shadow');
  assert.equal(layerIgnoresBackdrop({ ...base, styles: shadow('source-over') }), true, 'Normal shadow');
});

const FRAME = { w: 2000, h: 2000 };
const BYTES = FRAME.w * FRAME.h * 4;

test('the cache keeps an above composite only when the budget holds two surfaces', () => {
  assert.equal(new CompositeCache().suffixAllowed(FRAME.w, FRAME.h), false, 'no budget');
  assert.equal(
    new CompositeCache({ bytes: BYTES, maxSnapshots: 4 }).suffixAllowed(FRAME.w, FRAME.h),
    false,
    'one surface',
  );
  assert.equal(new CompositeCache({ bytes: 2 * BYTES, maxSnapshots: 4 }).suffixAllowed(FRAME.w, FRAME.h), true);
  // Small canvases always render sequentially (bit-identical results).
  assert.ok(FRAME.w * FRAME.h >= COMPOSITE_SUFFIX_MIN_PIXELS);
  assert.equal(
    new CompositeCache({ bytes: Number.MAX_SAFE_INTEGER, maxSnapshots: 4 }).suffixAllowed(1999, 2000),
    false,
    'under the size floor',
  );
  assert.equal(
    new CompositeCache({ bytes: 8 * BYTES, maxSnapshots: 1 }).suffixAllowed(FRAME.w, FRAME.h),
    false,
    'count cap of one',
  );
});

test('an above composite matches only the exact layer keys it holds', () => {
  const cache = new CompositeCache({ bytes: 4 * BYTES, maxSnapshots: 4 });
  const keys = ['a', 'b', 'c', 'd', 'e'];
  cache.storeSuffix({ ...FRAME, start: 2, keys: keys.slice(2), surface: 'S' });
  assert.deepEqual(cache.retainedSuffix, { start: 2, layers: 3, ...FRAME });
  assert.equal(cache.matchSuffix(FRAME.w, FRAME.h, 2, keys), 'S');
  // The edited layer below the range changes freely.
  assert.equal(cache.matchSuffix(FRAME.w, FRAME.h, 2, ['a', 'B*', 'c', 'd', 'e']), 'S');
  assert.equal(cache.matchSuffix(FRAME.w, FRAME.h, 2, ['a', 'b', 'c', 'D*', 'e']), undefined, 'layer changed');
  assert.equal(cache.matchSuffix(FRAME.w, FRAME.h, 3, keys), undefined, 'other start');
  assert.equal(cache.matchSuffix(FRAME.w, FRAME.h, 2, [...keys, 'f']), undefined, 'layer added');
  assert.equal(cache.matchSuffix(2000, 2001, 2, keys), undefined, 'other size');
  assert.equal(cache.suffixHits, 2);
  assert.equal(cache.suffixMisses, 4);
});

test('taking the surface to redraw drops the entry, so a cancelled render cannot reuse it', () => {
  const cache = new CompositeCache({ bytes: 4 * BYTES, maxSnapshots: 4 });
  const keys = ['a', 'b', 'c', 'd'];
  cache.storeSuffix({ ...FRAME, start: 1, keys: keys.slice(1), surface: 'S' });
  assert.equal(cache.takeSuffixSurface(2000, 2001), undefined, 'other size: no reuse');
  assert.equal(cache.retainedSuffix, undefined, 'entry dropped anyway');
  cache.storeSuffix({ ...FRAME, start: 1, keys: keys.slice(1), surface: 'S' });
  assert.equal(cache.takeSuffixSurface(FRAME.w, FRAME.h), 'S');
  assert.equal(cache.matchSuffix(FRAME.w, FRAME.h, 1, keys), undefined);
  cache.storeSuffix({ ...FRAME, start: 1, keys: keys.slice(1), surface: 'S' });
  cache.clear();
  assert.equal(cache.retainedSuffix, undefined);
});

test('the above composite takes one surface of the prefix snapshot budget', () => {
  const cache = new CompositeCache({ bytes: 3 * BYTES, maxSnapshots: 4 });
  const keys = Array.from({ length: 10 }, (_, index) => `k${index}`);
  assert.equal(cache.capacity(FRAME.w, FRAME.h), 3);
  for (const index of [1, 4, 7])
    cache.store({ ...FRAME, keys: keys.slice(0, index + 1), index, surface: `P${index}`, groups: [] }, keys);
  assert.deepEqual(cache.snapshotIndexes, [1, 4, 7]);
  cache.storeSuffix({ ...FRAME, start: 3, keys: keys.slice(3), surface: 'S' });
  assert.equal(cache.capacity(FRAME.w, FRAME.h), 2);
  assert.equal(cache.snapshotIndexes.length, 2, 'one prefix snapshot evicted');
  cache.takeSuffixSurface(FRAME.w, FRAME.h);
  assert.equal(cache.capacity(FRAME.w, FRAME.h), 3, 'budget returns once dropped');
});

test('render reuse telemetry accepts the above-composite layer count', () => {
  assert.equal(validCompositeReuse({ final: false, reusedLayers: 2, suffixLayers: 60 }), true);
  assert.equal(validCompositeReuse({ final: false, suffixLayers: -1 }), false);
  assert.equal(validCompositeReuse({ final: false, suffixLayers: 1.5 }), false);
});

// ------------------------------------------------ renderFrame integration

const uuid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

/** Record fills (one per rectangle layer, by colour) on every surface, in order. */
async function recording(run) {
  const original = globalThis.OffscreenCanvas;
  const log = { fills: [], composites: [] };
  class RecordingSurface {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      const state = {};
      const saved = [];
      this.context = {
        canvas: this,
        save: () => saved.push({ ...state }),
        restore: () => {
          const prior = saved.pop();
          Object.keys(state).forEach((key) => delete state[key]);
          Object.assign(state, prior);
        },
        setTransform: () => {},
        fillRect: () => log.fills.push(Number.parseInt(state.fillStyle.slice(5), 10)),
        clearRect: () => {},
        drawImage: (source) => log.composites.push({ into: this, source }),
      };
      for (const name of ['globalAlpha', 'globalCompositeOperation', 'filter', 'fillStyle', 'strokeStyle', 'lineWidth'])
        Object.defineProperty(this.context, name, {
          get: () => state[name],
          set: (value) => { state[name] = value; },
        });
    }
    getContext() { return this.context; }
  }
  globalThis.OffscreenCanvas = RecordingSurface;
  try {
    await run(log);
  } finally {
    if (original === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = original;
  }
}

const rectangle = (n, extra = {}) => ({
  id: uuid(n),
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
  color: `#0000${String(n).padStart(2, '0')}`,
  stroke: 1,
  fill: true,
  ...extra,
});

async function render(log, cache, frame) {
  log.fills.length = 0;
  await renderFrame(frame, {}, undefined, { compositeCache: cache });
  return { drawn: [...log.fills], above: cache.lastSuffixLayers, below: cache.lastReusedLayers };
}

test('repeated edits to a low layer render only that layer on a large canvas', async () => {
  await recording(async (log) => {
    const layers = Array.from({ length: 12 }, (_, n) => rectangle(n));
    const frame = { w: 2000, h: 2000, layers, groups: [], active: uuid(2), selectedLayerIds: [uuid(2)] };
    const cache = new CompositeCache({ bytes: Number.MAX_SAFE_INTEGER, maxSnapshots: 4 });
    const cold = await render(log, cache, frame);
    assert.deepEqual(cold.drawn, layers.map((_, n) => n), 'cold: every layer, in order');
    assert.deepEqual(cache.retainedSuffix, { start: 3, layers: 9, w: 2000, h: 2000 });
    const edit = (opacity) => ({ ...frame, layers: layers.map((layer, n) => (n === 2 ? { ...layer, opacity } : layer)) });
    for (const opacity of [0.5, 0.25]) {
      const result = await render(log, cache, edit(opacity));
      assert.deepEqual(result.drawn, [2], `opacity ${opacity}: only the edited layer`);
      assert.equal(result.below, 2);
      assert.equal(result.above, 9);
    }
    // A live stroke preview of layer 2 reuses it too.
    const preview = await (async () => {
      log.fills.length = 0;
      const override = new globalThis.OffscreenCanvas(2, 2);
      await renderFrame(edit(0.25), {}, { [uuid(2)]: override }, { compositeCache: cache });
      return cache.lastSuffixLayers;
    })();
    assert.equal(preview, 9);
    // Editing a layer inside the range renders the stack normally.
    const inside = await render(log, cache, { ...edit(0.25), layers: edit(0.25).layers.map((layer, n) => (n === 7 ? { ...layer, opacity: 0.3 } : layer)) });
    assert.equal(inside.above, 0);
    assert.ok(inside.drawn.includes(7) && inside.drawn.includes(11));
  });
});

test('a layer that reads the backdrop stays outside the cached range', async () => {
  await recording(async (log) => {
    const layers = Array.from({ length: 12 }, (_, n) => rectangle(n, n === 6 ? { blend: 'multiply' } : {}));
    const frame = { w: 2000, h: 2000, layers, groups: [], active: uuid(2), selectedLayerIds: [uuid(2)] };
    const cache = new CompositeCache({ bytes: Number.MAX_SAFE_INTEGER, maxSnapshots: 4 });
    await render(log, cache, frame);
    const edited = await render(log, cache, { ...frame, layers: layers.map((layer, n) => (n === 2 ? { ...layer, opacity: 0.5 } : layer)) });
    assert.equal(edited.above, 5, 'layers 7..11');
    // Layers 2..6 are drawn every time, Multiply included, in stack order.
    assert.deepEqual(edited.drawn.filter((n) => n !== 6), [2, 3, 4, 5]);
    assert.ok(edited.drawn.length >= 5);
  });
});

test('small canvases never use the cached range (bit-identical sequential renders)', async () => {
  await recording(async (log) => {
    const layers = Array.from({ length: 12 }, (_, n) => rectangle(n));
    const frame = { w: 64, h: 64, layers, groups: [], active: uuid(2), selectedLayerIds: [uuid(2)] };
    const cache = new CompositeCache({ bytes: Number.MAX_SAFE_INTEGER, maxSnapshots: 4 });
    await render(log, cache, frame);
    const edited = await render(log, cache, { ...frame, layers: layers.map((layer, n) => (n === 2 ? { ...layer, opacity: 0.5 } : layer)) });
    assert.equal(edited.above, 0);
    assert.deepEqual(edited.drawn, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(cache.retainedSuffix, undefined);
  });
});
