import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';

const pixel = (data, width, x, y) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));

const fixture = (width = 11, height = 7) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = x * 19;
      data[offset + 1] = y * 31;
      data[offset + 2] = (x * 7 + y * 13) % 256;
      data[offset + 3] = x === 0 && y === 0 ? 0 : 255;
    }
  return data;
};

test('Adaptive Wide Angle is a valid editable filter with bounded controls', () => {
  const effect = effectiveFilterEffects({
    type: 'adaptive-wide-angle',
    amount: 72,
    radius: 48,
    angle: 27,
    centerX: 0.42,
    centerY: 0.58,
  });
  assert.equal(effect.type, 'adaptive-wide-angle');
  assert.equal(validFilterEffects(effect), true);
  assert.equal(effectiveFilterEffects({ ...effect, amount: 900 }).amount, 100);
  assert.equal(effectiveFilterEffects({ ...effect, radius: -10 }).radius, 0);
  assert.equal(effectiveFilterEffects({ ...effect, angle: 999 }).angle, 180);
});

test('Adaptive Wide Angle is deterministic, source-safe and neutral at zero amount', () => {
  const source = fixture();
  const original = source.slice();
  const neutral = applyFilterEffectsPixels(source, 11, 7, {
    type: 'adaptive-wide-angle', amount: 0, radius: 48,
  });
  assert.deepEqual(neutral, source);
  const effect = {
    type: 'adaptive-wide-angle', amount: 72, radius: 48,
    angle: 27, centerX: 0.42, centerY: 0.58,
  };
  const output = applyFilterEffectsPixels(source, 11, 7, effect);
  assert.deepEqual(source, original);
  assert.notDeepEqual(output, source);
  assert.deepEqual(output, applyFilterEffectsPixels(source, 11, 7, effect));
  assert.deepEqual(pixel(output, 11, 0, 0), pixel(source, 11, 0, 0));
});

test('guide angle and optical centre change the sampled correction field', () => {
  const source = fixture();
  const base = { type: 'adaptive-wide-angle', amount: 85, radius: 48 };
  const angle = applyFilterEffectsPixels(source, 11, 7, { ...base, angle: 0, centerX: 0.5, centerY: 0.5 });
  const rotated = applyFilterEffectsPixels(source, 11, 7, { ...base, angle: 90, centerX: 0.5, centerY: 0.5 });
  const shifted = applyFilterEffectsPixels(source, 11, 7, { ...base, angle: 0, centerX: 0.2, centerY: 0.8 });
  assert.notDeepEqual(angle, rotated);
  assert.notDeepEqual(angle, shifted);
});

test('transparent RGB padding and alpha remain stable', () => {
  const source = fixture();
  source[0] = 251;
  source[1] = 241;
  source[2] = 231;
  source[3] = 0;
  const output = applyFilterEffectsPixels(source, 11, 7, {
    type: 'adaptive-wide-angle', amount: 100, radius: 64, angle: -45,
  });
  assert.deepEqual(pixel(output, 11, 0, 0), [251, 241, 231, 0]);
  for (let index = 3; index < source.length; index += 4)
    assert.equal(output[index], source[index]);
});

test('invalid dimensions and buffers are rejected before rendering', () => {
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(3), 1, 1, {
    type: 'adaptive-wide-angle', amount: 50, radius: 20,
  }), /length/);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 0, 1, {
    type: 'adaptive-wide-angle', amount: 50, radius: 20,
  }), /dimensions/);
});
