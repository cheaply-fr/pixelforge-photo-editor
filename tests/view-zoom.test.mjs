import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
  ZOOM_STEPS,
  anchorScrollDelta,
  clampViewZoom,
  fitViewZoom,
  formatViewZoom,
  LEGACY_STAGE_ZOOM,
  nearestZoomStepIndex,
  stepViewZoom,
  validViewZoom,
} from '../src/viewZoom.ts';

test('zoom steps are strictly increasing and span 1% to 3200%', () => {
  assert.equal(ZOOM_STEPS[0], MIN_VIEW_ZOOM);
  assert.equal(ZOOM_STEPS.at(-1), MAX_VIEW_ZOOM);
  for (let i = 1; i < ZOOM_STEPS.length; i += 1) assert.ok(ZOOM_STEPS[i] > ZOOM_STEPS[i - 1]);
  assert.ok(ZOOM_STEPS.includes(100));
});

test('stepping walks presets and clamps at both ends', () => {
  assert.equal(stepViewZoom(100, 1), 150);
  assert.equal(stepViewZoom(100, -1), 66.67);
  // Off-preset values snap to the neighbouring step in the chosen direction.
  assert.equal(stepViewZoom(9.8, 1), 12.5);
  assert.equal(stepViewZoom(9.8, -1), 8.33);
  assert.equal(stepViewZoom(3200, 1), 3200);
  assert.equal(stepViewZoom(1, -1), 1);
  assert.equal(stepViewZoom(5000, -1), 2400);
  // Walking up from the minimum visits every step exactly once.
  const seen = [];
  for (let zoom = 1; seen.at(-1) !== 3200; zoom = stepViewZoom(zoom, 1)) seen.push(zoom);
  assert.deepEqual(seen, [...ZOOM_STEPS]);
});

test('validation and clamping reject non-finite and out-of-range zooms', () => {
  for (const ok of [1, 9.8, 100, 3200]) assert.equal(validViewZoom(ok), true, String(ok));
  for (const bad of [0, 0.5, 3201, Number.NaN, Infinity, '100', null, undefined])
    assert.equal(validViewZoom(bad), false, String(bad));
  assert.equal(clampViewZoom(0), 1);
  assert.equal(clampViewZoom(99999), 3200);
  assert.equal(clampViewZoom(Number.NaN), 100);
});

test('fit shows the whole image inside the padded stage', () => {
  // The 2646×4096 artwork in an 813×563 stage with 40 px padding.
  const zoom = fitViewZoom({ imageWidth: 2646, imageHeight: 4096, stageWidth: 813, stageHeight: 563, padding: 40 });
  assert.ok(Math.abs(zoom - ((563 - 80) / 4096) * 100) < 1e-9);
  assert.ok((2646 * zoom) / 100 <= 813 - 80);
  assert.ok((4096 * zoom) / 100 <= 563 - 80 + 1e-9);
  // Wide images are limited by width instead.
  const wide = fitViewZoom({ imageWidth: 4000, imageHeight: 500, stageWidth: 1000, stageHeight: 800 });
  assert.equal(wide, 25);
  // Small images are not magnified past 100% unless asked.
  assert.equal(fitViewZoom({ imageWidth: 20, imageHeight: 20, stageWidth: 800, stageHeight: 600 }), 100);
  assert.equal(fitViewZoom({ imageWidth: 20, imageHeight: 20, stageWidth: 800, stageHeight: 600, maxFit: 3200 }), 3000);
  // Degenerate inputs fall back safely.
  assert.equal(fitViewZoom({ imageWidth: 0, imageHeight: 10, stageWidth: 800, stageHeight: 600 }), 100);
  assert.equal(fitViewZoom({ imageWidth: 100000, imageHeight: 100000, stageWidth: 10, stageHeight: 10 }), 1);
});

test('nearest step uses a log scale', () => {
  assert.equal(ZOOM_STEPS[nearestZoomStepIndex(100)], 100);
  assert.equal(ZOOM_STEPS[nearestZoomStepIndex(11.8)], 12.5);
  assert.equal(ZOOM_STEPS[nearestZoomStepIndex(7)], 6.25);
  assert.equal(nearestZoomStepIndex(0), 0);
  assert.equal(nearestZoomStepIndex(1e9), ZOOM_STEPS.length - 1);
});

test('labels are short and exact', () => {
  assert.equal(formatViewZoom(100), '100%');
  assert.equal(formatViewZoom(12.5), '12.5%');
  assert.equal(formatViewZoom(66.67), '66.67%');
  assert.equal(formatViewZoom(11.7919921875), '11.79%');
  assert.equal(formatViewZoom(3200), '3200%');
});

test('anchored zoom keeps the image point under the pointer', () => {
  // A 100×50 image shown at (300, 200); the pointer is at image pixel (25, 10).
  const before = { left: 300, top: 200, width: 100, height: 50 };
  const anchor = { x: 325, y: 210 };
  // At 4× the image starts at (150, 140) in client space before scrolling.
  const after = { left: 150, top: 140, width: 400, height: 200 };
  const { dx, dy } = anchorScrollDelta(before, after, anchor.x, anchor.y);
  // After scrolling by (dx, dy) the image moves left/up by the same amount,
  // and image pixel (25, 10) is under the pointer again.
  assert.equal(after.left - dx + 25 * 4, anchor.x);
  assert.equal(after.top - dy + 10 * 4, anchor.y);
  // Zooming without moving the image needs no scroll at its top-left corner.
  assert.deepEqual(anchorScrollDelta(before, { ...before, width: 200, height: 100 }, 300, 200), { dx: 0, dy: 0 });
  // A zero-size box does not produce NaN.
  const zero = anchorScrollDelta({ left: 0, top: 0, width: 0, height: 0 }, after, 0, 0);
  assert.ok(Number.isFinite(zero.dx) && Number.isFinite(zero.dy));
});

test('the legacy zoom written for older builds is inside their accepted range', () => {
  assert.ok(Number.isInteger(LEGACY_STAGE_ZOOM) && LEGACY_STAGE_ZOOM >= 20 && LEGACY_STAGE_ZOOM <= 140);
});
