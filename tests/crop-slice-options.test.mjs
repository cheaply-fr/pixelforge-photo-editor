import test from 'node:test';
import assert from 'node:assert/strict';
import {
  constrainCropEnd,
  cropAspectRatio,
  inscribedCropAfterRotation,
  nearestQuadCorner,
  orderQuadCorners,
  planCropTrim,
  rectangleQuad,
  scaleMeasurements,
} from '../src/cropOptions.ts';
import { planPerspectiveCrop, validCropQuad } from '../src/cropTools.ts';
import { adjustSliceRect, hitTestSliceHandle } from '../src/slices.ts';
import { CROP_RATIO_PRESETS } from '../src/navigationOptions.ts';

const canvas = { canvasWidth: 1200, canvasHeight: 800, width: 1600, height: 900 };

test('crop ratio presets resolve to width / height ratios', () => {
  assert.equal(cropAspectRatio('free', canvas), null);
  assert.equal(cropAspectRatio('original', canvas), 1.5);
  assert.equal(cropAspectRatio('1:1', canvas), 1);
  assert.equal(cropAspectRatio('4:5', canvas), 0.8);
  assert.equal(cropAspectRatio('16:9', canvas), 16 / 9);
  assert.equal(cropAspectRatio('ratio', canvas), 16 / 9);
  assert.equal(cropAspectRatio('size', { ...canvas, width: 1080, height: 1350 }), 0.8);
  assert.equal(cropAspectRatio('ratio', { ...canvas, width: 0 }), null);
  for (const preset of CROP_RATIO_PRESETS) {
    const ratio = cropAspectRatio(preset, canvas);
    assert.ok(ratio === null || (Number.isFinite(ratio) && ratio > 0), preset);
  }
});

test('constrained crop drags keep the ratio, direction and canvas bounds', () => {
  const end = constrainCropEnd({ x: 100, y: 100 }, { x: 500, y: 200 }, 1, 1200, 800);
  assert.deepEqual(end, { x: 200, y: 200 }, 'shrinks to fit inside the drag');
  const up = constrainCropEnd({ x: 600, y: 600 }, { x: 200, y: 100 }, 2, 1200, 800);
  assert.deepEqual(up, { x: 200, y: 400 }, 'up-left drag keeps its direction');
  const clipped = constrainCropEnd({ x: 1000, y: 100 }, { x: 1600, y: 700 }, 1, 1200, 800);
  assert.deepEqual(clipped, { x: 1200, y: 300 }, 'never leaves the canvas');
  assert.deepEqual(constrainCropEnd({ x: 1, y: 1 }, { x: 9, y: 4 }, null, 10, 10), { x: 9, y: 4 });
  const ratio = 16 / 9,
    wide = constrainCropEnd({ x: 0, y: 0 }, { x: 900, y: 900 }, ratio, 1200, 800);
  assert.ok(Math.abs(wide.x / wide.y - ratio) < 1e-9);
});

test('straighten crop is the largest level rectangle inside the rotated canvas', () => {
  assert.deepEqual(inscribedCropAfterRotation(1000, 500, 0), { left: 0, top: 0, width: 1000, height: 500 });
  const crop = inscribedCropAfterRotation(1000, 500, 10);
  assert.ok(crop.width < 1000 && crop.height < 500);
  assert.ok(Math.abs(crop.width / crop.height - 2) < 0.01, 'keeps the canvas aspect');
  // Every corner of the crop lies inside the canvas rotated by 10° about its centre.
  const theta = (10 * Math.PI) / 180;
  for (const [x, y] of [
    [crop.left, crop.top],
    [crop.left + crop.width, crop.top],
    [crop.left, crop.top + crop.height],
    [crop.left + crop.width, crop.top + crop.height],
  ]) {
    const dx = x - 500, dy = y - 250;
    const u = dx * Math.cos(theta) + dy * Math.sin(theta), v = -dx * Math.sin(theta) + dy * Math.cos(theta);
    assert.ok(Math.abs(u) <= 500 + 1e-6 && Math.abs(v) <= 250 + 1e-6);
  }
  assert.deepEqual(inscribedCropAfterRotation(1000, 500, -10), crop, 'symmetric for either direction');
});

test('Delete Cropped Pixels trims whole-pixel layers losslessly and keeps the rest', () => {
  assert.deepEqual(planCropTrim([1, 0, 0, 1, -50, -20], 400, 300, 200, 200), {
    empty: false,
    crop: { x: 50, y: 20, width: 200, height: 200 },
    matrix: [1, 0, 0, 1, 0, 0],
  });
  assert.deepEqual(planCropTrim([1, 0, 0, 1, 30, 40], 100, 100, 200, 200), null, 'inside: nothing to trim');
  assert.deepEqual(planCropTrim([1, 0, 0, 1, 500, 0], 100, 100, 200, 200), { empty: true });
  assert.deepEqual(planCropTrim([1, 0, 0, 1, 150, 150], 100, 100, 200, 200), {
    empty: false,
    crop: { x: 0, y: 0, width: 50, height: 50 },
    matrix: [1, 0, 0, 1, 150, 150],
  });
  assert.equal(planCropTrim([2, 0, 0, 2, -10, -10], 100, 100, 50, 50), null, 'scaled layers are kept');
  assert.equal(planCropTrim([1, 0, 0, 1, -10.5, 0], 100, 100, 50, 50), null, 'sub-pixel layers are kept');
});

