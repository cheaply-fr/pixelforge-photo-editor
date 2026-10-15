import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrushSmoothing, stabilizeBrushPoint } from '../src/brushSmoothing.ts';

test('brush smoothing clamps persisted values and keeps zero exact', () => {
  assert.equal(normalizeBrushSmoothing(-4), 0);
  assert.equal(normalizeBrushSmoothing(42.6), 43);
  assert.equal(normalizeBrushSmoothing(140), 100);
  assert.deepEqual(stabilizeBrushPoint({ x: 2, y: 3 }, { x: 12, y: 13 }, 0), { x: 12, y: 13 });
});

test('brush smoothing is bounded and deterministic without overshoot', () => {
  const previous = { x: 10, y: 20 }, next = { x: 50, y: 4 };
  const one = stabilizeBrushPoint(previous, next, 80);
  assert.deepEqual(one, stabilizeBrushPoint(previous, next, 80));
  assert.ok(one.x > previous.x && one.x < next.x);
  assert.ok(one.y < previous.y && one.y > next.y);
});
