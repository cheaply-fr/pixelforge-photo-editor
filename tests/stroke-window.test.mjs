import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cropAlpha,
  cropRgba,
  pasteRgba,
  pixelsDiffer,
  strokeWindow,
  strokeWindowReach,
  windowPoint,
  windowedCanvasStroke,
} from '../src/strokeWindow.ts';
import { applyDodgeBurnStroke, applySpongeStroke } from '../src/tonal.ts';
import { applySmudgeStroke } from '../src/smudge.ts';
import { applyRetouchStroke } from '../src/retouch.ts';
import {
  DEFAULT_ART_HISTORY_BRUSH,
  DEFAULT_HISTORY_BRUSH,
  DEFAULT_MIXER_BRUSH,
  applyArtHistoryBrushPixels,
  applyHistoryBrushPixels,
  applyMixerBrushPixels,
  interpolateBrushStrokePoints,
} from '../src/mixerHistoryBrush.ts';
import { applyBackgroundEraserStroke, eraseBackgroundStroke } from '../src/erasers.ts';
import { replaceColorStroke } from '../src/document.ts';

// Deterministic pseudo-random numbers so a failure is reproducible.
const random = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const noise = (width, height, next, { transparentEvery = 0 } = {}) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = Math.floor(next() * 256);
    pixels[index * 4 + 1] = Math.floor(next() * 256);
    pixels[index * 4 + 2] = Math.floor(next() * 256);
    pixels[index * 4 + 3] = transparentEvery && index % transparentEvery === 0 ? 0 : 128 + Math.floor(next() * 128);
  }
  return pixels;
};
const mask = (width, height, next) => {
  const out = new Uint8ClampedArray(width * height);
  for (let index = 0; index < out.length; index += 1) out[index] = next() < 0.2 ? 0 : Math.floor(next() * 256);
  return out;
};

/**
 * Array-backed stand-in for a 2D canvas. It records every pixel read and
 * write so the tests can prove a segment touched only its window.
 */
class FakeCanvas {
  constructor(width, height, pixels) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(pixels ?? width * height * 4);
    this.readPixels = 0;
    this.writes = 0;
    const canvas = this;
    this.context = {
      getImageData(x, y, w, h) {
        canvas.readPixels += w * h;
        return { data: cropRgba(canvas.pixels, canvas.width, { x, y, width: w, height: h }), width: w, height: h };
      },
      putImageData(image, x, y) {
        canvas.writes += 1;
        pasteRgba(canvas.pixels, canvas.width, { x, y, width: image.width, height: image.height }, image.data);
      },
      createImageData(w, h) {
        return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      },
    };
  }
  getContext() {
    return this.context;
  }
}

/** A random stroke point, sometimes near or beyond the raster edge. */
const point = (width, height, next) => ({
  x: -6 + next() * (width + 12),
  y: -6 + next() * (height + 12),
});

test('strokeWindow bounds the points plus reach and clamps to the raster', () => {
  assert.deepEqual(strokeWindow([{ x: 10.5, y: 20.25 }, { x: 30, y: 22 }], 4, 100, 100), {
    x: 6, y: 16, width: 34 + 1 - 6, height: 26 + 1 - 16,
  });
  assert.deepEqual(strokeWindow([{ x: 1, y: 1 }], 5, 8, 6), { x: 0, y: 0, width: 7, height: 6 });
  assert.deepEqual(strokeWindow([{ x: 1, y: 1 }], 9, 8, 6), { x: 0, y: 0, width: 8, height: 6 });
  assert.equal(strokeWindow([{ x: -50, y: -50 }], 4, 100, 100), null);
  assert.equal(strokeWindow([{ x: 150, y: 10 }], 4, 100, 100), null);
  assert.equal(strokeWindow([], 4, 100, 100), null);
  assert.equal(strokeWindow([{ x: Number.NaN, y: 1 }], 4, 100, 100), null);
  assert.equal(strokeWindow([{ x: 1, y: 1 }], Number.POSITIVE_INFINITY, 100, 100), null);
  // A segment far from the edges stays small whatever the raster size.
  const window = strokeWindow([{ x: 1300, y: 2000 }, { x: 1310, y: 2004 }], strokeWindowReach.tonal(80), 2646, 4096);
  assert.ok(window.width * window.height < 120 * 120);
});

