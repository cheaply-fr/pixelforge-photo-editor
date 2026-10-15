import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGradientNoise, normalizeGradientNoise } from '../src/gradientNoise.ts';

test('gradient noise bounds and zero identity are safe', () => {
  assert.equal(normalizeGradientNoise(-2), 0);
  assert.equal(normalizeGradientNoise(130), 100);
  assert.equal(normalizeGradientNoise(31.4), 31);
  const source = new Uint8ClampedArray([100, 120, 140, 255, 80, 90, 100, 0]);
  const result = applyGradientNoise(source, 2, 1, 0);
  assert.deepEqual(Array.from(result), Array.from(source));
  assert.notEqual(result, source);
});

test('gradient noise is deterministic, changes opaque RGB, preserves alpha, and skips transparent pixels', () => {
  const source = new Uint8ClampedArray([
    100, 120, 140, 255,
    80, 90, 100, 0,
    40, 50, 60, 255,
    20, 30, 40, 255,
  ]);
  const result = applyGradientNoise(source, 2, 2, 100);
  assert.deepEqual(Array.from(result), Array.from(applyGradientNoise(source, 2, 2, 100)));
  assert.notDeepEqual(Array.from(result.slice(0, 3)), Array.from(source.slice(0, 3)));
  assert.deepEqual(Array.from(result.slice(4, 8)), Array.from(source.slice(4, 8)));
  assert.deepEqual(Array.from(result.filter((_, index) => index % 4 === 3)), [255, 0, 255, 255]);
});

test('gradient noise rejects malformed buffers', () => {
  assert.throws(() => applyGradientNoise(new Uint8ClampedArray(3), 1, 1, 10), /Invalid gradient noise buffer/);
});

