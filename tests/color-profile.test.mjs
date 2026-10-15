import test from 'node:test';
import assert from 'node:assert/strict';
import { convertRgbaProfile, normalizeColorProfile, validColorProfile } from '../src/colorProfile.ts';

test('color profiles are bounded and normalize legacy omissions to sRGB', () => {
  assert.equal(validColorProfile('srgb'), true);
  assert.equal(validColorProfile('display-p3'), true);
  assert.equal(validColorProfile('rec2020'), false);
  assert.equal(normalizeColorProfile(undefined), 'srgb');
  assert.equal(normalizeColorProfile('display-p3'), 'display-p3');
});

test('profile conversion is bounded, alpha-safe and visibly transforms wide-gamut primaries', () => {
  const source = new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 128,
    9, 8, 7, 0,
  ]);
  const converted = convertRgbaProfile(source, 3, 1, 'srgb', 'display-p3');
  assert.notDeepEqual([...converted], [...source]);
  assert.equal(converted[3], 255);
  assert.equal(converted[7], 128);
  assert.deepEqual(Array.from(converted.slice(8)), [9, 8, 7, 0]);
  for (const channel of converted) assert.ok(channel >= 0 && channel <= 255);
  assert.notStrictEqual(converted, source);
});

test('profile conversion round-trips within byte tolerance and rejects malformed buffers', () => {
  const source = new Uint8ClampedArray([34, 112, 241, 255, 201, 44, 77, 230]);
  const p3 = convertRgbaProfile(source, 2, 1, 'srgb', 'display-p3');
  const roundTrip = convertRgbaProfile(p3, 2, 1, 'display-p3', 'srgb');
  for (let index = 0; index < source.length; index += 1) {
    if (index % 4 === 3) assert.equal(roundTrip[index], source[index]);
    else assert.ok(Math.abs(roundTrip[index] - source[index]) <= 1);
  }
  assert.throws(() => convertRgbaProfile(new Uint8ClampedArray(3), 1, 1, 'srgb', 'display-p3'));
  assert.throws(() => convertRgbaProfile(new Uint8ClampedArray(4), 0, 1, 'srgb', 'display-p3'));
});