test('every reach covers the brush radius and grows with the kernel read margin', () => {
  for (const size of [1, 2, 7, 80, 500]) {
    for (const reach of [
      strokeWindowReach.tonal(size),
      strokeWindowReach.smudge(size),
      strokeWindowReach.retouch(size),
      strokeWindowReach.mixer(size),
      strokeWindowReach.artHistory(size, 4),
      strokeWindowReach.sampled(size),
    ])
      assert.ok(reach >= size / 2 + 1, `size ${size}`);
    assert.ok(strokeWindowReach.smudge(size) >= size / 2 + size * 0.25 + 1);
    assert.ok(strokeWindowReach.retouch(size) >= size / 2 + 4 + 1);
    assert.ok(strokeWindowReach.artHistory(size, 24) >= size / 2 + 24 + 1);
  }
  assert.ok(Number.isFinite(strokeWindowReach.tonal(Number.NaN)));
  assert.ok(Number.isFinite(strokeWindowReach.artHistory(10, Number.NaN)));
});

test('crop, paste and windowPoint round-trip', () => {
  const next = random(3), pixels = noise(9, 7, next), rect = { x: 2, y: 1, width: 4, height: 5 };
  const window = cropRgba(pixels, 9, rect);
  assert.equal(window.length, 4 * 5 * 4);
  assert.deepEqual(Array.from(window.slice(0, 4)), Array.from(pixels.slice((1 * 9 + 2) * 4, (1 * 9 + 2) * 4 + 4)));
  const copy = new Uint8ClampedArray(pixels.length);
  pasteRgba(copy, 9, rect, window);
  for (let y = 0; y < 7; y += 1)
    for (let x = 0; x < 9; x += 1) {
      const inside = x >= 2 && x < 6 && y >= 1 && y < 6, offset = (y * 9 + x) * 4;
      assert.deepEqual(Array.from(copy.slice(offset, offset + 4)), inside ? Array.from(pixels.slice(offset, offset + 4)) : [0, 0, 0, 0]);
    }
  const alpha = mask(9, 7, next), cropped = cropAlpha(alpha, 9, rect);
  assert.equal(cropped[0], alpha[1 * 9 + 2]);
  assert.equal(cropped[cropped.length - 1], alpha[5 * 9 + 5]);
  assert.deepEqual(windowPoint({ x: 5.5, y: 3.25, pressure: 0.5 }, rect), { x: 3.5, y: 2.25, pressure: 0.5 });
  assert.equal(pixelsDiffer(window, cropRgba(pixels, 9, rect)), false);
  assert.equal(pixelsDiffer(window, new Uint8ClampedArray(window.length)), true);
});

/**
 * Run `segments` of a tool both ways: the full-layer kernel on whole arrays
 * (the previous behaviour) and the windowed canvas path. Both must give the
 * same bytes and the same changed flags.
 */
function compareTool({ name, width, height, seed, segments, reach, full, windowed, withSelection, withSource = true }) {
  const next = random(seed),
    source = noise(width, height, next, { transparentEvery: 7 }),
    selection = withSelection ? mask(width, height, next) : undefined;
  let expected = new Uint8ClampedArray(source);
  const sourceCanvas = new FakeCanvas(width, height, source),
    buffer = new FakeCanvas(width, height, source);
  let previous = point(width, height, next);
  for (let index = 0; index < segments; index += 1) {
    const to = index % 5 === 4 ? previous : point(width, height, next);
    const result = full({ source, destination: expected, from: previous, to, selection });
    const before = buffer.readPixels;
    const changed = windowed({
      sourceCanvas: withSource ? sourceCanvas : undefined,
      source,
      buffer,
      from: previous,
      to,
      selection,
      reach: reach(),
    });
    expected = result.pixels;
    assert.equal(changed, result.changed, `${name} segment ${index} changed flag`);
    assert.deepEqual(buffer.pixels, expected, `${name} segment ${index} pixels`);
    const window = strokeWindow([previous, to], reach(), width, height);
    assert.ok(buffer.readPixels - before <= (window ? window.width * window.height : 0), `${name} reads only its window`);
    previous = to;
  }
}

