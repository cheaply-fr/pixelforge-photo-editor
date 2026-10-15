import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrushScatter, scatterBrushPoint } from '../src/brushDynamics.ts';

test('brush scatter is bounded and defaults safely', () => {
  assert.equal(normalizeBrushScatter(-10), 0);
  assert.equal(normalizeBrushScatter(42.4), 42);
  assert.equal(normalizeBrushScatter(140), 100);
  assert.equal(normalizeBrushScatter('random'), 0);
});

test('zero scatter is exact and nonzero scatter is deterministic and size-bounded', () => {
  const point = { x: 40, y: 20 };
  assert.deepEqual(scatterBrushPoint(point, 30, 0), point);
  const first = scatterBrushPoint(point, 30, 80);
  assert.deepEqual(first, scatterBrushPoint(point, 30, 80));
  assert.ok(Math.hypot(first.x - point.x, first.y - point.y) <= 30 * 0.75 * 0.8 * Math.SQRT2);
});
