import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBrushBuildUp, buildUpOpacity } from '../src/brushBuildUp.ts';
import { radialStampMask } from '../src/brush.ts';

test('build-up normalizes malformed and bounded values', () => {
  assert.equal(normalizeBrushBuildUp(undefined), 0);
  assert.equal(normalizeBrushBuildUp(-4), 0);
  assert.equal(normalizeBrushBuildUp(120), 100);
  assert.equal(normalizeBrushBuildUp(24.6), 25);
});

test('build-up is an identity at zero and deterministic otherwise', () => {
  assert.equal(buildUpOpacity(0, 10, 0), 1);
  assert.equal(buildUpOpacity(10, 10, 0), 1);
  const centre = buildUpOpacity(0, 10, 100);
  assert.equal(centre, 1);
  assert.ok(buildUpOpacity(10, 10, 100) < 1);
  assert.equal(centre, buildUpOpacity(0, 10, 100));
});

test('build-up preserves the centre and reduces the outer deposit', () => {
  const plain = radialStampMask({ width: 25, height: 25, x: 12, y: 12, size: 15, hardness: 100, opacity: 1, buildUp: 0 });
  const built = radialStampMask({ width: 25, height: 25, x: 12, y: 12, size: 15, hardness: 100, opacity: 1, buildUp: 100 });
  const centre = (12 - built.bounds.top) * built.width + (12 - built.bounds.left);
  const edge = (12 - built.bounds.top) * built.width + (18 - built.bounds.left);
  assert.equal(built.data[centre], plain.data[centre]);
  assert.ok(built.data[edge] < plain.data[edge]);
  assert.deepEqual(Array.from(built.data), Array.from(radialStampMask({ width: 25, height: 25, x: 12, y: 12, size: 15, hardness: 100, opacity: 1, buildUp: 100 }).data));
});
