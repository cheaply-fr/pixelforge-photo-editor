import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alphaBounds,
  selectionFeatherReach,
  selectionParts,
  selectionPartsBounds,
  selectionRenderRect,
} from '../src/selectionBounds.ts';
import { CANVAS_FEATHER_THRESHOLD, FEATHER_BOX_PASSES, extendedBoxKernel, featherAlpha } from '../src/selectionFeather.ts';

// renderSelection resolves feathered alpha only inside selectionRenderRect
// (docs/selection-feather-contract.md, "Large documents"). These tests model
// that pipeline on pure alpha planes and require the bounded result to equal
// the full-canvas one.

const inside = (part, x, y) => {
  if (part.shape === 'ellipse') {
    const rx = part.w / 2, ry = part.h / 2;
    return ((x - part.x - rx) / rx) ** 2 + ((y - part.y - ry) / ry) ** 2 <= 1;
  }
  if (part.shape === 'polygon') {
    let hit = false;
    const points = part.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const a = points[i], b = points[j];
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  }
  return x >= part.x && x < part.x + part.w && y >= part.y && y < part.y + part.h;
};

/** Composed coverage of `rect` (document coordinates), sampled at pixel centres. */
const rasterize = (selection, rect) => {
  const plane = new Uint8ClampedArray(rect.w * rect.h);
  for (const part of selectionParts(selection))
    for (let row = 0; row < rect.h; row += 1)
      for (let column = 0; column < rect.w; column += 1) {
        const index = row * rect.w + column,
          hit = inside(part, rect.x + column + 0.5, rect.y + row + 0.5);
        if (part.operation === 'replace') plane[index] = hit ? 255 : 0;
        else if (part.operation === 'add' && hit) plane[index] = 255;
        else if (part.operation === 'subtract' && hit) plane[index] = 0;
        else if (part.operation === 'intersect' && !hit) plane[index] = 0;
      }
  return plane;
};

/** Feather and invert within `rect`, then place it on a `w × h` plane like renderSelection. */
const resolve = (selection, w, h, rect) => {
  let region = rasterize(selection, rect);
  if (selection.feather > 0) region = featherAlpha(region, rect.w, rect.h, selection.feather);
  if (selection.inverted) region = region.map((value) => 255 - value);
  const plane = new Uint8ClampedArray(w * h).fill(selection.inverted ? 255 : 0);
  for (let row = 0; row < rect.h; row += 1)
    plane.set(region.subarray(row * rect.w, (row + 1) * rect.w), (rect.y + row) * w + rect.x);
  return plane;
};

/** Nearest-neighbour affine resample, as the selection matrix is applied after resolving alpha. */
const transform = (plane, w, h, [a, b, c, d, e, f]) => {
  const out = new Uint8ClampedArray(w * h), det = a * d - b * c;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const u = x + 0.5 - e, v = y + 0.5 - f;
      const sx = Math.floor((d * u - c * v) / det), sy = Math.floor((-b * u + a * v) / det);
      if (sx >= 0 && sy >= 0 && sx < w && sy < h) out[y * w + x] = plane[sy * w + sx];
    }
  return out;
};

const base = { shape: 'rectangle', x: 0, y: 0, w: 1, h: 1, feather: 0, inverted: false };
const W = 160, H = 120;
const cases = {
  ellipse: { ...base, shape: 'ellipse', x: 60.5, y: 40.25, w: 30, h: 22, feather: 5.5 },
  inverted: { ...base, shape: 'ellipse', x: 60.5, y: 40.25, w: 30, h: 22, feather: 3.2, inverted: true },
  'edge rectangle': { ...base, x: 0, y: 0, w: 20, h: 15, feather: 7 },
  polygon: {
    ...base, shape: 'polygon', x: 90, y: 20, w: 40, h: 50, feather: 1.2,
    points: [{ x: 90, y: 20 }, { x: 130, y: 35.5 }, { x: 100.25, y: 70 }],
  },
  'multi-part': {
    ...base, feather: 4.4, inverted: true, parts: [
      { shape: 'ellipse', x: 10, y: 10, w: 40, h: 30, operation: 'replace' },
      { shape: 'rectangle', x: 110, y: 80, w: 30, h: 25, operation: 'add' },
      { shape: 'rectangle', x: 20, y: 15, w: 10, h: 10, operation: 'subtract' },
      { shape: 'rectangle', x: 0, y: 0, w: 145, h: 100, operation: 'intersect' },
    ],
  },
  'replace resets bounds': {
    ...base, feather: 2, parts: [
      { shape: 'rectangle', x: 0, y: 0, w: 150, h: 110, operation: 'replace' },
      { shape: 'ellipse', x: 70, y: 50, w: 12, h: 9, operation: 'replace' },
    ],
  },
  'largest exact radius': { ...base, shape: 'ellipse', x: 70, y: 50, w: 20, h: 16, feather: CANVAS_FEATHER_THRESHOLD - 0.1 },
};

