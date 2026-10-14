import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPhotoAdjustmentsPixels,
  effectivePhotoAdjustments,
  isNeutralPhotoAdjustments,
  neutralPhotoAdjustments,
  validPhotoAdjustments,
} from '../src/photoAdjustments.ts';

const pixel = (data, index) => Array.from(data.slice(index * 4, index * 4 + 4));

test('photo adjustment metadata normalizes legacy and bounded values', () => {
  assert.deepEqual(
    effectivePhotoAdjustments({ exposure: 20, vibrance: -500, blackAndWhite: 1 }),
    { exposure: 5, vibrance: -100, blackAndWhite: false, highlights: 0, shadows: 0, temperature: 0, tint: 0, clarity: 0 },
  );
  assert.deepEqual(effectivePhotoAdjustments(undefined), neutralPhotoAdjustments);
  assert.deepEqual(
    effectivePhotoAdjustments({ exposure: Number.NaN, vibrance: Infinity, blackAndWhite: true }),
    { exposure: 0, vibrance: 0, blackAndWhite: true, highlights: 0, shadows: 0, temperature: 0, tint: 0, clarity: 0 },
  );
  assert.equal(validPhotoAdjustments({ exposure: 0, vibrance: 0, blackAndWhite: false }), true);
  assert.equal(validPhotoAdjustments({ exposure: 5.01, vibrance: 0, blackAndWhite: false }), false);
  assert.equal(validPhotoAdjustments({ exposure: 0, vibrance: -100.01, blackAndWhite: false }), false);
  assert.equal(validPhotoAdjustments({ exposure: 0, vibrance: 0, blackAndWhite: 1 }), false);
  assert.equal(validPhotoAdjustments({ exposure: 0, vibrance: 0 }), false);
  assert.equal(validPhotoAdjustments(null), false);
  assert.equal(isNeutralPhotoAdjustments(undefined), true);
  assert.equal(isNeutralPhotoAdjustments({ blackAndWhite: true }), false);
});

test('neutral photo adjustments return a detached byte-identical buffer', () => {
  const source = new Uint8ClampedArray([17, 28, 39, 255, 200, 100, 50, 127]);
  const result = applyPhotoAdjustmentsPixels(source, neutralPhotoAdjustments);
  assert.notEqual(result, source);
  assert.deepEqual(result, source);
  result[0] = 0;
  assert.equal(source[0], 17);
});

test('exposure follows signed stops and leaves alpha and source immutable', () => {
  const source = new Uint8ClampedArray([
    32, 64, 128, 255,
    200, 100, 50, 127,
    17, 28, 39, 0,
  ]);
  const original = source.slice();
  const brighter = applyPhotoAdjustmentsPixels(source, { exposure: 1 });
  assert.deepEqual(pixel(brighter, 0), [64, 128, 255, 255]);
  assert.deepEqual(pixel(brighter, 1), [255, 200, 100, 127]);
  assert.deepEqual(pixel(brighter, 2), [17, 28, 39, 0]);
  const darker = applyPhotoAdjustmentsPixels(source, { exposure: -1 });
  assert.deepEqual(pixel(darker, 0), [16, 32, 64, 255]);
  assert.deepEqual(pixel(darker, 1), [100, 50, 25, 127]);
  assert.deepEqual(source, original);
});

test('vibrance boosts muted colours more conservatively than saturated colours', () => {
  const source = new Uint8ClampedArray([
    100, 90, 80, 255,
    240, 20, 20, 255,
    30, 30, 30, 255,
    9, 8, 7, 0,
  ]);
  const result = applyPhotoAdjustmentsPixels(source, { vibrance: 100 });
  const muted = pixel(result, 0);
  const vivid = pixel(result, 1);
  assert.ok(Math.abs(muted[0] - muted[1]) > Math.abs(source[0] - source[1]));
  assert.ok(Math.abs(muted[1] - muted[2]) > Math.abs(source[1] - source[2]));
  const mutedChromaDelta = Math.max(...muted.slice(0, 3)) - Math.min(...muted.slice(0, 3)) - (Math.max(...source.slice(0, 3)) - Math.min(...source.slice(0, 3)));
  const vividChromaDelta = Math.max(...vivid.slice(0, 3)) - Math.min(...vivid.slice(0, 3)) - (Math.max(...source.slice(4, 7)) - Math.min(...source.slice(4, 7)));
  assert.ok(mutedChromaDelta > vividChromaDelta);
  assert.deepEqual(pixel(result, 2), pixel(source, 2));
  assert.deepEqual(pixel(result, 3), [9, 8, 7, 0]);
});

