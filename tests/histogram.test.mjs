import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistogram, histogramPeak } from '../src/histogram.ts';

test('histogram counts visible channels and Rec. 709 luminance deterministically', () => {
  const data = buildHistogram(new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 128,
    42, 42, 42, 0,
  ]));
  assert.equal(data.visiblePixels, 2);
  assert.equal(data.alphaSum, 383);
  assert.equal(data.red[255], 1);
  assert.equal(data.green[255], 1);
  assert.equal(data.blue[0], 2);
  assert.equal(data.minimum, 54);
  assert.equal(data.maximum, 182);
  assert.equal(data.mean, 118);
});

test('histogram excludes transparent RGB bytes and reports an empty visible range', () => {
  const data = buildHistogram(new Uint8Array([255, 1, 2, 0, 12, 13, 14, 0]));
  assert.equal(data.visiblePixels, 0);
  assert.equal(data.red.reduce((sum, value) => sum + value, 0), 0);
  assert.equal(data.minimum, 0);
  assert.equal(data.maximum, 0);
  assert.equal(data.mean, 0);
});

test('histogram rejects malformed buffers and peaks require 256 bins', () => {
  assert.throws(() => buildHistogram(new Uint8Array([0, 0, 0])), /complete RGBA/);
  assert.throws(() => histogramPeak([1, 2]), /256 bins/);
  assert.equal(histogramPeak(Array.from({ length: 256 }, (_, index) => index === 12 ? 9 : 0)), 9);
});

