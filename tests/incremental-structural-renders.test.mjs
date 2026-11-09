import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPOSITE_SNAPSHOT_DESKTOP,
  COMPOSITE_SNAPSHOT_LARGE_DESKTOP,
  COMPOSITE_SNAPSHOT_LOW_MEMORY,
  COMPOSITE_SNAPSHOT_MOBILE,
  CompositeCache,
  compositeCheckpoint,
  compositeCheckpointTargets,
  compositeSnapshotBudgetForDevice,
  compositeSnapshotCapacity,
  validCompositeReuse,
} from '../src/compositeCache.ts';
import { neutral, renderFrame } from '../src/document.ts';

// Delete, reorder and visibility edits on a large stack resume from a prefix
// snapshot below the change instead of recompositing every layer.

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const stack = (count, patch = () => ({})) =>
  Array.from({ length: count }, (_, n) => ({ id: id(n), ...patch(n) }));

// ------------------------------------------------------------- checkpoints

test('checkpoint targets: below the active layer, below the change, and anchors', () => {
  const layers = stack(12);
  const frame = { layers, active: id(9) };
  // One slot keeps the historical single snapshot below the active layer.
  assert.deepEqual(compositeCheckpointTargets(frame, { changedIndex: 4, slots: 1 }), [8]);
  assert.deepEqual(compositeCheckpointTargets(frame), [compositeCheckpoint(frame)]);
  // Two slots add the snapshot below the lowest changed layer.
  assert.deepEqual(compositeCheckpointTargets(frame, { changedIndex: 4, slots: 2 }), [3, 8]);
  // Spare slots become anchors, each bisecting the largest stretch without one.
  assert.deepEqual(compositeCheckpointTargets(frame, { changedIndex: 4, slots: 3 }), [3, 5, 8]);
  assert.deepEqual(compositeCheckpointTargets(frame, { changedIndex: 12, slots: 4 }), [1, 3, 5, 8]);
  // The change is the active layer: one checkpoint, and the spare slot is an anchor.
  assert.deepEqual(compositeCheckpointTargets(frame, { changedIndex: 9, slots: 2 }), [3, 8]);
  // Nothing lies below the bottom layer: both slots become anchors; the top is never a target.
  assert.deepEqual(compositeCheckpointTargets({ layers, active: id(0) }, { changedIndex: 0, slots: 2 }), [2, 5]);
  const many = compositeCheckpointTargets(frame, { slots: 8 });
  assert.equal(many.length, 8);
  for (const target of many) assert.ok(target >= 0 && target <= 10);
  // Never more targets than layers that can hold a snapshot.
  assert.deepEqual(compositeCheckpointTargets({ layers: stack(3), active: id(2) }, { slots: 8 }), [0, 1]);
});

test('checkpoint targets follow folders and live overrides', () => {
  const layers = stack(10, (n) => (n >= 3 && n <= 5 ? { groupId: 'g' } : {}));
  const frame = { layers, active: id(8) };
  // A change inside a folder snapshots below the folder's first member.
  assert.deepEqual(compositeCheckpointTargets(frame, { changedIndex: 5, slots: 2 }), [2, 7]);
  // A stroke preview keeps only the snapshot below the first override.
  assert.deepEqual(compositeCheckpointTargets(frame, { overrides: { [id(6)]: {} }, changedIndex: 1, slots: 4 }), [5]);
  assert.deepEqual(compositeCheckpointTargets(frame, { overrides: { [id(4)]: {} }, slots: 4 }), [2]);
  // An override for a layer that is not in the frame is ignored.
  assert.deepEqual(compositeCheckpointTargets(frame, { overrides: { other: {} }, slots: 1 }), [7]);
});