test('negative vibrance fades chroma to luminance and reaches neutral at minus 100', () => {
  const source = new Uint8ClampedArray([210, 80, 30, 255, 10, 20, 40, 255]);
  const result = applyPhotoAdjustmentsPixels(source, { vibrance: -100 });
  assert.deepEqual(pixel(result, 0).slice(0, 3), [104, 104, 104]);
  assert.deepEqual(pixel(result, 1).slice(0, 3), [19, 19, 19]);
  assert.equal(pixel(result, 0)[3], 255);
});

test('Camera Raw tonal controls recover shadows/highlights and shift colour without touching alpha', () => {
  const source = new Uint8ClampedArray([
    240, 200, 180, 255,
    24, 36, 48, 127,
    9, 8, 7, 0,
  ]);
  const result = applyPhotoAdjustmentsPixels(source, {
    highlights: -80,
    shadows: 80,
    temperature: 60,
    tint: -35,
    clarity: 50,
  });
  assert.ok(result[0] < source[0], 'highlight recovery lowers a bright pixel');
  assert.ok(result[4] > source[4], 'shadow recovery lifts a dark pixel');
  assert.notDeepEqual(Array.from(result.slice(4, 7)), Array.from(source.slice(4, 7)));
  assert.equal(result[3], 255);
  assert.equal(result[7], 127);
  assert.deepEqual(Array.from(result.slice(8, 12)), [9, 8, 7, 0]);
});

test('Camera Raw metadata bounds are safe and legacy three-field records remain valid', () => {
  assert.deepEqual(effectivePhotoAdjustments({ highlights: 500, shadows: -500, temperature: NaN, tint: 12, clarity: 25 }), {
    ...neutralPhotoAdjustments,
    highlights: 100,
    shadows: -100,
    tint: 12,
    clarity: 25,
  });
  assert.equal(validPhotoAdjustments({ exposure: 0, vibrance: 0, blackAndWhite: false }), true);
  assert.equal(validPhotoAdjustments({ exposure: 0, vibrance: 0, blackAndWhite: false, temperature: 101 }), false);
});

test('black and white uses Rec. 709 luminance after exposure and vibrance', () => {
  const source = new Uint8ClampedArray([100, 150, 200, 255, 11, 22, 33, 127, 77, 66, 55, 0]);
  const result = applyPhotoAdjustmentsPixels(source, { blackAndWhite: true });
  assert.deepEqual(pixel(result, 0), [143, 143, 143, 255]);
  assert.deepEqual(pixel(result, 1), [20, 20, 20, 127]);
  assert.deepEqual(pixel(result, 2), [77, 66, 55, 0]);
  assert.equal(new Set([result[0], result[1], result[2]]).size, 1);
});

test('combined corrections are deterministic, ordered, alpha-safe and source-safe', () => {
  const source = new Uint8ClampedArray([
    20, 40, 80, 255,
    170, 100, 20, 191,
    1, 2, 3, 0,
  ]);
  const original = source.slice();
  const settings = { exposure: 0.5, vibrance: 65, blackAndWhite: true };
  const first = applyPhotoAdjustmentsPixels(source, settings);
  const second = applyPhotoAdjustmentsPixels(source, settings);
  assert.deepEqual(first, second);
  assert.deepEqual(source, original);
  assert.deepEqual(pixel(first, 2), [1, 2, 3, 0]);
  assert.equal(pixel(first, 0)[0], pixel(first, 0)[1]);
  assert.equal(pixel(first, 1)[1], pixel(first, 1)[2]);
  assert.equal(pixel(first, 0)[3], 255);
  assert.equal(pixel(first, 1)[3], 191);
});

test('invalid pixel buffers fail closed before processing', () => {
  assert.throws(
    () => applyPhotoAdjustmentsPixels(new Uint8ClampedArray(3), neutralPhotoAdjustments),
    /complete RGBA/,
  );
  assert.throws(
    () => applyPhotoAdjustmentsPixels(new Uint8Array(4), neutralPhotoAdjustments),
    /Uint8ClampedArray/,
  );
});
