import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSlices,
  cropMeasurements,
  frameMask,
  mapPerspectivePoint,
  perspectiveMatrixFromQuad,
  planFramePlacement,
  planPerspectiveCrop,
  planRectangularCrop,
  planSlices,
  validCropQuad,
  warpPerspectiveRgba,
} from '../src/cropTools.ts';

const pixel = (pixels, width, x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x + 1) * 4));

test('rectangular crop aligns reverse drags to integer retained pixels and clips to canvas', () => {
  assert.deepEqual(planRectangularCrop(20, 16, { x: 15.9, y: 12.2 }, { x: 3.2, y: 2.9 }), { left: 3, top: 2, width: 12, height: 10, changed: true });
  assert.deepEqual(planRectangularCrop(20, 16, { x: -3, y: -2 }, { x: 50, y: 40 }), { left: 0, top: 0, width: 20, height: 16, changed: false });
});

test('rectangular crop rejects invalid, empty and out-of-image drags', () => {
  assert.throws(() => planRectangularCrop(20, 16, { x: NaN, y: 0 }, { x: 3, y: 3 }), /finite/);
  assert.throws(() => planRectangularCrop(20, 16, { x: 5, y: 5 }, { x: 5.1, y: 5.1 }), /one pixel/);
  assert.throws(() => planRectangularCrop(20, 16, { x: 25, y: 20 }, { x: 30, y: 25 }), /one pixel/);
  assert.throws(() => planRectangularCrop(16000, 16000, { x: 0, y: 0 }, { x: 1, y: 1 }), /16 megapixels/);
});

test('cropping annotations translates contained points and never mutates their source', () => {
  const annotations = [
    { id: 'in', kind: 'sample', x: 8, y: 6, color: '#123456', alpha: 128 },
    { id: 'outside', kind: 'note', x: 1, y: 1, text: 'Outside the retained canvas' },
    { id: 'edge', kind: 'count', x: 15, y: 12, index: 4 },
  ];
  const before = JSON.parse(JSON.stringify(annotations));
  const plan = planRectangularCrop(20, 16, { x: 3, y: 2 }, { x: 15, y: 12 });
  assert.deepEqual(cropMeasurements(annotations, plan), [
    { id: 'in', kind: 'sample', x: 5, y: 4, color: '#123456', alpha: 128 },
    { id: 'edge', kind: 'count', x: 12, y: 10, index: 4 },
  ]);
  assert.deepEqual(annotations, before);
  assert.equal(cropMeasurements(undefined, plan), undefined);
});

test('cropping rulers clips crossings, recomputes metrics, and discards outside segments', () => {
  const annotations = [
    { id: 'crossing', kind: 'ruler', start: { x: 0, y: 6 }, end: { x: 20, y: 6 }, pixels: 20, angle: 0 },
    { id: 'outside', kind: 'ruler', start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, pixels: 20, angle: 0 },
    { id: 'vertical', kind: 'ruler', start: { x: 6, y: 14 }, end: { x: 6, y: 0 }, pixels: 14, angle: -90 },
  ];
  const plan = planRectangularCrop(20, 16, { x: 3, y: 2 }, { x: 15, y: 12 });
  assert.deepEqual(cropMeasurements(annotations, plan), [
    { id: 'crossing', kind: 'ruler', start: { x: 0, y: 4 }, end: { x: 12, y: 4 }, pixels: 12, angle: 0 },
    { id: 'vertical', kind: 'ruler', start: { x: 3, y: 10 }, end: { x: 3, y: 0 }, pixels: 10, angle: -90 },
  ]);
});

test('perspective crop validates convex corners and rejects folded or out-of-bounds quads', () => {
  const quad = [{ x: 1, y: 1 }, { x: 9, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 8 }];
  assert.equal(validCropQuad(quad, 10, 8), true);
  assert.equal(validCropQuad([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }, { x: 5, y: 0 }], 10, 10), false);
  assert.equal(validCropQuad([{ x: -1, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }], 10, 10), false);
  assert.throws(() => planPerspectiveCrop(10, 8, { quad, width: 0, height: 4 }), /output/);
});

