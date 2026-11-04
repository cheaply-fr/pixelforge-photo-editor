import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCoverageAt, mixByMask } from '../src/selectionClip.ts';

const pixels = (...values) => new Uint8ClampedArray(values.flat());

test('mask 255 keeps the edit and 0 keeps the original', () => {
  const original = pixels([10, 20, 30, 255], [40, 50, 60, 255]);
  const edited = pixels([200, 100, 0, 255], [0, 0, 255, 255]);
  assert.deepEqual(Array.from(mixByMask(original, edited, new Uint8ClampedArray([255, 0]))), [
    200, 100, 0, 255, 40, 50, 60, 255,
  ]);
});

test('partial coverage blends opaque pixels linearly', () => {
  const out = mixByMask(pixels([0, 0, 0, 255]), pixels([200, 100, 50, 255]), new Uint8ClampedArray([128]));
  const w = 128 / 255;
  assert.deepEqual(Array.from(out), [Math.round(200 * w), Math.round(100 * w), Math.round(50 * w), 255]);
});

test('feathered edits over transparency keep their colour instead of darkening', () => {
  // Original is transparent black; the edit is opaque orange at half coverage.
  const out = mixByMask(pixels([0, 0, 0, 0]), pixels([255, 128, 0, 255]), new Uint8ClampedArray([128]));
  assert.deepEqual(Array.from(out.slice(0, 3)), [255, 128, 0]);
  assert.equal(out[3], 128);
  // Fully transparent results have no colour.
  assert.deepEqual(Array.from(mixByMask(pixels([9, 9, 9, 0]), pixels([9, 9, 9, 0]), new Uint8ClampedArray([77]))), [0, 0, 0, 0]);
});

test('the inputs are not modified and size mismatches are rejected', () => {
  const original = pixels([1, 2, 3, 255]), edited = pixels([4, 5, 6, 255]);
  const before = [Array.from(original), Array.from(edited)];
  mixByMask(original, edited, new Uint8ClampedArray([200]));
  assert.deepEqual([Array.from(original), Array.from(edited)], before);
  assert.throws(() => mixByMask(original, pixels([1, 2, 3, 4], [5, 6, 7, 8]), new Uint8ClampedArray([1])), /does not match/);
  assert.throws(() => mixByMask(original, edited, new Uint8ClampedArray([1, 2])), /does not match/);
});

test('mask coverage reads layer pixels and is zero outside the layer', () => {
  const mask = new Uint8ClampedArray([0, 50, 100, 255]); // 2×2
  assert.equal(maskCoverageAt(mask, 2, 2, 1.9, 0.2), 50);
  assert.equal(maskCoverageAt(mask, 2, 2, 1, 1), 255);
  assert.equal(maskCoverageAt(mask, 2, 2, -0.1, 0), 0);
  assert.equal(maskCoverageAt(mask, 2, 2, 2, 0), 0);
});