for (const [name, selection] of Object.entries(cases))
  test(`bounded feathering equals the full-canvas render: ${name}`, () => {
    const rect = selectionRenderRect(selection, W, H);
    const full = resolve(selection, W, H, { x: 0, y: 0, w: W, h: H });
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= W && rect.y + rect.h <= H, JSON.stringify(rect));
    // The region is a real crop, so the equality below is not trivial.
    assert.ok(rect.w * rect.h < W * H, JSON.stringify(rect));
    assert.deepEqual(resolve(selection, W, H, rect), full);
    // The selection matrix is applied to the resolved plane, so it inherits the equality.
    const matrix = [0.8, 0.35, -0.3, 0.9, 20.5, -6];
    assert.deepEqual(transform(resolve(selection, W, H, rect), W, H, matrix), transform(full, W, H, matrix));
  });

test('a small feathered selection on a large canvas resolves a small region, quickly', () => {
  const w = 2646, h = 4096;
  const selection = { ...base, shape: 'ellipse', x: 1000, y: 1500, w: 600, h: 600, feather: 8 };
  const rect = selectionRenderRect(selection, w, h);
  assert.ok(rect.w * rect.h < (w * h) / 15, JSON.stringify(rect));
  const started = performance.now();
  resolve(selection, w, h, rect);
  const bounded = performance.now() - started;
  // About 0.4 MP instead of 10.8 MP of box passes; the bound leaves headroom
  // for slow runners (the full canvas takes several seconds in the browser).
  assert.ok(bounded < 1500, `${bounded.toFixed(0)} ms`);
  // Canvas-blur radii pad by 3σ plus a margin.
  const soft = selectionRenderRect({ ...selection, feather: 40 }, w, h);
  assert.deepEqual(soft, { x: 1000 - 1 - 124, y: 1500 - 1 - 124, w: 600 + 2 * (1 + 124), h: 600 + 2 * (1 + 124) });
  assert.ok(soft.w * soft.h < (w * h) / 8, JSON.stringify(soft));
});

test('feather reach covers the blur support', () => {
  assert.equal(selectionFeatherReach(0), 0);
  assert.equal(selectionFeatherReach(Number.NaN), 0);
  // The exact box filter's support is passes × (radius + 1).
  assert.equal(selectionFeatherReach(1.2), FEATHER_BOX_PASSES * (extendedBoxKernel(1.2).radius + 1));
  for (const sigma of [0.5, 1, 2.5, 8, 15.9]) {
    const size = 2 * selectionFeatherReach(sigma) + 3, plane = new Uint8ClampedArray(size * size);
    plane[Math.floor(size / 2) * size + Math.floor(size / 2)] = 255;
    const blurred = featherAlpha(plane, size, size, sigma);
    // Nothing reaches the border of a plane sized to the reach.
    for (let i = 0; i < size; i += 1) {
      assert.equal(blurred[i], 0, `sigma ${sigma}`);
      assert.equal(blurred[i * size], 0, `sigma ${sigma}`);
    }
  }
  // Canvas blur: the Gaussian tail beyond the reach is under half an alpha step.
  for (const sigma of [16, 40, 200, 1000]) {
    const z = selectionFeatherReach(sigma) / sigma;
    const tail = 0.5 * Math.exp(-(z * z) / 2) / (z * Math.sqrt(Math.PI / 2)) * 255;
    assert.ok(tail < 0.5, `sigma ${sigma}: ${tail}`);
  }
});

test('bounds follow part operations and empty selections fall back to a 1 px region', () => {
  const box = selectionPartsBounds([
    { shape: 'rectangle', x: 10, y: 10, w: 10, h: 10, operation: 'replace' },
    { shape: 'rectangle', x: 30.5, y: 5, w: 10, h: 10, operation: 'add' },
    { shape: 'rectangle', x: 0, y: 0, w: 100, h: 100, operation: 'subtract' },
  ]);
  assert.deepEqual(box, { x0: 9, y0: 4, x1: 42, y1: 21 });
  assert.equal(selectionPartsBounds([
    { shape: 'rectangle', x: 0, y: 0, w: 10, h: 10, operation: 'replace' },
    { shape: 'rectangle', x: 50, y: 50, w: 10, h: 10, operation: 'intersect' },
  ]), null);
  const empty = { ...base, feather: 30, inverted: true, parts: [
    { shape: 'rectangle', x: 0, y: 0, w: 10, h: 10, operation: 'replace' },
    { shape: 'rectangle', x: 0, y: 0, w: 10, h: 10, operation: 'subtract' },
  ] };
  const rect = selectionRenderRect(empty, 50, 40);
  assert.ok(rect.w >= 1 && rect.h >= 1);
  assert.ok(resolve(empty, 50, 40, rect).every((value) => value === 255));
  assert.deepEqual(selectionRenderRect(base, 50, 40, null), { x: 0, y: 0, w: 1, h: 1 });
  // A color mask's bounds are its nonzero pixels (RGBA stride).
  const rgba = new Uint8ClampedArray(8 * 6 * 4);
  rgba[(2 * 8 + 3) * 4 + 3] = 9;
  rgba[(4 * 8 + 6) * 4 + 3] = 255;
  assert.deepEqual(alphaBounds(rgba, 8, 6, 4, 3), { x0: 3, y0: 2, x1: 7, y1: 5 });
  assert.equal(alphaBounds(new Uint8ClampedArray(12), 4, 3), null);
});
