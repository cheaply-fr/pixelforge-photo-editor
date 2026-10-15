import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGradientDither, normalizeGradientDither } from '../src/gradientDither.ts';

test('gradient dither normalizes bounded values', () => {
  assert.equal(normalizeGradientDither(undefined), 0);
  assert.equal(normalizeGradientDither(-5), 0);
  assert.equal(normalizeGradientDither(140), 100);
  assert.equal(normalizeGradientDither(31.4), 31);
});

test('gradient dither is detached, deterministic and alpha safe', () => {
  const source = new Uint8ClampedArray([
    120, 120, 120, 255,
    120, 120, 120, 0,
    120, 120, 120, 255,
    120, 120, 120, 255,
  ]);
  const result = applyGradientDither(source, 2, 2, 100);
  assert.notEqual(result, source);
  assert.deepEqual(Array.from(source), [120, 120, 120, 255, 120, 120, 120, 0, 120, 120, 120, 255, 120, 120, 120, 255]);
  assert.deepEqual(Array.from(result.slice(4, 8)), [120, 120, 120, 0]);
  assert.deepEqual(Array.from(result), Array.from(applyGradientDither(source, 2, 2, 100)));
  assert.notDeepEqual(Array.from(result.slice(0, 3)), [120, 120, 120]);
});

test('zero gradient dither preserves bytes while returning a detached buffer', () => {
  const source = new Uint8ClampedArray([1, 2, 3, 4]);
  const result = applyGradientDither(source, 1, 1, 0);
  assert.notEqual(result, source);
  assert.deepEqual(Array.from(result), Array.from(source));
});
