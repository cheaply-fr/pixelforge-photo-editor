import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionOutline } from '../src/selectionOutline.ts';
import {
  clearSelectedPixels,
  colorRegionMask,
  fillMaskedPixels,
  frameMaskToLayer,
  normalizeColorRegionSettings,
} from '../src/colorRegion.ts';
import { marqueeRect, normalizeMarqueeOptions } from '../src/marqueeOptions.ts';

const plane = (width, height, inside) => {
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) alpha[y * width + x] = inside(x, y);
  return alpha;
};

test('selection outline traces a rectangle as four merged runs', () => {
  const outline = selectionOutline(plane(10, 8, (x, y) => (x >= 2 && x < 6 && y >= 1 && y < 4 ? 255 : 0)), 10, 8);
  assert.equal(outline.empty, false);
  assert.equal(outline.full, false);
  assert.equal(outline.segments, 4);
  assert.equal(outline.step, 1);
  assert.match(outline.path, /M2 1H6/);
  assert.match(outline.path, /M2 4H6/);
  assert.match(outline.path, /M2 1V4/);
  assert.match(outline.path, /M6 1V4/);
});

test('selection outline cuts feathered coverage at 50 % and keeps islands separate', () => {
  // Coverage ramps 0..255 across x; only x >= 4 (alpha >= 128) is inside.
  const ramp = selectionOutline(plane(8, 2, (x) => Math.round((x / 7) * 255)), 8, 2);
  assert.match(ramp.path, /M4 0V2/);
  assert.doesNotMatch(ramp.path, /M3 0V2/);
  const islands = selectionOutline(plane(9, 3, (x) => (x === 1 || x === 7 ? 255 : 0)), 9, 3);
  assert.equal(islands.segments, 8);
});

test('selection outline reports empty and full selections', () => {
  assert.equal(selectionOutline(new Uint8Array(12), 4, 3).empty, true);
  const full = selectionOutline(new Uint8Array(12).fill(255), 4, 3);
  assert.equal(full.full, true);
  assert.equal(full.segments, 4);
});

test('selection outline coarsens busy masks to stay bounded', () => {
  const noisy = plane(64, 64, (x, y) => ((x + y) % 2 ? 255 : 0));
  const outline = selectionOutline(noisy, 64, 64, { maxSegments: 200 });
  assert.ok(outline.step > 1);
  assert.ok(outline.segments <= 200);
  assert.throws(() => selectionOutline(new Uint8Array(2), 4, 4));
});

const rgbaPlane = (width, height, color) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data.set(color(x, y), (y * width + x) * 4);
  return data;
};

test('color region honours tolerance and contiguous', () => {
  // Red | blue wall | red, plus a near-red pixel at x=1.
  const data = rgbaPlane(5, 1, (x) => (x === 2 ? [0, 0, 255, 255] : x === 1 ? [240, 10, 0, 255] : [255, 0, 0, 255]));
  const contiguous = colorRegionMask(data, 5, 1, 0, 0, { tolerance: 24, contiguous: true });
  assert.deepEqual([...contiguous], [255, 255, 0, 0, 0]);
  const strict = colorRegionMask(data, 5, 1, 0, 0, { tolerance: 0, contiguous: true });
  assert.deepEqual([...strict], [255, 0, 0, 0, 0]);
  const global = colorRegionMask(data, 5, 1, 0, 0, { tolerance: 24, contiguous: false });
  assert.deepEqual([...global], [255, 255, 0, 255, 255]);
  assert.equal(colorRegionMask(data, 5, 1, 9, 0, { tolerance: 24, contiguous: true }), null);
});

test('color region settings default for older drafts', () => {
  assert.deepEqual(normalizeColorRegionSettings(undefined), { contiguous: true, sampleAllLayers: false });
  assert.deepEqual(normalizeColorRegionSettings({ contiguous: 'no', sampleAllLayers: true }), {
    contiguous: true,
    sampleAllLayers: true,
  });
});

test('fill and clear edit only covered pixels', () => {
  const data = rgbaPlane(3, 1, () => [10, 20, 30, 255]);
  assert.equal(fillMaskedPixels(data, [255, 0, 255], [200, 100, 0]), 2);
  assert.deepEqual(Array.from(data.subarray(0, 8)), [200, 100, 0, 255, 10, 20, 30, 255]);
  const clear = rgbaPlane(3, 1, () => [10, 20, 30, 255]);
  assert.equal(clearSelectedPixels(clear, [255, 128, 0]), true);
  assert.equal(clear[3], 0);
  assert.equal(clear[7], 127);
  assert.equal(clear[11], 255);
  assert.equal(clearSelectedPixels(clear, [0, 0, 0]), false);
});

test('frame masks resample through a layer placement', () => {
  const frameMask = [0, 255, 255, 0];
  // Layer is 2×1, offset one pixel right in a 4×1 frame.
  assert.deepEqual([...frameMaskToLayer(frameMask, 4, 1, [1, 0, 0, 1, 1, 0], 2, 1)], [255, 255]);
});

test('marquee options normalise and constrain rectangles', () => {
  assert.deepEqual(normalizeMarqueeOptions(undefined), { feather: 0, style: 'normal', width: 1, height: 1 });
  assert.deepEqual(normalizeMarqueeOptions({ feather: 999, style: 'odd', width: -3, height: 'x' }), {
    feather: 250,
    style: 'normal',
    width: 1,
    height: 1,
  });
  const free = marqueeRect({ x: 10, y: 10 }, { x: 4, y: 30 }, { style: 'normal', width: 1, height: 1 });
  assert.deepEqual(free, { left: 4, top: 10, width: 6, height: 20 });
  const ratio = marqueeRect({ x: 0, y: 0 }, { x: 40, y: 5 }, { style: 'fixed-ratio', width: 2, height: 1 });
  assert.deepEqual(ratio, { left: 0, top: 0, width: 40, height: 20 });
  const size = marqueeRect({ x: 50, y: 50 }, { x: 40, y: 50 }, { style: 'fixed-size', width: 30, height: 12 });
  assert.deepEqual(size, { left: 20, top: 50, width: 30, height: 12 });
});