test('snapshot budgets: more on desktops, two on phones, one on low memory', () => {
  assert.equal(compositeSnapshotBudgetForDevice({ deviceMemory: 2 }), COMPOSITE_SNAPSHOT_LOW_MEMORY);
  assert.equal(compositeSnapshotBudgetForDevice({ mobile: true, deviceMemory: 8 }), COMPOSITE_SNAPSHOT_MOBILE);
  assert.equal(compositeSnapshotBudgetForDevice({ deviceMemory: 4 }), COMPOSITE_SNAPSHOT_MOBILE);
  assert.equal(compositeSnapshotBudgetForDevice({ deviceMemory: 8 }), COMPOSITE_SNAPSHOT_LARGE_DESKTOP);
  assert.equal(compositeSnapshotBudgetForDevice({}), COMPOSITE_SNAPSHOT_DESKTOP);
  // A 2646 x 4096 poster: 43 MB per snapshot.
  const poster = (budget) => compositeSnapshotCapacity(2646, 4096, budget);
  assert.equal(poster(COMPOSITE_SNAPSHOT_LOW_MEMORY), 1);
  assert.equal(poster(COMPOSITE_SNAPSHOT_MOBILE), 2);
  assert.equal(poster(COMPOSITE_SNAPSHOT_DESKTOP), 3);
  assert.equal(poster(COMPOSITE_SNAPSHOT_LARGE_DESKTOP), 4);
  // Small frames are capped by count; huge frames still keep one.
  assert.equal(compositeSnapshotCapacity(1500, 1500, COMPOSITE_SNAPSHOT_MOBILE), 2);
  assert.equal(compositeSnapshotCapacity(1500, 1500, COMPOSITE_SNAPSHOT_DESKTOP), 4);
  assert.equal(compositeSnapshotCapacity(16000, 16000, COMPOSITE_SNAPSHOT_LARGE_DESKTOP), 1);
  assert.equal(new CompositeCache().capacity(10, 10), 1, 'no budget: the historical single snapshot');
});

// ----------------------------------------------------------- the cache

const budget = (maxSnapshots) => ({ bytes: Number.MAX_SAFE_INTEGER, maxSnapshots });
const snap = (keys, index, surface) => ({ w: 4, h: 4, keys: keys.slice(0, index + 1), index, surface, groups: [] });

test('the highest snapshot whose layers are unchanged is used', () => {
  const cache = new CompositeCache(budget(3));
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  cache.store(snap(keys, 1, 'S1'), keys);
  cache.store(snap(keys, 3, 'S3'), keys);
  assert.deepEqual(cache.snapshotIndexes, [1, 3]);
  assert.equal(cache.match(4, 4, keys).surface, 'S3');
  // Layer 3 changed (e.g. deleted): the lower snapshot still serves.
  assert.equal(cache.match(4, 4, ['a', 'b', 'c', 'x', 'e']).surface, 'S1');
  // Layer 1 changed: nothing matches; a size change never matches.
  assert.equal(cache.match(4, 4, ['a', 'x', 'c', 'd']), undefined);
  assert.equal(cache.match(8, 4, keys), undefined);
  assert.equal(cache.hits, 2);
  assert.equal(cache.misses, 2);
  assert.deepEqual(cache.retained, { index: 3, w: 4, h: 4 });
});

test('a full cache replaces stale snapshots first, then the least recently used', () => {
  const cache = new CompositeCache(budget(2));
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  cache.store(snap(keys, 1, 'S1'), keys);
  cache.store(snap(keys, 3, 'S3'), keys);
  assert.equal(cache.reusable(4, 4, keys), 'S1', 'least recently used');
  cache.match(4, 4, ['a', 'b', 'x']);
  assert.equal(cache.reusable(4, 4, keys), 'S3', 'S1 was just used');
  // With keys where S3 is stale, S3 goes first even though more recent.
  const changed = ['a', 'b', 'c', 'x', 'e', 'f'];
  assert.equal(cache.reusable(4, 4, changed), 'S3');
  cache.store(snap(changed, 4, 'S3'), changed);
  assert.deepEqual(cache.snapshotIndexes, [1, 4]);
  // A snapshot at an index already held replaces it.
  cache.store(snap(changed, 4, 'N4'), changed);
  assert.deepEqual(cache.snapshotIndexes, [1, 4]);
  assert.equal(cache.match(4, 4, changed).surface, 'N4');
  // Another frame size is replaced first.
  cache.store({ ...snap(keys, 2, 'B2'), w: 9 }, keys);
  assert.deepEqual(cache.snapshotIndexes.length, 2);
  assert.equal(cache.reusable(4, 4, keys), undefined, 'the other-size surface cannot be reused');
  cache.clear();
  assert.equal(cache.match(4, 4, keys), undefined);
  assert.equal(cache.retained, undefined);
});

