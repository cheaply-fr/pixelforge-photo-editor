// Edit > Stroke Selection… (docs/stroke-selection-contract.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STROKE_SELECTION,
  hexRgb,
  MAX_STROKE_WIDTH,
  normalizeStrokeSelectionOptions,
  squaredDistanceTransform,
  STROKE_POSITIONS,
  strokeSelectionAlpha,
  strokeSelectionAlphaReference,
} from '../src/strokeSelection.ts';
import { featherAlpha } from '../src/selectionFeather.ts';
import { composeSelectionAlpha } from '../src/selectionComposition.ts';

const valid = { width: '4', color: '#FF5C35', position: 'center', opacity: '100', mode: 'source-over' };

test('dialog input: width in 0.5 px steps up to 250, whole opacity, known location, hex colour, native mode', () => {
  assert.deepEqual(normalizeStrokeSelectionOptions(valid), {
    width: 4, color: '#ff5c35', position: 'center', opacity: 100, mode: 'source-over',
  });
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, width: '2,5' }).width, 2.5);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, width: 250 }).width, MAX_STROKE_WIDTH);
  for (const width of ['0', '0.5', '251', '2.25', '', 'wide', Number.NaN, Infinity])
    assert.equal(normalizeStrokeSelectionOptions({ ...valid, width }), null, `width ${width}`);
  for (const opacity of ['0', '101', '50.5', '', 'x'])
    assert.equal(normalizeStrokeSelectionOptions({ ...valid, opacity }), null, `opacity ${opacity}`);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, position: 'middle' }), null);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, color: 'red' }), null);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, color: '#fff' }), null);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, mode: 'linear-burn' }), null);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, mode: 'copy' }), null);
  assert.equal(normalizeStrokeSelectionOptions({ ...valid, mode: 'multiply', opacity: 40 }).mode, 'multiply');
  assert.deepEqual(STROKE_POSITIONS.map((item) => item.value), ['inside', 'center', 'outside']);
  assert.equal(DEFAULT_STROKE_SELECTION.position, 'center');
  assert.deepEqual(hexRgb('#0a80ff'), [10, 128, 255]);
  assert.throws(() => hexRgb('blue'), /six-digit/);
});

test('the distance transform is exact Euclidean', () => {
  const width = 9, height = 7, cells = new Uint8Array(width * height);
  cells[3 * width + 4] = 1;
  const squared = squaredDistanceTransform(cells, 1, width, height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) assert.equal(squared[y * width + x], (x - 4) ** 2 + (y - 3) ** 2);
  assert.throws(() => squaredDistanceTransform(new Uint8Array(3), 1, 2, 2), /too small/);
});

/** A w × h plane with a solid rectangle. */
function rectangle(width, height, x0, y0, x1, y1, value = 255) {
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) alpha[y * width + x] = value;
  return alpha;
}
const row = (plane, width, y) => Array.from(plane.subarray(y * width, (y + 1) * width));

test('inside, center and outside bands sit exactly where they should on a rectangle', () => {
  const width = 40, height = 30, alpha = rectangle(width, height, 10, 8, 30, 22);
  const mid = 15; // a row crossing the left and right edges
  const inside = strokeSelectionAlpha(alpha, width, height, 3, 'inside');
  assert.deepEqual(inside.bounds, { x: 10, y: 8, w: 20, h: 14 });
  const insideRow = row(inside.coverage, width, mid);
  assert.deepEqual(insideRow.slice(9, 14), [0, 255, 255, 255, 0]);
  assert.deepEqual(insideRow.slice(26, 31), [0, 255, 255, 255, 0]);

  const outside = strokeSelectionAlpha(alpha, width, height, 3, 'outside');
  assert.deepEqual(outside.bounds, { x: 7, y: 5, w: 26, h: 20 });
  assert.deepEqual(row(outside.coverage, width, mid).slice(6, 11), [0, 255, 255, 255, 0]);
  // Every selected pixel is untouched by an outside stroke.
  for (let index = 0; index < alpha.length; index += 1) if (alpha[index]) assert.equal(outside.coverage[index], 0);

  const center = strokeSelectionAlpha(alpha, width, height, 4, 'center');
  assert.deepEqual(row(center.coverage, width, mid).slice(7, 13), [0, 255, 255, 255, 255, 0]);
  // Odd centre widths straddle the edge with half-coverage at both rims.
  const odd = strokeSelectionAlpha(alpha, width, height, 3, 'center');
  assert.deepEqual(row(odd.coverage, width, mid).slice(7, 13), [0, 128, 255, 255, 128, 0]);
});

