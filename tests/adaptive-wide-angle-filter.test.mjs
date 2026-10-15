import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';

const rgba = (width, height, fn) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      data.set(fn(x, y), (y * width + x) * 4);
  return data;
};

const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));

test('Adaptive Wide Angle is deterministic, anisotropic and source-safe', () => {
  const source = rgba(11, 7, (x, y) =>
    x === 0 && y === 0 ? [17, 23, 29, 0] : [x * 19, y * 31, (x + y) * 11, 255]);
  const original = source.slice();
  const effect = {
    type: 'adaptive-wide-angle', amount: 100, radius: 64,
    centerX: 0.5, centerY: 0.5,
    adaptiveWideAngle: { horizontal: 80, vertical: 20 },
  };
  const output = applyFilterEffectsPixels(source, 11, 7, effect);
  assert.deepEqual(source, original);
  assert.notDeepEqual(output, source);
  assert.deepEqual(pixel(output, 11, 0, 0), [17, 23, 29, 0]);
  assert.equal(pixel(output, 11, 5, 3)[3], 255);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 11, 7, effect));
  const swapped = applyFilterEffectsPixels(source, 11, 7, {
    ...effect,
    adaptiveWideAngle: { horizontal: 20, vertical: 80 },
  });
  assert.notDeepEqual(swapped, output);
});

test('Adaptive Wide Angle metadata is bounded and round-trip valid', () => {
  const normalized = effectiveFilterEffects({
    type: 'adaptive-wide-angle', amount: 120, radius: -5,
    centerX: -2, centerY: 3,
    adaptiveWideAngle: { horizontal: 999, vertical: -20 },
  });
  assert.deepEqual(normalized.adaptiveWideAngle, { horizontal: 100, vertical: 0 });
  assert.equal(normalized.amount, 100);
  assert.equal(normalized.radius, 0);
  assert.equal(normalized.centerX, 0);
  assert.equal(normalized.centerY, 1);
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(isNeutralFilterEffects(normalized), true);
  assert.equal(validFilterEffects({
    ...normalized,
    adaptiveWideAngle: { horizontal: 101, vertical: 50 },
  }), false);
});