test('among usable snapshots the most crowded one goes, keeping a low snapshot', () => {
  const cache = new CompositeCache(budget(3));
  const keys = Array.from({ length: 16 }, (_, n) => `k${n}`);
  cache.store(snap(keys, 2, 'S2'), keys);
  cache.store(snap(keys, 8, 'S8'), keys);
  cache.store(snap(keys, 9, 'S9'), keys);
  // Storing a snapshot at 13: 8 and 9 are one layer apart, and 8 is older.
  assert.equal(cache.reusable(4, 4, keys, 13), 'S8');
  cache.store(snap(keys, 13, 'S13'), keys);
  assert.deepEqual(cache.snapshotIndexes, [2, 9, 13]);
  // The low snapshot survives although it is the least recently used.
  cache.store(snap(keys, 12, 'S12'), keys);
  assert.deepEqual(cache.snapshotIndexes, [2, 9, 12]);
  // A snapshot at an index already held reuses that entry's surface.
  assert.equal(cache.reusable(4, 4, keys, 9), 'S9');
});

test('noteKeys reports the lowest layer that changed since the previous render', () => {
  const cache = new CompositeCache(budget(2));
  assert.equal(cache.noteKeys(4, 4, ['a', 'b', 'c']), 0, 'first render');
  assert.equal(cache.noteKeys(4, 4, ['a', 'b', 'c']), 3, 'nothing changed');
  assert.equal(cache.noteKeys(4, 4, ['a', 'c']), 1, 'layer 1 deleted');
  assert.equal(cache.noteKeys(4, 4, ['a', 'b', 'c']), 1, 'undo');
  assert.equal(cache.noteKeys(8, 4, ['a', 'b', 'c']), 0, 'canvas size changed');
  cache.clear();
  assert.equal(cache.noteKeys(8, 4, ['a']), 0);
});

test('composite reuse diagnostics accept the reused layer count', () => {
  assert.ok(validCompositeReuse({ final: false, clippedHits: 2, reusedLayers: 17 }));
  assert.ok(validCompositeReuse({ final: true }));
  assert.ok(!validCompositeReuse({ final: false, reusedLayers: -1 }));
  assert.ok(!validCompositeReuse({ final: false, reusedLayers: 1.5 }));
});

// --------------------------------------------------- renderFrame resumes

// Fills on every surface, in drawing order (layers above the edited one draw
// into the cached "above" surface while it is rebuilt).
let recordedFills = [];

