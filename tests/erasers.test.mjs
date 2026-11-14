import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBackgroundEraser,
  applyBackgroundEraserStroke,
  applyMagicEraser,
  backgroundEraser,
  eraserColorDistance,
  eraserColorMatches,
  magicEraser,
} from '../src/erasers.ts';

const rgba = (width, height, color = [0, 0, 0, 0]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set(color, i * 4);
  return data;
};
const pixel = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x + 1) * 4));
const alpha = (data, width, x, y) => data[(y * width + x) * 4 + 3];
const setPixel = (data, width, x, y, color) => data.set(color, (y * width + x) * 4);

test('color distance is deterministic and ignores hidden RGB in transparent pixels', () => {
  assert.equal(eraserColorDistance([255, 0, 0, 0], [0, 255, 0, 0]), 0);
  assert.equal(eraserColorDistance([10, 20, 30, 255], [14, 12, 35, 250]), 8);
  assert.equal(eraserColorMatches([20, 20, 20, 255], [30, 20, 20, 255], 10), true);
  assert.equal(eraserColorMatches([20, 20, 20, 255], [30, 20, 20, 255], 9), false);
});

test('Magic Eraser removes only the connected matching region and preserves source bytes', () => {
  const source = rgba(7, 3, [12, 12, 12, 255]);
  // Two disconnected red islands in a neutral field.
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [5, 1]]) setPixel(source, 7, x, y, [220, 20, 20, 255]);
  const original = source.slice();
  const result = applyMagicEraser(source, { width: 7, height: 3, x: 1, y: 1, tolerance: 0, contiguous: true });
  assert.equal(result.changed, true);
  assert.deepEqual(pixel(result.pixels, 7, 1, 1), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 7, 2, 1), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 7, 1, 2), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 7, 5, 1), [220, 20, 20, 255]);
  assert.deepEqual(source, original);
  assert.equal(result.mask[1 * 7 + 1], 255);
  assert.equal(result.mask[1 * 7 + 5], 0);
});

test('Magic Eraser non-contiguous mode removes every matching island', () => {
  const source = rgba(7, 1, [1, 2, 3, 255]);
  setPixel(source, 7, 0, 0, [220, 20, 20, 255]);
  setPixel(source, 7, 3, 0, [220, 20, 20, 255]);
  setPixel(source, 7, 6, 0, [220, 20, 20, 255]);
  const result = applyMagicEraser(source, { width: 7, height: 1, x: 0, y: 0, contiguous: false, tolerance: 0 });
  assert.deepEqual(pixel(result.pixels, 7, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 7, 3, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 7, 6, 0), [0, 0, 0, 0]);
  assert.equal(result.mask.filter(Boolean).length, 3);
});

test('Magic Eraser tolerance is inclusive, supports transparent samples, and clips points like Canvas', () => {
  const source = rgba(4, 2, [0, 0, 0, 0]);
  setPixel(source, 4, 0, 0, [100, 100, 100, 255]);
  setPixel(source, 4, 1, 0, [110, 100, 100, 255]);
  setPixel(source, 4, 2, 0, [111, 100, 100, 255]);
  // Transparent pixels with arbitrary hidden RGB all match a transparent sample.
  setPixel(source, 4, 1, 1, [250, 1, 99, 0]);
  const result = applyMagicEraser(source, { width: 4, height: 2, x: -5, y: -3, tolerance: 10, contiguous: false });
  assert.deepEqual(pixel(result.pixels, 4, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 4, 1, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 4, 2, 0), [111, 100, 100, 255]);
  const transparent = applyMagicEraser(source, { width: 4, height: 2, x: 1, y: 1, tolerance: 0, contiguous: false });
  assert.deepEqual(pixel(transparent.pixels, 4, 1, 1), [0, 0, 0, 0]);
});

