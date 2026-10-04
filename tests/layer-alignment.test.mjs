import test from 'node:test';
import assert from 'node:assert/strict';
import { alignmentDelta, distributionDeltas, translateMatrix, validLayerBounds } from '../src/layerAlignment.ts';

const box = (id, x, y, width = 20, height = 10) => ({ id, x, y, width, height });

test('canvas alignment computes all six exact translations', () => {
  const bounds = box('layer', 12, 8, 40, 20);
  assert.deepEqual(alignmentDelta(bounds, 200, 100, 'left'), { x: -12, y: 0 });
  assert.deepEqual(alignmentDelta(bounds, 200, 100, 'center-horizontal'), { x: 68, y: 0 });
  assert.deepEqual(alignmentDelta(bounds, 200, 100, 'right'), { x: 148, y: 0 });
  assert.deepEqual(alignmentDelta(bounds, 200, 100, 'top'), { x: 0, y: -8 });
  assert.deepEqual(alignmentDelta(bounds, 200, 100, 'center-vertical'), { x: 0, y: 32 });
  assert.deepEqual(alignmentDelta(bounds, 200, 100, 'bottom'), { x: 0, y: 72 });
});

test('alignment handles off-canvas, fractional, oversized and zero-size bounds', () => {
  assert.deepEqual(alignmentDelta(box('large', -30, -10, 300, 150), 200, 100, 'center-horizontal'), { x: -20, y: 0 });
  assert.deepEqual(alignmentDelta(box('point', 0.25, -0.5, 0, 0), 3, 3, 'center-vertical'), { x: 0, y: 2 });
  assert.deepEqual(alignmentDelta(box('fraction', 4.25, 0, 10.5, 1), 21, 1, 'right'), { x: 6.25, y: 0 });
});

test('alignment rejects malformed geometry and unknown modes', () => {
  for (const invalid of [null, {}, box('', 0, 0), box('x', NaN, 0), box('x', 0, Infinity), box('x', 0, 0, -1), box('x', '0', 0)])
    assert.equal(validLayerBounds(invalid), false);
  assert.throws(() => alignmentDelta(box('x', 0, 0), 0, 100, 'left'), /invalid/);
  assert.throws(() => alignmentDelta(box('x', 0, 0), 100, 100, 'unknown'), /mode/);
});

test('horizontal distribution keeps outer centers fixed and spaces the middle', () => {
  const items = [box('last', 180, 30, 40), box('first', 0, 10, 20), box('middle', 40, 20, 30)];
  assert.deepEqual(distributionDeltas(items, 'horizontal'), {
    first: { x: 0, y: 0 }, middle: { x: 50, y: 0 }, last: { x: 0, y: 0 },
  });
  assert.equal(items[0].x, 180);
});

test('vertical distribution is deterministic with negative coordinates and different sizes', () => {
  const result = distributionDeltas([box('a', 5, -20, 1, 20), box('b', 7, 20, 1, 40), box('c', 9, 90, 1, 20), box('d', 11, 170, 1, 40)], 'vertical');
  assert.deepEqual(result.a, { x: 0, y: 0 });
  assert.deepEqual(result.d, { x: 0, y: 0 });
  assert.ok(Math.abs(result.b.y - 16.66666666666667) < 0.00000001);
  assert.ok(Math.abs(result.c.y - 23.33333333333334) < 0.00000001);
});

test('one, two and coincident distribution items are no-ops with stable tie order', () => {
  assert.deepEqual(distributionDeltas([], 'horizontal'), {});
  assert.deepEqual(distributionDeltas([box('a', 1, 2)], 'vertical'), { a: { x: 0, y: 0 } });
  assert.deepEqual(distributionDeltas([box('b', 1, 2), box('a', 1, 2)], 'horizontal'), { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } });
  assert.deepEqual(distributionDeltas([box('c', 1, 2), box('a', 1, 2), box('b', 1, 2)], 'horizontal'), { a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, c: { x: 0, y: 0 } });
});

test('distribution rejects duplicate ids, negative sizes and invalid axis', () => {
  assert.throws(() => distributionDeltas([box('a', 0, 0), box('a', 10, 10)], 'horizontal'), /invalid/);
  assert.throws(() => distributionDeltas([box('a', 0, 0, -1)], 'horizontal'), /invalid/);
  assert.throws(() => distributionDeltas([], 'diagonal'), /invalid/);
});

test('translations preserve affine basis and reject singular or unsafe transforms', () => {
  const matrix = [0, 2, -3, 0, 20, 40];
  assert.deepEqual(translateMatrix(matrix, { x: -5, y: 12.5 }), [0, 2, -3, 0, 15, 52.5]);
  assert.deepEqual(matrix, [0, 2, -3, 0, 20, 40]);
  assert.throws(() => translateMatrix([0, 0, 0, 0, 0, 0], { x: 0, y: 0 }), /invalid/);
  assert.throws(() => translateMatrix([1, 0, 0, 1, 1000000, 0], { x: 1, y: 0 }), /range/);
  assert.throws(() => translateMatrix([1, 0, 0, 1, 0, 0], { x: Infinity, y: 0 }), /invalid/);
});
