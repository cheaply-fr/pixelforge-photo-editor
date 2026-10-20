import test from 'node:test';
import assert from 'node:assert/strict';
import { dualBrushOpacity, normalizeBrushDual } from '../src/brushDual.ts';

test('dual brush normalization clamps malformed and bounded values', () => {
  assert.equal(normalizeBrushDual(undefined), 0);
  assert.equal(normalizeBrushDual(-10), 0);
  assert.equal(normalizeBrushDual(105), 100);
  assert.equal(normalizeBrushDual(42.6), 43);
});

test('dual brush is an exact identity at zero and deterministic otherwise', () => {
  assert.equal(dualBrushOpacity(12, 7, 0), 1);
  const first = dualBrushOpacity(12, 7, 100);
  assert.equal(first, dualBrushOpacity(12, 7, 100));
  assert.ok(first >= 0.55 && first <= 1);
  assert.notEqual(first, dualBrushOpacity(13, 7, 100));
});
