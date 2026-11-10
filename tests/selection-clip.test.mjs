import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brushSegmentRect,
  brushStampReach,
  maskCoverageAt,
  mixByMask,
  mixRectByMask,
} from '../src/selectionClip.ts';

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

// Brush/Pencil/Eraser strokes confine only the rectangle each segment touched.

/** Deterministic RGBA layer: every pixel differs so wrong offsets are visible. */
const layer = (width, height, seed) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 1) data[index] = (index * 37 + seed * 11) % 256;
  return data;
};
const crop = (data, layerWidth, rect) => {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row += 1) {
    const start = ((rect.y + row) * layerWidth + rect.x) * 4;
    out.set(data.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  return out;
};

test('rectangle confinement matches whole-layer mixing for feathered and inverted masks', () => {
  const width = 7, height = 5, original = layer(width, height, 1), edited = layer(width, height, 9);
  // Feathered ramp across x, then its inverse (255 - coverage).
  const feathered = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) feathered[y * width + x] = Math.round((x / (width - 1)) * 255);
  const inverted = feathered.map((value) => 255 - value);
  for (const mask of [feathered, inverted]) {
    const whole = mixByMask(original, edited, mask);
    for (const rect of [{ x: 0, y: 0, width, height }, { x: 2, y: 1, width: 3, height: 3 }, { x: 6, y: 4, width: 1, height: 1 }]) {
      const out = mixRectByMask(original, crop(edited, width, rect), mask, width, rect);
      assert.deepEqual(Array.from(out), Array.from(crop(whole, width, rect)), JSON.stringify(rect));
    }
  }
});

test('rectangle confinement keeps outside pixels, takes inside paint, and blends partial coverage in premultiplied alpha', () => {
  // 3×1 layer: transparent original, opaque red stroke; coverage 0, 128, 255.
  const original = pixels([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
  const edited = pixels([255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]);
  const out = mixRectByMask(original, edited, new Uint8ClampedArray([0, 128, 255]), 3, { x: 0, y: 0, width: 3, height: 1 });
  assert.deepEqual(Array.from(out.slice(0, 4)), [0, 0, 0, 0]);
  // Half coverage keeps the pure colour at half alpha instead of darkening it.
  assert.deepEqual(Array.from(out.slice(4, 8)), [255, 0, 0, 128]);
  assert.deepEqual(Array.from(out.slice(8, 12)), [255, 0, 0, 255]);

  // Erasing an opaque blue layer: the eraser result is transparent; partial
  // coverage keeps the complementary alpha with the original colour.
  const blue = pixels([0, 0, 255, 255], [0, 0, 255, 255], [0, 0, 255, 255]);
  const erased = pixels([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]);
  const kept = mixRectByMask(blue, erased, new Uint8ClampedArray([0, 128, 255]), 3, { x: 0, y: 0, width: 3, height: 1 });
  assert.deepEqual(Array.from(kept), [0, 0, 255, 255, 0, 0, 255, 127, 0, 0, 0, 0]);
});

test('rectangle confinement rejects mismatched or out-of-layer rectangles', () => {
  const original = layer(4, 4, 2), mask = new Uint8ClampedArray(16);
  const rect = { x: 1, y: 1, width: 2, height: 2 };
  assert.equal(mixRectByMask(original, new Uint8ClampedArray(16), mask, 4, rect).length, 16);
  assert.throws(() => mixRectByMask(original, new Uint8ClampedArray(12), mask, 4, rect), /does not match/);
  assert.throws(() => mixRectByMask(original, new Uint8ClampedArray(16), mask, 4, { ...rect, x: 3 }), /does not match/);
  assert.throws(() => mixRectByMask(original, new Uint8ClampedArray(16), mask, 4, { ...rect, y: -1 }), /does not match/);
  assert.throws(() => mixRectByMask(original, new Uint8ClampedArray(16), mask, 4, { ...rect, x: 0.5 }), /does not match/);
  assert.throws(() => mixRectByMask(original, new Uint8ClampedArray(16), new Uint8ClampedArray(15), 4, rect), /does not match/);
  assert.throws(() => mixRectByMask(original, new Uint8ClampedArray(16), mask, 3, rect), /does not match/);
});

test('brush reach covers the stamp radius, scatter offset and an anti-aliasing margin', () => {
  assert.equal(brushStampReach(20), 12);
  assert.equal(brushStampReach(20, 100), 27);
  assert.equal(brushStampReach(20, 50), 19.5);
  // Scatter (0–1,000%) is clamped like the brush engine; bad sizes fall back to 1px.
  assert.equal(brushStampReach(20, 500), 87);
  assert.equal(brushStampReach(20, 5000), 162);
  assert.equal(brushStampReach(Number.NaN), 2.5);
  assert.equal(brushStampReach(0), 2.5);
});

test('segment rectangles bound both endpoints, clamp to the layer and drop off-layer segments', () => {
  assert.deepEqual(brushSegmentRect({ x: 10, y: 20 }, { x: 30, y: 25 }, 5, 100, 100), { x: 5, y: 15, width: 31, height: 16 });
  // Reversed endpoints produce the same rectangle.
  assert.deepEqual(brushSegmentRect({ x: 30, y: 25 }, { x: 10, y: 20 }, 5, 100, 100), { x: 5, y: 15, width: 31, height: 16 });
  // Clamped at every edge.
  assert.deepEqual(brushSegmentRect({ x: -3, y: -3 }, { x: 98, y: 99 }, 5, 100, 100), { x: 0, y: 0, width: 100, height: 100 });
  // Entirely outside, or non-finite.
  assert.equal(brushSegmentRect({ x: -50, y: 10 }, { x: -20, y: 10 }, 5, 100, 100), null);
  assert.equal(brushSegmentRect({ x: 10, y: 150 }, { x: 10, y: 120 }, 5, 100, 100), null);
  assert.equal(brushSegmentRect({ x: Number.NaN, y: 0 }, { x: 1, y: 1 }, 5, 100, 100), null);
});

test('every stamp a segment can place lies inside its confinement rectangle', () => {
  // Stamp centres along the segment, scattered by up to 0.75 × size, with a
  // radius of size / 2 (the stamp engine's pixel bounds) stay in the rectangle.
  const size = 24, scatter = 100, reach = brushStampReach(size, scatter);
  const from = { x: 40.3, y: 91.7 }, to = { x: 80.9, y: 52.2 };
  const rect = brushSegmentRect(from, to, reach, 200, 200);
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20, x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t;
    for (const [dx, dy] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const cx = x + dx * size * 0.75, cy = y + dy * size * 0.75, radius = size / 2;
      assert.ok(Math.floor(cx - radius) >= rect.x && Math.floor(cy - radius) >= rect.y);
      assert.ok(Math.floor(cx + radius) + 1 <= rect.x + rect.width && Math.floor(cy + radius) + 1 <= rect.y + rect.height);
    }
  }
});