const SIZES = [1, 3, 8, 17];
const windowedRun = (apply, tool) => ({ sourceCanvas, buffer, from, to, selection, reach }) =>
  windowedCanvasStroke(
    buffer,
    strokeWindow([from, to], reach, buffer.width, buffer.height),
    (input) => apply(input, windowPoint(from, input.rect), windowPoint(to, input.rect)),
    { source: sourceCanvas, selectionMask: selection, tool },
  );

for (const mode of ['dodge', 'burn']) {
  for (const size of SIZES) {
    test(`windowed ${mode} (size ${size}) equals the full-layer stroke, with and without a selection`, () => {
      for (const withSelection of [false, true]) {
        const settings = { size, hardness: 40, exposure: 0.6, flow: 0.8, range: 'midtones', mode };
        compareTool({
          name: mode,
          width: 41,
          height: 29,
          seed: size * 31 + (withSelection ? 7 : 0),
          segments: 14,
          withSelection,
          reach: () => strokeWindowReach.tonal(size),
          full: ({ source, destination, from, to, selection }) =>
            applyDodgeBurnStroke(source, destination, {
              width: 41, height: 29, x1: from.x, y1: from.y, x2: to.x, y2: to.y, ...settings, selectionMask: selection,
            }),
          windowed: windowedRun(({ source, destination, selectionMask, width, height }, a, b) =>
            applyDodgeBurnStroke(source, destination, {
              width, height, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...settings, selectionMask,
            }), mode),
        });
      }
    });
  }
}

for (const spongeMode of ['saturate', 'desaturate']) {
  test(`windowed sponge ${spongeMode} equals the full-layer stroke`, () => {
    for (const size of SIZES)
      for (const withSelection of [false, true]) {
        const settings = { size, hardness: 70, amount: 0.7, flow: 0.9, mode: spongeMode };
        compareTool({
          name: 'sponge',
          width: 37,
          height: 33,
          seed: size * 13 + (withSelection ? 3 : 0),
          segments: 10,
          withSelection,
          reach: () => strokeWindowReach.tonal(size),
          full: ({ source, destination, from, to, selection }) =>
            applySpongeStroke(source, destination, {
              width: 37, height: 33, x1: from.x, y1: from.y, x2: to.x, y2: to.y, ...settings, selectionMask: selection,
            }),
          windowed: windowedRun(({ source, destination, selectionMask, width, height }, a, b) =>
            applySpongeStroke(source, destination, {
              width, height, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...settings, selectionMask,
            }), 'sponge'),
        });
      }
  });
}

test('windowed smudge equals the full-layer stroke, including samples behind the brush', () => {
  for (const size of [...SIZES, 30])
    for (const withSelection of [false, true]) {
      const settings = { size, hardness: 55, flow: 0.85 };
      compareTool({
        name: 'smudge',
        width: 45,
        height: 31,
        seed: size * 17 + (withSelection ? 5 : 0),
        segments: 12,
        withSelection,
        reach: () => strokeWindowReach.smudge(size),
        full: ({ source, destination, from, to, selection }) =>
          applySmudgeStroke(source, destination, {
            width: 45, height: 31, x1: from.x, y1: from.y, x2: to.x, y2: to.y, ...settings, selectionMask: selection,
          }),
        windowed: windowedRun(({ source, destination, selectionMask, width, height }, a, b) =>
          applySmudgeStroke(source, destination, {
            width, height, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...settings, selectionMask,
          }), 'smudge'),
      });
    }
});