async function withRecordingSurface(run) {
  const original = globalThis.OffscreenCanvas;
  class RecordingSurface {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.operations = [];
      const state = {};
      const saved = [];
      this.context = {
        save: () => saved.push({ ...state }),
        restore: () => {
          const prior = saved.pop();
          Object.keys(state).forEach((key) => delete state[key]);
          Object.assign(state, prior);
        },
        setTransform: (...matrix) => { state.matrix = matrix; },
        fillRect: () => {
          this.operations.push({ kind: 'fill', color: state.fillStyle });
          recordedFills.push(state.fillStyle);
        },
        clearRect: () => this.operations.push({ kind: 'clear' }),
        drawImage: (source) => this.operations.push({ kind: 'draw', source }),
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
    await run();
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
  color: `#0000${String(n).padStart(2, '0')}`,
  stroke: 1,
  fill: true,
});

/** Render and report which layers were composited (by colour) and how many came from a snapshot. */
async function renderWith(cache, frame) {
  recordedFills = [];
  await renderFrame(frame, {}, undefined, { compositeCache: cache });
  return {
    drawn: recordedFills.map((color) => Number.parseInt(color.slice(5), 10)),
    above: cache.lastSuffixLayers,
    reused: cache.lastReusedLayers,
    final: cache.finalHits,
  };
}

test('delete after selecting, its undo, reorder and hide resume below the change', async () => {
  await withRecordingSurface(async () => {
    const layers = Array.from({ length: 16 }, (_, n) => rectangle(n));
    const top = { w: 64, h: 64, layers, groups: [], active: id(15), selectedLayerIds: [id(15)] };
    // Five surfaces: four prefix snapshots plus the cached layers above an
    // edited one (which takes a slot while it is kept).
    const cache = new CompositeCache(budget(5));
    const cold = await renderWith(cache, top);
    assert.equal(cold.drawn.length, 16, 'cold render composites every layer');
    assert.equal(cold.reused, 0);
    // Snapshots: below the active layer and anchors spread below it.
    assert.deepEqual(cache.snapshotIndexes, [2, 4, 6, 10, 14]);

    // Selecting layer 9 changes no pixel: the finished composite is reused.
    const selected = { ...top, active: id(9), selectedLayerIds: [id(9)] };
    assert.equal((await renderWith(cache, selected)).final, 1);

    // Delete it: the active layer moves to the top, and the render resumes
    // from the anchor below layer 9 instead of from layer 0.
    const deleted = { ...selected, layers: layers.filter((layer) => layer.id !== id(9)), active: id(15) };
    const afterDelete = await renderWith(cache, deleted);
    assert.equal(afterDelete.reused, 7);
    assert.deepEqual(afterDelete.drawn, [7, 8, 10, 11, 12, 13, 14, 15]);
    assert.ok(cache.snapshotIndexes.includes(8), 'a snapshot below the change is kept for the undo');

    // Undo restores layer 9: resumes right below it.
    const undone = await renderWith(cache, selected);
    assert.equal(undone.final, 1, 'the original finished composite is not retained');
    assert.equal(undone.reused, 9);
    assert.deepEqual(undone.drawn, [9, 10, 11, 12, 13, 14, 15]);
    const opacity = { ...selected, layers: layers.map((layer) => (layer.id === id(9) ? { ...layer, opacity: 0.5 } : layer)) };
    const edited = await renderWith(cache, opacity);
    // Editing it again: layers 10-15 come from the cached composite above it.
    assert.equal(edited.reused, 9);
    assert.equal(edited.above, 6);
    assert.deepEqual(edited.drawn, [9]);

    // Send layer 9 backward (below 8): the change starts at index 8, so the
    // render resumes from the next snapshot below it.
    const reordered = { ...opacity, layers: [...opacity.layers.slice(0, 8), opacity.layers[9], opacity.layers[8], ...opacity.layers.slice(10)] };
    const moved = await renderWith(cache, reordered);
    assert.equal(moved.reused, 7);
    assert.deepEqual(moved.drawn, [7, 9, 8, 10, 11, 12, 13, 14, 15]);

    // Hide layer 12: resumes right below it.
    const hidden = { ...reordered, layers: reordered.layers.map((layer) => (layer.id === id(12) ? { ...layer, visible: false } : layer)) };
    const hide = await renderWith(cache, hidden);
    // While the edited layer's "above" composite is used, no snapshot is
    // refreshed above it, so the edit above resumes below the active layer
    // (index 8), still well above layer 0, and renders the range normally.
    assert.equal(hide.reused, 8);
    assert.equal(hide.above, 0);
    assert.deepEqual(hide.drawn, [9, 8, 10, 11, 13, 14, 15]);
    assert.ok(cache.snapshotIndexes.length <= 5, 'the snapshot count stays bounded');
  });
});

test('with a single snapshot the same delete recomposites the whole stack', async () => {
  await withRecordingSurface(async () => {
    const layers = Array.from({ length: 16 }, (_, n) => rectangle(n));
    const top = { w: 64, h: 64, layers, groups: [], active: id(15), selectedLayerIds: [id(15)] };
    const cache = new CompositeCache();
    await renderWith(cache, top);
    assert.deepEqual(cache.snapshotIndexes, [14]);
    const deleted = { ...top, layers: layers.filter((layer) => layer.id !== id(9)) };
    const result = await renderWith(cache, deleted);
    assert.equal(result.reused, 0);
    assert.equal(result.drawn.length, 15);
  });
});

test('incremental renders draw the same layers in the same order as a cold render', async () => {
  await withRecordingSurface(async () => {
    const layers = Array.from({ length: 12 }, (_, n) => rectangle(n));
    const frame = { w: 64, h: 64, layers, groups: [], active: id(11), selectedLayerIds: [id(11)] };
    const warm = new CompositeCache(budget(4));
    await renderWith(warm, frame);
    const edits = [
      { ...frame, layers: layers.filter((layer) => layer.id !== id(5)) },
      { ...frame, layers: layers.map((layer) => (layer.id === id(7) ? { ...layer, visible: false } : layer)) },
      { ...frame, layers: [...layers.slice(0, 3), layers[4], layers[3], ...layers.slice(5)] },
      frame,
    ];
    for (const edit of edits) {
      const incremental = await renderWith(warm, edit);
      const cold = await renderWith(new CompositeCache(budget(4)), edit);
      // Layers below the snapshot come from it; the rest match the cold order.
      assert.deepEqual(incremental.drawn, cold.drawn.slice(cold.drawn.length - incremental.drawn.length));
      assert.ok(incremental.reused > 0 || incremental.final > 0, 'something was reused');
    }
  });
});