test('Magic Eraser opacity makes a repeatable partial alpha edit and no-op at zero', () => {
  const source = rgba(2, 1, [40, 50, 60, 255]);
  const original = source.slice();
  const noOp = applyMagicEraser(source, { width: 2, height: 1, x: 0, y: 0, opacity: 0 });
  assert.equal(noOp.changed, false);
  assert.deepEqual(noOp.pixels, original);
  const half = applyMagicEraser(source, { width: 2, height: 1, x: 0, y: 0, opacity: 0.5 });
  assert.equal(alpha(half.pixels, 2, 0, 0), 128);
  assert.deepEqual(pixel(half.pixels, 2, 0, 0).slice(0, 3), [40, 50, 60]);
  const repeat = applyMagicEraser(source, { width: 2, height: 1, x: 0, y: 0, opacity: 0.5 });
  assert.deepEqual(repeat.pixels, half.pixels);
});

test('Background Eraser applies a hard clipped stamp to the connected sampled background', () => {
  const source = rgba(8, 5, [245, 245, 245, 255]);
  // A disconnected same-color island sits inside the brush footprint.
  for (let y = 1; y <= 3; y += 1)
    for (let x = 3; x <= 4; x += 1) setPixel(source, 8, x, y, [20, 80, 200, 255]);
  setPixel(source, 8, 7, 2, [245, 245, 245, 255]);
  const original = source.slice();
  const result = applyBackgroundEraser(source, {
    width: 8, height: 5, x: 0, y: 0, size: 5, hardness: 100, tolerance: 0, contiguous: true,
  });
  assert.equal(result.changed, true);
  assert.deepEqual(pixel(result.pixels, 8, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 8, 3, 2), [20, 80, 200, 255]);
  assert.deepEqual(pixel(result.pixels, 8, 7, 2), [245, 245, 245, 255]);
  assert.deepEqual(source, original);
  assert.deepEqual(result.bounds, { left: 0, top: 0, right: 3, bottom: 3 });
});

test('Background Eraser non-contiguous mode removes matching pixels in disconnected brush areas', () => {
  const source = rgba(9, 1, [15, 15, 15, 255]);
  setPixel(source, 9, 1, 0, [220, 220, 220, 255]);
  setPixel(source, 9, 4, 0, [220, 220, 220, 255]);
  setPixel(source, 9, 7, 0, [220, 220, 220, 255]);
  const result = applyBackgroundEraser(source, {
    width: 9, height: 1, x: 4, y: 0, size: 9, hardness: 100, tolerance: 0,
    contiguous: false, target: [220, 220, 220, 255],
  });
  assert.deepEqual(pixel(result.pixels, 9, 1, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 9, 4, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 9, 7, 0), [0, 0, 0, 0]);
});

