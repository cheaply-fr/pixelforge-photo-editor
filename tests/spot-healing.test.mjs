import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySpotHealingStroke,
  applySpotHealingStrokes,
  validSpotHealingStroke,
  validSpotHealingStrokes,
} from '../src/spotHealing.ts';

const rgba = (width, height, fill = [80, 120, 160, 255]) => {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) output.set(fill, offset);
  return output;
};
const pixel = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const stroke = (points = [{ x: 5, y: 5 }], overrides = {}) => ({
  version: 1,
  points,
  size: 5,
  hardness: 100,
  opacity: 1,
  ...overrides,
});

test('spot healing synthesizes local context around a blemish without mutating source', () => {
  const width = 11, height = 11, source = rgba(width, height);
  for (let y = 3; y <= 7; y += 1)
    for (let x = 3; x <= 7; x += 1) source.set([240, 25, 25, 255], (y * width + x) * 4);
  const original = source.slice();
  const result = applySpotHealingStrokes(source, width, height, [stroke()]);
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(result, width, 5, 5), [80, 120, 160, 255]);
  assert.deepEqual(pixel(result, width, 5, 5), pixel(result, width, 2, 5));
  assert.deepEqual(pixel(result, width, 0, 0), [80, 120, 160, 255]);
});

test('spot healing follows a line, clips at canvas bounds, and preserves alpha', () => {
  const width = 8, height = 6, source = rgba(width, height);
  for (let y = 1; y <= 4; y += 1)
    for (let x = 0; x <= 4; x += 1) source.set([10, 220, 30, 180], (y * width + x) * 4);
  const original = source.slice();
  const result = applySpotHealingStrokes(source, width, height, [stroke([
    { x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 3 },
  ], { size: 4, hardness: 50, opacity: 0.8 })]);
  assert.deepEqual(source, original);
  assert.equal(pixel(result, width, 0, 0)[3], 255);
  assert.equal(pixel(result, width, 2, 2)[3], 180);
  assert.deepEqual(pixel(result, width, 7, 5), [80, 120, 160, 255]);
});

test('cleanup keeps transparent RGB neutral and supports deterministic repeated rendering', () => {
  const source = rgba(7, 7);
  source.set([255, 0, 255, 0], (3 * 7 + 3) * 4);
  const one = applySpotHealingStrokes(source, 7, 7, [stroke([{ x: 3, y: 3 }])]);
  const two = applySpotHealingStrokes(source, 7, 7, [stroke([{ x: 3, y: 3 }])]);
  assert.deepEqual(one, two);
  const center = pixel(one, 7, 3, 3);
  assert.equal(center[3], 0);
  assert.deepEqual(center.slice(0, 3), [0, 0, 0]);
});

test('stroke validation rejects malformed, oversized, and out-of-bounds metadata', () => {
  assert.equal(validSpotHealingStroke(stroke(), 10, 10), true);
  assert.equal(validSpotHealingStrokes([stroke(), stroke([{ x: 2, y: 2 }])], 10, 10), true);
  assert.equal(validSpotHealingStroke({ ...stroke(), version: 2 }, 10, 10), false);
  assert.equal(validSpotHealingStroke({ ...stroke(), opacity: 2 }, 10, 10), false);
  assert.equal(validSpotHealingStroke({ ...stroke([{ x: 10, y: 2 }]) }, 10, 10), false);
  assert.equal(validSpotHealingStrokes(Array.from({ length: 129 }, () => stroke()), 10, 10), false);
  assert.throws(() => applySpotHealingStroke(new Uint8ClampedArray(3), new Uint8ClampedArray(4), 1, 1, stroke()), /RGBA/);
});