test('stroke width is the same on straight, diagonal and curved edges', () => {
  const size = 120, alpha = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) if (Math.hypot(x + 0.5 - 60, y + 0.5 - 60) <= 40) alpha[y * size + x] = 255;
  const { coverage } = strokeSelectionAlpha(alpha, size, size, 6, 'inside');
  // Integrate coverage along rays from the centre at several angles.
  for (const degrees of [0, 30, 45, 60, 90, 135, 200, 315]) {
    const angle = (degrees * Math.PI) / 180;
    let sum = 0;
    for (let r = 20; r <= 45; r += 0.25) {
      const x = Math.floor(60 + r * Math.cos(angle)), y = Math.floor(60 + r * Math.sin(angle));
      sum += coverage[y * size + x] / 255 * 0.25;
    }
    assert.ok(sum > 5 && sum < 7.25, `${degrees}°: band ${sum.toFixed(2)} px`);
  }
});

test('feathered selections are stroked at their 50 % edge, like the marching ants', () => {
  const width = 80, height = 60, hard = rectangle(width, height, 20, 15, 60, 45);
  const soft = featherAlpha(hard, width, height, 6);
  const hardStroke = strokeSelectionAlpha(hard, width, height, 2, 'inside').coverage,
    softStroke = strokeSelectionAlpha(soft, width, height, 2, 'inside').coverage;
  // A symmetric feather keeps the 50 % contour on the original edge (corners round off).
  const sameRow = (y) => assert.deepEqual(row(softStroke, width, y).slice(15, 65), row(hardStroke, width, y).slice(15, 65));
  sameRow(30);
  assert.equal(softStroke[30 * width + 20], 255);
  assert.equal(softStroke[30 * width + 19], 0);
});

test('compound selections (add, subtract, intersect) are stroked along the composed edge', () => {
  const width = 60, height = 40;
  const left = rectangle(width, height, 5, 5, 30, 35), right = rectangle(width, height, 20, 10, 55, 30);
  const added = composeSelectionAlpha(left, right, 'add').mask;
  const subtracted = composeSelectionAlpha(left, right, 'subtract').mask;
  const intersected = composeSelectionAlpha(left, right, 'intersect').mask;
  const y = 20;
  // Add: one outline around the union, nothing at the hidden inner edges (x = 20, x = 29).
  const add = row(strokeSelectionAlpha(added, width, height, 1, 'inside').coverage, width, y);
  assert.equal(add[5], 255);
  assert.equal(add[54], 255);
  assert.equal(add[20], 0);
  assert.equal(add[29], 0);
  // Subtract: the left block loses x ≥ 20, so its right edge is now at x = 19.
  const sub = row(strokeSelectionAlpha(subtracted, width, height, 1, 'inside').coverage, width, y);
  assert.equal(sub[19], 255);
  assert.equal(sub[20], 0);
  // Intersect: only 20 ≤ x < 30 remains.
  const both = strokeSelectionAlpha(intersected, width, height, 1, 'inside');
  assert.deepEqual(both.bounds, { x: 20, y: 10, w: 10, h: 20 });
});

test('selections that touch the canvas edge are stroked along it; empty selections draw nothing', () => {
  const width = 20, height = 10, all = new Uint8ClampedArray(width * height).fill(255);
  const frame = strokeSelectionAlpha(all, width, height, 2, 'inside');
  assert.deepEqual(row(frame.coverage, width, 5).slice(0, 3), [255, 255, 0]);
  assert.equal(frame.coverage[0], 255);
  assert.equal(frame.coverage[5 * width + 10], 0);
  // Outside of Select All falls off the canvas: nothing to draw.
  assert.equal(strokeSelectionAlpha(all, width, height, 2, 'outside').bounds, null);
  const empty = strokeSelectionAlpha(new Uint8ClampedArray(width * height), width, height, 5, 'center');
  assert.equal(empty.bounds, null);
  assert.ok(empty.coverage.every((value) => value === 0));
  // Coverage below 50 % counts as unselected.
  assert.equal(strokeSelectionAlpha(rectangle(width, height, 2, 2, 8, 8, 127), width, height, 2, 'center').bounds, null);
});