for (const mode of ['blur', 'sharpen']) {
  test(`windowed ${mode} equals the full-layer stroke, including its neighbourhood reads`, () => {
    // Size 80 gives the largest 4 px averaging radius.
    for (const size of [...SIZES, 40, 80])
      for (const withSelection of [false, true]) {
        const settings = { size, hardness: 35, flow: 0.75, mode };
        compareTool({
          name: mode,
          width: 96,
          height: 70,
          seed: size * 23 + (withSelection ? 11 : 0),
          segments: 8,
          withSelection,
          reach: () => strokeWindowReach.retouch(size),
          full: ({ source, destination, from, to, selection }) =>
            applyRetouchStroke(source, destination, {
              width: 96, height: 70, x1: from.x, y1: from.y, x2: to.x, y2: to.y, ...settings, selectionMask: selection,
            }),
          windowed: windowedRun(({ source, destination, selectionMask, width, height }, a, b) =>
            applyRetouchStroke(source, destination, {
              width, height, x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...settings, selectionMask,
            }), mode),
        });
      }
  });
}

const mixerTools = [
  ['mixer-brush', (size) => ({ ...DEFAULT_MIXER_BRUSH, size, hardness: 60, wet: 70, load: 40 }), applyMixerBrushPixels, (size) => strokeWindowReach.mixer(size)],
  ['history-brush', (size) => ({ ...DEFAULT_HISTORY_BRUSH, size, hardness: 60 }), applyHistoryBrushPixels, (size) => strokeWindowReach.mixer(size)],
  ['art-history-brush', (size) => ({ ...DEFAULT_ART_HISTORY_BRUSH, size, hardness: 60, style: 6, fidelity: 40 }), applyArtHistoryBrushPixels, (size, settings) => strokeWindowReach.artHistory(size, settings.style)],
];
for (const [toolName, settingsFor, kernel, reachFor] of mixerTools) {
  const tool = String(toolName);
  test(`windowed ${tool} dabs equal the full-layer dabs, reading the source array only in the window`, () => {
    for (const size of [2, 9, 21])
      for (const withSelection of [false, true]) {
        const width = 52, height = 38, next = random(size * 41 + (withSelection ? 1 : 0) + tool.length),
          historical = noise(width, height, next, { transparentEvery: 9 }),
          current = noise(width, height, next),
          selection = withSelection ? mask(width, height, next) : undefined,
          settings = settingsFor(size),
          buffer = new FakeCanvas(width, height, current);
        let expected = new Uint8ClampedArray(current), last = { ...point(width, height, next), pressure: 1 };
        for (let segment = 0; segment < 8; segment += 1) {
          const to = { ...point(width, height, next), pressure: 0.5 + next() / 2 },
            points = interpolateBrushStrokePoints(last, to, Math.max(1, size * 0.35));
          const full = kernel(expected, historical, width, height, points, settings, selection);
          const changed = windowedCanvasStroke(
            buffer,
            strokeWindow(points, reachFor(size, settings), width, height),
            ({ source, destination, selectionMask, rect, width: w, height: h }) => ({
              pixels: kernel(destination, source, w, h, points.map((item) => windowPoint(item, rect)), settings, selectionMask),
            }),
            { source: historical, selectionMask: selection, tool },
          );
          assert.equal(changed, pixelsDiffer(full, expected), `${tool} segment ${segment} changed flag`);
          expected = full;
          assert.deepEqual(buffer.pixels, expected, `${tool} size ${size} segment ${segment}`);
          last = to;
        }
      }
  });
}

test('the Background Eraser canvas helper reads only the segment window and matches the full kernel', () => {
  const width = 48, height = 36, next = random(99), target = [200, 40, 40, 255];
  const source = noise(width, height, next);
  // Plant target-coloured pixels so the eraser has something to remove.
  for (let index = 0; index < width * height; index += 3) source.set(target, index * 4);
  for (const size of [2, 9, 20]) {
    const sourceCanvas = new FakeCanvas(width, height, source), output = new FakeCanvas(width, height, source);
    let expected = new Uint8ClampedArray(source), from = point(width, height, next);
    for (let segment = 0; segment < 10; segment += 1) {
      const to = point(width, height, next);
      const full = applyBackgroundEraserStroke(source, expected, {
        width, height, x1: from.x, y1: from.y, x2: to.x, y2: to.y, size, tolerance: 30, opacity: 0.8, target,
      });
      const reads = output.readPixels;
      const changed = eraseBackgroundStroke(sourceCanvas, output, target, from.x, from.y, to.x, to.y, size, 30, 0.8);
      assert.equal(changed, full.changed);
      expected = full.pixels;
      assert.deepEqual(output.pixels, expected, `size ${size} segment ${segment}`);
      const window = strokeWindow([from, to], strokeWindowReach.sampled(size), width, height);
      assert.ok(output.readPixels - reads <= (window ? window.width * window.height : 0));
      from = to;
    }
  }
});

