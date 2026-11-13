import test from 'node:test';
import assert from 'node:assert/strict';
import { composeSelectionAlpha, composedSelection } from '../src/selectionComposition.ts';
import { featherAlpha } from '../src/selectionFeather.ts';

test('selection masks compose add, subtract, intersect and replace deterministically', () => {
  const current = [200, 120, 40, 0];
  const incoming = [100, 200, 80, 255];
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'add').mask], [200, 200, 80, 255]);
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'subtract').mask], [122, 26, 27, 0]);
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'intersect').mask], [100, 120, 40, 0]);
  assert.deepEqual([...composeSelectionAlpha(current, incoming, 'replace').mask], incoming);
});

test('first selection gesture uses incoming alpha for every operation', () => {
  const incoming = [0, 96, 255];
  for (const operation of ['replace', 'add', 'subtract', 'intersect'])
    assert.deepEqual([...composeSelectionAlpha(undefined, incoming, operation).mask], incoming);
});

test('selection composition is detached and reports whether pixels changed', () => {
  const current = Uint8ClampedArray.from([10, 20]);
  const incoming = Uint8ClampedArray.from([0, 0]);
  const result = composeSelectionAlpha(current, incoming, 'subtract');
  assert.deepEqual([...result.mask], [10, 20]);
  assert.equal(result.changed, false);
  incoming[0] = 255;
  assert.deepEqual([...result.mask], [10, 20]);
});

test('selection composition validates operation, dimensions and alpha values', () => {
  assert.throws(() => composeSelectionAlpha([1], [1, 2], 'add'), /different sizes/);
  assert.throws(() => composeSelectionAlpha([1], [1], 'bad'), /operation is invalid/);
  assert.throws(() => composeSelectionAlpha([1], [Number.NaN], 'add'), /invalid alpha/);
  assert.throws(() => composeSelectionAlpha([Infinity], [1], 'add'), /invalid alpha/);
  assert.throws(() => composeSelectionAlpha({ length: 16_000_001 }, [1], 'add'), /pixel limit/);
});

// Composed (Add/Subtract/Intersect) selections: the page resolves both sides
// to alpha (feather, inversion, transform applied), composes them and stores
// the result as a mask. A pure model of that render → compose → store loop.
const W = 90, H = 40;
/** renderSelection on pure planes: a stored mask or a rectangle, then feather and inversion. */
const render = (selection, assets) => {
  let plane;
  if (selection.mask) plane = Uint8ClampedArray.from(assets[selection.mask]);
  else {
    plane = new Uint8ClampedArray(W * H);
    for (let y = selection.y; y < selection.y + selection.h; y += 1)
      for (let x = selection.x; x < selection.x + selection.w; x += 1) plane[y * W + x] = 255;
  }
  if (selection.feather > 0) plane = featherAlpha(plane, W, H, selection.feather);
  if (selection.inverted) plane = plane.map((value) => 255 - value);
  return plane;
};
/** One marquee gesture in Add mode, stored with `store` (the fixed helper or the old spread). */
const addGesture = (current, next, assets, store) => {
  const composed = composeSelectionAlpha(render(current, assets), render(next, assets), 'add').mask,
    id = `mask-${Object.keys(assets).length}`;
  assets[id] = composed;
  return { ...store(next), mask: id };
};
const rect = (x, feather) => ({ shape: 'rectangle', x, y: 10, w: 14, h: 20, feather, inverted: false });
/** The first rectangle's left edge across its middle row. */
const leftEdge = (plane) => Array.from(plane.subarray(20 * W, 20 * W + 20));
const repeatedAdds = (store) => {
  const assets = {}, first = rect(8, 3);
  let selection = first;
  const edges = [leftEdge(render(first, assets))];
  for (const x of [34, 56, 74]) {
    selection = addGesture(selection, rect(x, 3), assets, store);
    edges.push(leftEdge(render(selection, assets)));
  }
  return { edges, selection };
};

test('keeping `feather` on a composed mask re-feathers earlier parts on every Add (the bug)', () => {
  const { edges } = repeatedAdds((next) => ({ ...next, mask: undefined }));
  assert.notDeepEqual(edges[1], edges[0]);
  assert.notDeepEqual(edges[2], edges[1]);
});

test('repeated feathered Adds leave earlier parts\' edges unchanged', () => {
  const { edges, selection } = repeatedAdds(composedSelection);
  for (const edge of edges.slice(1)) assert.deepEqual(edge, edges[0]);
  assert.equal(selection.feather, 0);
  assert.equal(selection.inverted, false);
  assert.ok(selection.mask);
});

test('a composed selection drops resolved feather, inversion and transform but keeps its geometry', () => {
  const parts = [{ shape: 'rectangle', x: 5, y: 10, w: 14, h: 20, operation: 'replace' }];
  const next = { ...rect(5, 12), inverted: true, matrix: [1, 0, 0, 1, 3, 4], mask: 'old', parts };
  const stored = composedSelection(next);
  assert.deepEqual(stored, { ...rect(5, 0), mask: undefined, parts });
  assert.equal('matrix' in stored, false);
  assert.equal(next.feather, 12);
  assert.deepEqual(next.matrix, [1, 0, 0, 1, 3, 4]);
  // Stored masks that carry a feather (saved before this fix, or feathered
  // later with Select > Modify > Feather) still load and feather once per render.
  const assets = { legacy: render(rect(8, 0), {}) };
  assert.deepEqual(render({ ...rect(0, 3), mask: 'legacy' }, assets), render(rect(8, 3), {}));
});
