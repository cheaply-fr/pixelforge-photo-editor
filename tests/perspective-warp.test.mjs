import test from 'node:test';
import assert from 'node:assert/strict';
import { mapPerspectivePoint } from '../src/cropTools.ts';
import { planPerspectiveWarp, warpPerspectiveRgba } from '../src/perspectiveWarp.ts';

test('Perspective Warp keeps an axis-aligned target as an identity mapping', () => {
  const plan = planPerspectiveWarp(4, 3, [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
  ]);
  assert.deepEqual(mapPerspectivePoint(plan.sourceFromTarget, { x: 2, y: 1 }), { x: 2, y: 1 });
  const source = Uint8ClampedArray.from({ length: 4 * 3 * 4 }, (_, index) => index % 256);
  assert.deepEqual(warpPerspectiveRgba(source, 4, 3, plan), source);
});

test('Perspective Warp maps source corners into a convex target and preserves source input', () => {
  const plan = planPerspectiveWarp(5, 4, [
    { x: 1, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 4 }, { x: 0, y: 3 },
  ]);
  const corners = [[0, 0], [4, 0], [4, 3], [0, 3]];
  for (const [x, y] of corners) {
    const point = mapPerspectivePoint(plan.targetFromSource, { x, y });
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  const source = new Uint8ClampedArray(5 * 4 * 4);
  source.fill(255);
  const before = new Uint8ClampedArray(source);
  const output = warpPerspectiveRgba(source, 5, 4, plan);
  assert.deepEqual(source, before);
  assert.equal(output.length, source.length);
  assert.ok(output.some((value, index) => value !== source[index]));
});

test('Perspective Warp rejects malformed dimensions and folded quads', () => {
  assert.throws(() => planPerspectiveWarp(4, 3, [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 },
  ]), /corners or output/);
});