test('Background Eraser preserves opaque/transparent color edges while soft hardness removes partial alpha', () => {
  const source = rgba(7, 1, [255, 255, 255, 255]);
  setPixel(source, 7, 3, 0, [30, 50, 90, 255]);
  // Anti-aliased edge is close in RGB but differs in alpha; low tolerance keeps it.
  setPixel(source, 7, 2, 0, [255, 255, 255, 140]);
  const result = applyBackgroundEraser(source, {
    width: 7, height: 1, x: 0, y: 0, size: 5, hardness: 0, tolerance: 10, contiguous: true,
  });
  assert.deepEqual(pixel(result.pixels, 7, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(pixel(result.pixels, 7, 2, 0), [255, 255, 255, 140]);
  assert.deepEqual(pixel(result.pixels, 7, 3, 0), [30, 50, 90, 255]);
  assert.ok(alpha(result.pixels, 7, 1, 0) > 0 && alpha(result.pixels, 7, 1, 0) < 255);
});

test('Background Eraser stroke samples source immutably and preserves nonmatching foreground', () => {
  const source = rgba(8, 2, [240, 240, 240, 255]);
  for (let y = 0; y < 2; y += 1) setPixel(source, 8, 4, y, [20, 30, 220, 255]);
  const destination = source.slice();
  const originalSource = source.slice();
  const result = applyBackgroundEraserStroke(source, destination, {
    width: 8, height: 2, x1: 0, y1: 0, x2: 7, y2: 1, size: 3, tolerance: 0, opacity: 1,
    target: [240, 240, 240, 255],
  });
  assert.equal(result.changed, true);
  assert.deepEqual(source, originalSource);
  assert.deepEqual(pixel(result.pixels, 8, 4, 0), [20, 30, 220, 255]);
  assert.deepEqual(pixel(result.pixels, 8, 0, 0), [0, 0, 0, 0]);
  assert.ok(result.mask.some(Boolean));
  const repeat = applyBackgroundEraserStroke(source, destination, {
    width: 8, height: 2, x1: 0, y1: 0, x2: 7, y2: 1, size: 3, tolerance: 0, opacity: 1,
    target: [240, 240, 240, 255],
  });
  assert.deepEqual(repeat.pixels, result.pixels);
});

test('Background Eraser stroke opacity reduces alpha without changing RGB until fully clear', () => {
  const source = rgba(3, 1, [120, 130, 140, 255]);
  const result = applyBackgroundEraserStroke(source, source, {
    width: 3, height: 1, x1: 1, y1: 0, x2: 1, y2: 0, size: 1, tolerance: 0,
    opacity: 0.5, target: [120, 130, 140, 255],
  });
  assert.equal(alpha(result.pixels, 3, 1, 0), 128);
  assert.deepEqual(pixel(result.pixels, 3, 1, 0).slice(0, 3), [120, 130, 140]);
});

test('invalid eraser dimensions, pixels, points, colors, tolerance, settings and stroke sizes are rejected', () => {
  const source = rgba(2, 2, [1, 2, 3, 255]);
  assert.throws(() => applyMagicEraser(source, { width: 0, height: 2, x: 0, y: 0 }), /dimensions/);
  assert.throws(() => applyMagicEraser(new Uint8ClampedArray(3), { width: 2, height: 2, x: 0, y: 0 }), /source/);
  assert.throws(() => applyMagicEraser(source, { width: 2, height: 2, x: Number.NaN, y: 0 }), /point/);
  assert.throws(() => applyMagicEraser(source, { width: 2, height: 2, x: 0, y: 0, tolerance: 256 }), /tolerance/);
  assert.throws(() => applyMagicEraser(source, { width: 2, height: 2, x: 0, y: 0, opacity: -1 }), /opacity/);
  assert.throws(() => applyMagicEraser(source, { width: 2, height: 2, x: 0, y: 0, contiguous: 'yes' }), /contiguous/);
  assert.throws(() => applyMagicEraser(source, { width: 2, height: 2, x: 0, y: 0, target: [1, 2, 3] }), /color/);
  assert.throws(() => applyBackgroundEraser(source, { width: 2, height: 2, x: 0, y: 0, size: 0 }), /size/);
  assert.throws(() => applyBackgroundEraser(source, { width: 2, height: 2, x: 0, y: 0, size: 1, hardness: 101 }), /hardness/);
  assert.throws(() => applyBackgroundEraserStroke(source, source, {
    width: 2, height: 2, x1: 0, y1: 0, x2: 1, y2: 1, size: 1, target: [1, 2, 3, 255], tolerance: -1,
  }), /tolerance/);
});

test('named aliases resolve to the immutable operations', () => {
  assert.equal(magicEraser, applyMagicEraser);
  assert.equal(backgroundEraser, applyBackgroundEraser);
});

test('Background Eraser stroke hardness softens the dab edge', () => {
  const width = 101, height = 1, white = rgba(width, height, [255, 255, 255, 255]);
  const dab = (hardness) => applyBackgroundEraserStroke(white, white, {
    width, height, x1: 50, y1: 0, x2: 50, y2: 0, size: 100, tolerance: 0, opacity: 1, hardness,
    target: [255, 255, 255, 255],
  }).pixels;
  const hard = dab(100), soft = dab(0);
  assert.equal(alpha(hard, width, 50, 0), 0);
  assert.equal(alpha(hard, width, 90, 0), 0);
  assert.equal(alpha(soft, width, 50, 0), 0);
  // 40 px out of a 50 px radius: partly erased when soft, gone when hard.
  assert.ok(alpha(soft, width, 90, 0) > 0 && alpha(soft, width, 90, 0) < 255);
  assert.ok(alpha(soft, width, 90, 0) > alpha(soft, width, 70, 0));
});
