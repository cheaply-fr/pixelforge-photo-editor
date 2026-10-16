import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  validFilterEffects,
} from '../src/filterEffects.ts';

const effect = { type: 'high-pass', amount: 85, radius: 3 };

function fixture(width = 9, height = 5) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = x * 23;
      data[offset + 1] = y * 41;
      data[offset + 2] = (x + y) * 13;
      data[offset + 3] = x === 0 && y === 0 ? 0 : x === 1 && y === 0 ? 128 : 255;
    }
  }
  return data;
}

test('High Pass is deterministic, source-safe and preserves alpha', () => {
  const source = fixture();
  const original = source.slice();
  const first = applyFilterEffectsPixels(source, 9, 5, effect);
  const second = applyFilterEffectsPixels(source, 9, 5, effect);
  assert.notEqual(first, source);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  for (let offset = 3; offset < source.length; offset += 4) assert.equal(first[offset], source[offset]);
  assert.deepEqual(Array.from(first.slice(0, 4)), Array.from(source.slice(0, 4)));
  assert.notDeepEqual(Array.from(first.slice(8, 12)), Array.from(source.slice(8, 12)));
  for (const value of first) assert.ok(value >= 0 && value <= 255);
});

test('High Pass amount and radius are editable and amount zero is identity', () => {
  const source = fixture();
  const full = applyFilterEffectsPixels(source, 9, 5, effect);
  const half = applyFilterEffectsPixels(source, 9, 5, { ...effect, amount: 40 });
  assert.notDeepEqual(full, source);
  assert.notDeepEqual(half, source);
  assert.notDeepEqual(full, half);
  const identity = applyFilterEffectsPixels(source, 9, 5, { ...effect, amount: 0 });
  assert.deepEqual(identity, source);
  assert.equal(isNeutralFilterEffects({ ...effect, amount: 0 }), true);
  assert.equal(isNeutralFilterEffects(effect), false);
});

test('High Pass metadata is bounded and round-trips through normalization', () => {
  const normalized = effectiveFilterEffects({ ...effect, amount: 120, radius: 99 });
  assert.deepEqual(normalized, { ...effect, amount: 100, radius: 64, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 });
  assert.equal(validFilterEffects(normalized), true);
  assert.equal(validFilterEffects({ ...normalized, radius: -1 }), false);
  assert.equal(validFilterEffects({ ...normalized, amount: Number.NaN }), false);
  assert.equal(effectiveFilterEffects(JSON.parse(JSON.stringify(normalized))).type, 'high-pass');
});

test('High Pass rejects malformed buffers and dimensions before allocating', () => {
  assert.throws(() => applyFilterEffectsPixels([], 1, 1, effect), TypeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 2, 1, effect), RangeError);
  assert.throws(() => applyFilterEffectsPixels(new Uint8ClampedArray(4), 0, 1, effect), RangeError);
});