test('resampled crops scale annotations and recompute rulers', () => {
  const scaled = scaleMeasurements(
    [
      { id: 'n', kind: 'note', x: 10, y: 20, text: 'n' },
      { id: 'r', kind: 'ruler', start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, pixels: 10, angle: 0 },
    ],
    2,
    0.5,
  );
  assert.deepEqual(scaled[0], { id: 'n', kind: 'note', x: 20, y: 10, text: 'n' });
  assert.deepEqual(scaled[1].end, { x: 20, y: 0 });
  assert.equal(scaled[1].pixels, 20);
  assert.equal(scaleMeasurements(undefined, 2, 2), undefined);
});

test('perspective crop drags make an axis-aligned rectangle; clicks are reordered', () => {
  const quad = rectangleQuad({ x: 300, y: 250 }, { x: 100, y: -20 }, 1000, 800);
  assert.deepEqual(quad, [
    { x: 100, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 250 },
    { x: 100, y: 250 },
  ]);
  const plan = planPerspectiveCrop(1000, 800, { quad });
  assert.equal(plan.width, 200);
  assert.equal(plan.height, 250);
  const clicked = [
    { x: 410, y: 380 },
    { x: 90, y: 60 },
    { x: 60, y: 420 },
    { x: 380, y: 40 },
  ];
  const ordered = orderQuadCorners(clicked);
  assert.deepEqual(ordered, [
    { x: 90, y: 60 },
    { x: 380, y: 40 },
    { x: 410, y: 380 },
    { x: 60, y: 420 },
  ]);
  assert.ok(validCropQuad(ordered, 1000, 800));
  assert.throws(() => orderQuadCorners(clicked.slice(0, 3)));
  assert.equal(nearestQuadCorner(ordered, { x: 385, y: 45 }, 10), 1);
  assert.equal(nearestQuadCorner(ordered, { x: 200, y: 200 }, 10), null);
});

test('slice handles hit-test corners, edges and the interior', () => {
  const slice = { id: 's', name: 's', x: 100, y: 100, width: 200, height: 100 };
  assert.equal(hitTestSliceHandle(slice, 100, 100, 6), 'nw');
  assert.equal(hitTestSliceHandle(slice, 303, 198, 6), 'se');
  assert.equal(hitTestSliceHandle(slice, 200, 97, 6), 'n');
  assert.equal(hitTestSliceHandle(slice, 200, 200, 6), 's');
  assert.equal(hitTestSliceHandle(slice, 98, 150, 6), 'w');
  assert.equal(hitTestSliceHandle(slice, 300, 150, 6), 'e');
  assert.equal(hitTestSliceHandle(slice, 200, 150, 6), 'move');
  assert.equal(hitTestSliceHandle(slice, 50, 150, 6), null);
  assert.equal(hitTestSliceHandle(slice, Number.NaN, 150, 6), null);
  // Tiny slices keep a movable interior.
  assert.equal(hitTestSliceHandle({ x: 0, y: 0, width: 6, height: 6 }, 3, 3, 10), 'move');
});

test('slice moves and resizes stay whole, non-empty and inside the canvas', () => {
  const slice = { id: 's', name: 'hero', x: 100, y: 100, width: 200, height: 100 };
  assert.deepEqual(adjustSliceRect(slice, 'move', 30.4, -20.6, 1000, 800), { ...slice, x: 130, y: 79 });
  assert.deepEqual(adjustSliceRect(slice, 'move', 5000, 5000, 1000, 800), { ...slice, x: 800, y: 700 });
  assert.deepEqual(adjustSliceRect(slice, 'se', 50, 20, 1000, 800), { ...slice, width: 250, height: 120 });
  assert.deepEqual(adjustSliceRect(slice, 'nw', -500, -500, 1000, 800), { ...slice, x: 0, y: 0, width: 300, height: 200 });
  assert.deepEqual(adjustSliceRect(slice, 'e', -500, 0, 1000, 800), { ...slice, width: 1 });
  assert.deepEqual(adjustSliceRect(slice, 'n', 0, 500, 1000, 800), { ...slice, y: 199, height: 1 });
  assert.deepEqual(adjustSliceRect(slice, 'w', Number.NaN, 0, 1000, 800), slice);
  assert.equal(adjustSliceRect(slice, 'move', 1, 1, 1000, 800).name, 'hero');
});