test('malformed input is rejected and inputs are never mutated', () => {
  const alpha = rectangle(10, 10, 2, 2, 8, 8), copy = alpha.slice();
  strokeSelectionAlpha(alpha, 10, 10, 3, 'outside');
  assert.deepEqual(alpha, copy);
  assert.throws(() => strokeSelectionAlpha(alpha, 0, 10, 3, 'inside'), /dimensions/);
  assert.throws(() => strokeSelectionAlpha(alpha, 11, 10, 3, 'inside'), /too small/);
  assert.throws(() => strokeSelectionAlpha(alpha, 10, 10, 0, 'inside'), /out of range/);
  assert.throws(() => strokeSelectionAlpha(alpha, 10, 10, 251, 'inside'), /out of range/);
});

test('a lasso-sized stroke on a 3000 × 4000 document stays interactive', () => {
  const width = 3000, height = 4000, alpha = new Uint8ClampedArray(width * height);
  for (let y = 1000; y < 1800; y += 1) for (let x = 900; x < 1700; x += 1) if ((x - 1300) ** 2 + (y - 1400) ** 2 < 380 ** 2) alpha[y * width + x] = 255;
  const started = performance.now();
  const { bounds } = strokeSelectionAlpha(alpha, width, height, 12, 'center');
  const elapsed = performance.now() - started;
  // The disc spans x 921–1679; a 12 px centre stroke reaches 6 px (+ 1 px ramp) beyond it.
  assert.ok(bounds.x >= 921 - 7 && bounds.x <= 921 - 5, `left ${bounds.x}`);
  assert.ok(bounds.x + bounds.w - 1 >= 1679 + 5 && bounds.x + bounds.w - 1 <= 1679 + 7, `right ${bounds.x + bounds.w}`);
  assert.equal(bounds.w, bounds.h);
  assert.ok(elapsed < 4000, `stroke took ${elapsed.toFixed(0)} ms`);
});

test('the tiled band search is byte-identical to transforming the whole grid', () => {
  const width = 301, height = 233;
  const shapes = [];
  // A disc with a hole, a thin diagonal sliver, an edge-touching block, a
  // feathered blob and a scatter of single pixels.
  const disc = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const r = Math.hypot(x - 140, y - 110);
    if (r < 90 && r > 25) disc[y * width + x] = 255;
    if (Math.abs(x - y - 40) < 2) disc[y * width + x] = 200;
    if (x > 260 && y < 40) disc[y * width + x] = 255;
  }
  shapes.push(disc);
  shapes.push(featherAlpha(disc, width, height, 6));
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const scatter = new Uint8ClampedArray(width * height);
  for (let index = 0; index < 400; index += 1) scatter[Math.floor(random() * width * height)] = 255;
  shapes.push(scatter);
  shapes.push(new Uint8ClampedArray(width * height).fill(255));
  for (const alpha of shapes)
    for (const strokeWidth of [1, 2.5, 12, 61, 130, 250])
      for (const position of ['inside', 'center', 'outside']) {
        const tiled = strokeSelectionAlpha(alpha, width, height, strokeWidth, position);
        const reference = strokeSelectionAlphaReference(alpha, width, height, strokeWidth, position);
        assert.deepEqual(tiled.bounds, reference.bounds, `${strokeWidth} ${position}`);
        assert.ok(Buffer.from(tiled.coverage).equals(Buffer.from(reference.coverage)), `${strokeWidth} ${position}`);
      }
});

test('a Center stroke of a near-full 3000 × 4000 marquee takes well under the old 4–5 s', () => {
  const width = 3000, height = 4000, alpha = new Uint8ClampedArray(width * height);
  for (let y = 100; y < 3900; y += 1) alpha.fill(255, y * width + 100, y * width + 2900);
  const started = performance.now();
  const { bounds, coverage } = strokeSelectionAlpha(alpha, width, height, 20, 'center');
  const elapsed = performance.now() - started;
  // A 20 px centre stroke reaches 10 px beyond the edge.
  assert.deepEqual(bounds, { x: 90, y: 90, w: 2820, h: 3820 });
  assert.equal(coverage[2000 * width + 100], 255);
  assert.equal(coverage[2000 * width + 1500], 0);
  assert.ok(elapsed < 1500, `stroke took ${elapsed.toFixed(0)} ms`);
});
