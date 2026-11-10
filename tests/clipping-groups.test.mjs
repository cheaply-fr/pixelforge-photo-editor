import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clippingBase,
  clippingGroupBase,
  preserveClippingAfterReorder,
  sanitizeClippingRelations,
} from '../src/layerClipping.ts';
import { applyLayerArrange } from '../src/layerArrange.ts';
import { compositeLayerKeys } from '../src/compositeCache.ts';

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const layer = (n, kind, patch = {}) => ({ id: id(n), name: `L${n}`, kind, groupId: undefined, ...patch });

// Stack (bottom to top): base A, B clipped to A, C clipped to B (stored adjacent links).
const chain = () => ({
  w: 4,
  h: 4,
  active: id(3),
  layers: [layer(1, 'raster'), layer(2, 'raster', { clippingTo: id(1) }), layer(3, 'raster', { clippingTo: id(2) })],
});

test('every consecutive clipped layer resolves to the clipping group base', () => {
  const frame = chain();
  const [a, b, c] = frame.layers;
  assert.equal(clippingBase(frame, c), b, 'the stored link stays the adjacent layer');
  assert.equal(clippingGroupBase(frame, c), a);
  assert.equal(clippingGroupBase(frame, b), a);
  assert.equal(clippingGroupBase(frame, a), undefined);
  // Documents with chains stay valid: nothing is rewritten on load.
  assert.equal(sanitizeClippingRelations(frame), frame);
});

test('a broken lower link ends the group at the layer still clipped', () => {
  const frame = chain();
  // A layer between A and B unclips B, so C's group base is B itself.
  const broken = { ...frame, layers: [frame.layers[0], layer(9, 'rectangle'), frame.layers[1], frame.layers[2]] };
  assert.equal(clippingBase(broken, broken.layers[2]), undefined);
  assert.equal(clippingGroupBase(broken, broken.layers[3]), broken.layers[2]);
});

test('composite cache keys of a clipped layer depend on the whole chain down to the base', () => {
  const frame = chain();
  const before = compositeLayerKeys(frame, {});
  const changedBase = { ...frame, layers: [{ ...frame.layers[0], opacity: 0.5 }, ...frame.layers.slice(1)] };
  const after = compositeLayerKeys(changedBase, {});
  assert.notEqual(after[2], before[2], 'C must re-render when the group base A changes');
  assert.notEqual(after[1], before[1]);
});

test('Send Backward inside a clipping group keeps every layer clipped to the base', () => {
  const frame = chain();
  const arranged = applyLayerArrange(frame, 'backward'); // C moves below B
  assert.deepEqual(arranged.layers.map((item) => item.id), [id(1), id(3), id(2)]);
  const { frame: next, released } = preserveClippingAfterReorder(frame, arranged);
  assert.deepEqual(released, []);
  assert.equal(next.layers[1].clippingTo, id(1), 'C now clips directly to A');
  assert.equal(next.layers[2].clippingTo, id(3), 'B joins the group above C');
  assert.equal(clippingGroupBase(next, next.layers[2]).id, id(1));
  assert.equal(sanitizeClippingRelations(next), next, 'links are valid adjacent links');
  // Bring Forward restores the original stack and links.
  const back = preserveClippingAfterReorder(next, applyLayerArrange({ ...next, active: id(3) }, 'forward'));
  assert.deepEqual(back.released, []);
  assert.deepEqual(back.frame.layers.map((item) => [item.id, item.clippingTo]), [
    [id(1), undefined], [id(2), id(1)], [id(3), id(2)],
  ]);
});

test('a clipped layer moved below its base is released and reported', () => {
  const frame = { ...chain(), active: id(2), layers: [layer(0, 'raster'), ...chain().layers] };
  // B moves below A: B is released; C now sits directly on A and stays in its group.
  const once = preserveClippingAfterReorder(frame, applyLayerArrange(frame, 'backward'));
  assert.deepEqual(once.released.map((item) => item.id), [id(2)]);
  assert.deepEqual(once.frame.layers.map((item) => [item.id, item.clippingTo]), [
    [id(0), undefined], [id(2), undefined], [id(1), undefined], [id(3), id(1)],
  ]);
  // Without clipping, the arranged frame is returned unchanged.
  const plain = { w: 4, h: 4, active: id(2), layers: [layer(1, 'raster'), layer(2, 'raster')] };
  const moved = applyLayerArrange(plain, 'backward');
  const kept = preserveClippingAfterReorder(plain, moved);
  assert.equal(kept.frame, moved);
  assert.deepEqual(kept.released, []);
});

test('Bring Forward of the top clipped layer past an unrelated layer releases only it', () => {
  const base = chain();
  const frame = { ...base, layers: [...base.layers, layer(4, 'raster')] };
  const result = preserveClippingAfterReorder(frame, applyLayerArrange(frame, 'forward'));
  assert.deepEqual(result.released.map((item) => item.id), [id(3)]);
  assert.equal(result.frame.layers[1].clippingTo, id(1));
  assert.equal(result.frame.layers[3].clippingTo, undefined);
});