test('Color Replacement reads and writes only the segment window, in layer coordinates', () => {
  const width = 40, height = 30, next = random(5), target = [10, 200, 30, 255];
  const source = noise(width, height, next);
  for (let index = 0; index < width * height; index += 2) source.set(target, index * 4);
  const sourceCanvas = new FakeCanvas(width, height, source), output = new FakeCanvas(width, height, source);
  const changed = replaceColorStroke(sourceCanvas, output, target, 20.4, 15.2, 24.8, 16.1, '#ff0000', 6, 0, 1);
  assert.equal(changed, true);
  assert.ok(sourceCanvas.readPixels < width * height / 2 && output.readPixels < width * height / 2);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4,
        matched = (y * width + x) % 2 === 0,
        // Distance to the nearest of the stamped centres along the segment.
        steps = Math.max(1, Math.ceil(Math.hypot(4.4, 0.9) / 1.5));
      let inside = false;
      for (let step = 0; step <= steps; step += 1) {
        const cx = 20.4 + (4.4 * step) / steps, cy = 15.2 + (0.9 * step) / steps;
        if (Math.hypot(x - cx, y - cy) <= 3) inside = true;
      }
      const expected = matched && inside ? [255, 0, 0, 255] : Array.from(source.slice(offset, offset + 4));
      assert.deepEqual(Array.from(output.pixels.slice(offset, offset + 4)), expected, `${x},${y}`);
    }
  // A segment entirely outside the layer changes nothing and reads nothing.
  const quiet = new FakeCanvas(width, height, source);
  assert.equal(replaceColorStroke(sourceCanvas, quiet, target, -50, -50, -40, -45, '#ff0000', 6, 0, 1), false);
  assert.equal(quiet.readPixels, 0);
});

test('an unchanged window is not written back and a missing window is a no-op', () => {
  const canvas = new FakeCanvas(10, 10, noise(10, 10, random(1)));
  assert.equal(windowedCanvasStroke(canvas, null, () => { throw new Error('not called'); }), false);
  assert.equal(canvas.readPixels, 0);
  const rect = { x: 2, y: 2, width: 3, height: 3 };
  assert.equal(windowedCanvasStroke(canvas, rect, ({ destination }) => ({ pixels: new Uint8ClampedArray(destination) })), false);
  assert.equal(canvas.writes, 0);
  assert.equal(windowedCanvasStroke(canvas, rect, ({ destination, width, height }) => {
    assert.equal(width, 3);
    assert.equal(height, 3);
    const pixels = new Uint8ClampedArray(destination);
    pixels[0] = pixels[0] ^ 1;
    return { pixels };
  }), true);
  assert.equal(canvas.writes, 1);
  assert.equal(canvas.readPixels, 18);
});

test('a long stroke on a poster-sized layer processes a few brush areas, not the layer', () => {
  // 2646 x 4096 would allocate 43 MB per array; the window plan alone shows
  // the per-move cost is bounded by the brush, independent of layer size.
  const layerPixels = 2646 * 4096;
  let processed = 0, previous = { x: 600, y: 900 };
  for (let move = 1; move <= 25; move += 1) {
    const to = { x: 600 + move * 12, y: 900 + move * 3 };
    const window = strokeWindow([previous, to], strokeWindowReach.tonal(80), 2646, 4096);
    processed += window.width * window.height;
    previous = to;
  }
  assert.ok(processed < layerPixels / 30, `${processed} of ${layerPixels}`);
});
