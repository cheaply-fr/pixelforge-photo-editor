import test from 'node:test';
import assert from 'node:assert/strict';
import { moveLayerIds, translateLayers } from '../src/moveLayers.ts';

const layer = (id, extra = {}) => ({ id, matrix: [1, 0, 0, 1, 0, 0], ...extra });

test('a drag moves the active layer, the other selected layers and every linked layer', () => {
  const layers = [layer('a'), layer('b', { layerLinkId: 'L' }), layer('c'), layer('d', { layerLinkId: 'L' }), layer('e')];
  assert.deepEqual(moveLayerIds({ layers, selectedLayerIds: ['a'] }, 'a'), ['a']);
  // Linked peers follow, in stack order.
  assert.deepEqual(moveLayerIds({ layers, selectedLayerIds: ['d'] }, 'd'), ['b', 'd']);
  // All selected layers move together, with the links of any of them.
  assert.deepEqual(moveLayerIds({ layers, selectedLayerIds: ['a', 'c', 'd'] }, 'c'), ['a', 'b', 'c', 'd']);
  // An active layer outside the selection (or an explicit empty selection) moves alone.
  assert.deepEqual(moveLayerIds({ layers, selectedLayerIds: ['a', 'c'] }, 'e'), ['e']);
  assert.deepEqual(moveLayerIds({ layers, selectedLayerIds: [] }, 'c'), ['c']);
  // A legacy frame without a selection list selects the active layer.
  assert.deepEqual(moveLayerIds({ layers }, 'b'), ['b', 'd']);
  // Unknown ids are ignored.
  assert.deepEqual(moveLayerIds({ layers, selectedLayerIds: ['zz', 'a'] }, 'a'), ['a']);
  assert.deepEqual(moveLayerIds({ layers }, 'zz'), []);
});

test('translation adds the same document offset to every moved layer and nothing else', () => {
  const layers = [layer('a', { matrix: [2, 0, 0, 2, 5, 6], opacity: 0.5 }), layer('b'), layer('c', { matrix: [0, 1, -1, 0, 1, 1] })];
  const moved = translateLayers(layers, ['a', 'c'], 10, -4);
  assert.deepEqual(moved.map((item) => item.matrix), [[2, 0, 0, 2, 15, 2], [1, 0, 0, 1, 0, 0], [0, 1, -1, 0, 11, -3]]);
  assert.equal(moved[0].opacity, 0.5);
  assert.equal(moved[1], layers[1]);
  assert.deepEqual(layers[0].matrix, [2, 0, 0, 2, 5, 6], 'input untouched');
});