test('axis-aligned perspective mapping is identity and defaults to measured edge dimensions', () => {
  const plan = planPerspectiveCrop(4, 3, { quad: [
    { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
  ] });
  assert.deepEqual([plan.width, plan.height], [4, 3]);
  assert.equal(plan.changed, false);
  assert.deepEqual(mapPerspectivePoint(plan.sourceFromOutput, { x: 2, y: 1 }), { x: 2, y: 1 });
});

test('perspective mapping sends all four output corners to the selected quad', () => {
  const quad = [{ x: 2, y: 4 }, { x: 12, y: 1 }, { x: 10, y: 10 }, { x: 0, y: 9 }];
  const matrix = perspectiveMatrixFromQuad(quad, 10, 8);
  for (const [point, expected] of [
    [{ x: 0, y: 0 }, quad[0]],
    [{ x: 10, y: 0 }, quad[1]],
    [{ x: 10, y: 8 }, quad[2]],
    [{ x: 0, y: 8 }, quad[3]],
  ]) {
    const mapped = mapPerspectivePoint(matrix, point);
    assert.ok(Math.abs(mapped.x - expected.x) < 1e-7);
    assert.ok(Math.abs(mapped.y - expected.y) < 1e-7);
  }
});

test('perspective warp returns a fresh RGBA buffer and preserves identity pixels', () => {
  const source = new Uint8ClampedArray(3 * 2 * 4);
  for (let y = 0; y < 2; y += 1)
    for (let x = 0; x < 3; x += 1)
      source.set([x * 50, y * 80, x + y, 255], (y * 3 + x) * 4);
  const original = source.slice();
  const plan = planPerspectiveCrop(3, 2, { quad: [
    { x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 },
  ] });
  const warped = warpPerspectiveRgba(source, 3, 2, plan);
  assert.notEqual(warped, source);
  assert.deepEqual(Array.from(warped), Array.from(source));
  assert.deepEqual(Array.from(source), Array.from(original));
  assert.throws(() => warpPerspectiveRgba(source, 3, 2, { ...plan, sourceFromOutput: [NaN, 0, 0, 0, 0, 0, 0, 0] }), /invalid/);
});

test('frame placement provides cover crop, contain letterbox and stretch matrices', () => {
  const cover = planFramePlacement({ x: 10, y: 20, width: 100, height: 100, sourceWidth: 200, sourceHeight: 100, fit: 'cover' });
  assert.deepEqual(cover.sourceRect, { x: 50, y: 0, width: 100, height: 100 });
  assert.deepEqual(cover.matrix, [1, 0, 0, 1, -40, 20]);
  const contain = planFramePlacement({ x: 10, y: 20, width: 100, height: 100, sourceWidth: 200, sourceHeight: 100, fit: 'contain' });
  assert.deepEqual(contain.sourceRect, { x: 0, y: 0, width: 200, height: 100 });
  assert.deepEqual(contain.matrix, [0.5, 0, 0, 0.5, 10, 45]);
  const stretch = planFramePlacement({ x: 10, y: 20, width: 100, height: 100, sourceWidth: 200, sourceHeight: 100, fit: 'stretch' });
  assert.deepEqual(stretch.matrix, [0.5, 0, 0, 1, 10, 20]);
  assert.throws(() => planFramePlacement({ x: 0, y: 0, width: 0, height: 1, sourceWidth: 1, sourceHeight: 1 }), /positive/);
});

test('frame masks are canvas-clipped, transparent outside, and support rounded corners', () => {
  const square = frameMask(6, 5, { x: 1, y: 1, width: 3, height: 2 });
  assert.equal(square.filter(Boolean).length, 6);
  assert.equal(square[0], 0);
  const rounded = frameMask(6, 6, { x: 1, y: 1, width: 4, height: 4 }, 2);
  assert.equal(rounded[1 * 6 + 1], 0);
  assert.equal(rounded[2 * 6 + 2], 255);
  assert.throws(() => frameMask(6, 5, { x: 0, y: 0, width: 1, height: 1 }, -1), /invalid/);
});

test('slice plans sanitize names, preserve order and round-trip through JSON', () => {
  const plan = planSlices(4, 3, [
    { id: 'hero', name: '  Hero / image  ', x: 0, y: 0, width: 2, height: 2 },
    { id: 'footer', name: '', x: 2, y: 2, width: 2, height: 1 },
  ]);
  assert.deepEqual(plan.slices.map((slice) => slice.name), ['Hero-image', 'slice-2']);
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
  assert.throws(() => planSlices(4, 3, [{ id: ' ', name: 'bad', x: 0, y: 0, width: 1, height: 1 }]), /non-empty/);
  assert.throws(() => planSlices(4, 3, [{ id: 'a', name: 'a', x: 3, y: 0, width: 2, height: 1 }]), /inside/);
  assert.throws(() => planSlices(4, 3, [{ id: 'a', name: 'a', x: 0, y: 0, width: 1, height: 1 }, { id: 'a', name: 'b', x: 1, y: 0, width: 1, height: 1 }]), /unique/);
});

test('slice extraction copies exact rows and never mutates the source', () => {
  const source = new Uint8ClampedArray(4 * 3 * 4);
  for (let y = 0; y < 3; y += 1)
    for (let x = 0; x < 4; x += 1) source.set([x, y, x + y, 255], (y * 4 + x) * 4);
  const original = source.slice();
  const plan = planSlices(4, 3, [{ id: 'center', name: 'Center', x: 1, y: 1, width: 2, height: 2 }]);
  const [slice] = extractSlices(source, 4, 3, plan);
  assert.deepEqual(pixel(slice.pixels, 2, 0, 0), [1, 1, 2, 255]);
  assert.deepEqual(pixel(slice.pixels, 2, 1, 1), [2, 2, 4, 255]);
  assert.deepEqual(Array.from(source), Array.from(original));
  assert.throws(() => extractSlices(source, 4, 3, { ...plan, canvasWidth: 5 }), /match/);
});
