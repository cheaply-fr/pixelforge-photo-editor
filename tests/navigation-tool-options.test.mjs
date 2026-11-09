import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COUNT_GROUP,
  EYEDROPPER_SAMPLE_SIZES,
  averageSample,
  countGroupOf,
  countGroupTotals,
  nextCountIndex,
  nextCountIndexInGroup,
  photoshopAngle,
  rgbHex,
  rotationAboutPoint,
  rulerReadout,
  straightenRotation,
  validCountGroupName,
  validMeasurements,
} from '../src/measurements.ts';
import {
  DEFAULT_NAVIGATION_TOOL_SETTINGS,
  normalizeNavigationToolSettings,
  updateNavigationToolSetting,
  validNavigationToolSettings,
} from '../src/navigationOptions.ts';
import { fillViewZoom, fitViewZoom, scrubbyViewZoom, MAX_VIEW_ZOOM, MIN_VIEW_ZOOM } from '../src/viewZoom.ts';

const apply = (matrix, point) => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
});

test('ruler angle follows the Photoshop sign convention (up-right is positive)', () => {
  assert.equal(photoshopAngle({ x: 0, y: 10 }, { x: 10, y: 0 }), 45);
  assert.equal(photoshopAngle({ x: 0, y: 0 }, { x: 10, y: 10 }), -45);
  assert.equal(photoshopAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  assert.equal(photoshopAngle({ x: 10, y: 0 }, { x: 0, y: 0 }), 180);
  assert.equal(photoshopAngle({ x: 0, y: 0 }, { x: 0, y: -5 }), 90);
  assert.equal(photoshopAngle({ x: 0, y: 0 }, { x: 0, y: 5 }), -90);
  // The audit's down-right drag that previously read +36.8° now reads −36.8°.
  assert.equal(photoshopAngle({ x: 0, y: 0 }, { x: 400, y: 300 }), -36.9);
  assert.ok(!Object.is(photoshopAngle({ x: 0, y: 0 }, { x: 5, y: 0.0001 }), -0));
});

test('ruler readout reports length, Photoshop angle and signed image deltas', () => {
  const readout = rulerReadout({ x: 10, y: 50 }, { x: 40, y: 10 });
  assert.equal(readout.length, 50);
  assert.equal(readout.angle, 53.1);
  assert.equal(readout.dx, 30);
  assert.equal(readout.dy, -40);
});

test('straighten rotation levels the ruler with the smallest turn', () => {
  for (const [start, end] of [
    [{ x: 0, y: 0 }, { x: 100, y: 20 }],
    [{ x: 0, y: 0 }, { x: 100, y: -35 }],
    [{ x: 100, y: 20 }, { x: 0, y: 0 }],
    [{ x: 5, y: 5 }, { x: 25, y: 85 }],
  ]) {
    const degrees = straightenRotation(start, end);
    assert.ok(degrees > -90 && degrees <= 90, `${degrees}`);
    const matrix = rotationAboutPoint(degrees, 50, 50);
    const a = apply(matrix, start), b = apply(matrix, end);
    assert.ok(Math.abs(a.y - b.y) < 1e-9, `line is level after ${degrees}°`);
    assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - Math.hypot(end.x - start.x, end.y - start.y)) < 1e-9);
  }
  assert.equal(straightenRotation({ x: 1, y: 1 }, { x: 1, y: 1 }), 0);
  assert.equal(straightenRotation({ x: 0, y: 3 }, { x: 9, y: 3 }), 0);
  // A line rising 10° to the right needs a 10° clockwise turn.
  const rising = { x: Math.cos(Math.PI / 18) * 100, y: -Math.sin(Math.PI / 18) * 100 };
  assert.ok(Math.abs(straightenRotation({ x: 0, y: 0 }, rising) - 10) < 1e-9);
});

test('rotation about a point keeps that point fixed', () => {
  const matrix = rotationAboutPoint(33, 120, 80);
  const fixed = apply(matrix, { x: 120, y: 80 });
  assert.ok(Math.abs(fixed.x - 120) < 1e-9 && Math.abs(fixed.y - 80) < 1e-9);
  assert.deepEqual(rotationAboutPoint(0, 10, 10), [1, 0, 0, 1, 0, 0]);
  const quarter = apply(rotationAboutPoint(90, 0, 0), { x: 10, y: 0 });
  assert.ok(Math.abs(quarter.x) < 1e-9 && Math.abs(quarter.y - 10) < 1e-9, 'positive is clockwise on screen');
});

test('eyedropper sample sizes average an alpha-weighted square, clipped to the image', () => {
  assert.deepEqual([...EYEDROPPER_SAMPLE_SIZES], [1, 3, 5, 11, 31, 51, 101]);
  const width = 4, height = 4, data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([i * 10, 100, 200, 255], i * 4);
  assert.deepEqual(averageSample(data, width, height, 1, 1, 1), { r: 50, g: 100, b: 200, a: 255 });
  // 3×3 around (1,1): indices 0,1,2,4,5,6,8,9,10 → mean 45 → r 450/9 = 50.
  assert.deepEqual(averageSample(data, width, height, 1.7, 1.2, 3), { r: 50, g: 100, b: 200, a: 255 });
  // At a corner only the in-image pixels count: indices 0,1,4,5 → r 25.
  assert.equal(averageSample(data, width, height, 0, 0, 3).r, 25);
  // A transparent pixel does not darken the colour but lowers the mean alpha.
  const mixed = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]);
  assert.deepEqual(averageSample(mixed, 2, 2, 0, 0, 3), { r: 255, g: 0, b: 0, a: 128 });
  assert.deepEqual(averageSample(new Uint8ClampedArray(16), 2, 2, 0, 0, 3), { r: 0, g: 0, b: 0, a: 0 });
  assert.throws(() => averageSample(new Uint8ClampedArray(3), 2, 2, 0, 0));
  assert.equal(rgbHex({ r: 201, g: 129, b: 79 }), '#c9814f');
  assert.equal(rgbHex({ r: 300, g: -4, b: 15.6 }), '#ff0010');
});

test('count groups number markers per group and validate names and colours', () => {
  const items = [
    { id: 'a', kind: 'count', x: 1, y: 1, index: 1 },
    { id: 'b', kind: 'count', x: 1, y: 1, index: 2 },
    { id: 'c', kind: 'count', x: 1, y: 1, index: 1, group: 'Trees', color: '#00aa00' },
  ];
  assert.equal(countGroupOf(items[0]), DEFAULT_COUNT_GROUP);
  assert.equal(nextCountIndexInGroup(items, DEFAULT_COUNT_GROUP), 3);
  assert.equal(nextCountIndexInGroup(items, 'Trees'), 2);
  assert.equal(nextCountIndexInGroup(items, 'New'), 1);
  assert.equal(nextCountIndex(items), 3, 'legacy helper still scans every marker');
  assert.deepEqual(countGroupTotals(items), [
    { group: DEFAULT_COUNT_GROUP, color: undefined, count: 2 },
    { group: 'Trees', color: '#00aa00', count: 1 },
  ]);
  assert.ok(validMeasurements(items, 10, 10));
  for (const bad of ['', ' padded', 'tab\there', 'x'.repeat(41), 'bell\u0007', 7])
    assert.equal(validCountGroupName(bad), false, JSON.stringify(bad));
  assert.equal(validCountGroupName('Count 2'), true);
  assert.equal(validMeasurements([{ ...items[2], group: '' }], 10, 10), false);
  assert.equal(validMeasurements([{ ...items[2], color: 'green' }], 10, 10), false);
});

test('notes accept an optional hex colour', () => {
  const note = { id: 'n', kind: 'note', x: 2, y: 2, text: 'Check', color: '#ffb347' };
  assert.ok(validMeasurements([note], 10, 10));
  assert.ok(validMeasurements([{ ...note, color: undefined }], 10, 10));
  assert.equal(validMeasurements([{ ...note, color: 'red' }], 10, 10), false);
});

test('navigation tool settings default, validate and normalize', () => {
  assert.deepEqual(normalizeNavigationToolSettings(undefined), DEFAULT_NAVIGATION_TOOL_SETTINGS);
  assert.ok(Object.isFrozen(DEFAULT_NAVIGATION_TOOL_SETTINGS));
  assert.ok(validNavigationToolSettings({}));
  assert.ok(validNavigationToolSettings({ ...DEFAULT_NAVIGATION_TOOL_SETTINGS }));
  assert.ok(validNavigationToolSettings({ zoomMode: 'out', cropRatio: 'size', cropWidth: 1080, cropHeight: 1350, futureKey: 1 }));
  for (const bad of [
    null,
    [],
    'x',
    { zoomMode: 'sideways' },
    { scrubbyZoom: 'yes' },
    { eyedropperSize: 4 },
    { eyedropperSample: 'merged' },
    { countGroup: '' },
    { countColor: '#12345' },
    { countLabelSize: 7 },
    { countLabelSize: 73 },
    { noteColor: 'orange' },
    { cropRatio: '7:3' },
    { cropWidth: 0 },
    { cropHeight: 16001 },
    { cropWidth: 1.5 },
    { cropResolution: -1 },
    { cropResolution: 2401 },
    { cropOverlay: 'golden' },
    { cropDeletePixels: 1 },
  ])
    assert.equal(validNavigationToolSettings(bad), false, JSON.stringify(bad));
  const mixed = normalizeNavigationToolSettings({ zoomMode: 'out', countLabelSize: 999, cropOverlay: 'grid' });
  assert.equal(mixed.zoomMode, 'out');
  assert.equal(mixed.countLabelSize, DEFAULT_NAVIGATION_TOOL_SETTINGS.countLabelSize);
  assert.equal(mixed.cropOverlay, 'grid');
  const updated = updateNavigationToolSetting(mixed, 'eyedropperSize', 5);
  assert.equal(updated.eyedropperSize, 5);
  assert.equal(updateNavigationToolSetting(updated, 'eyedropperSize', 6), updated, 'invalid edits are ignored');
});

test('Fill Screen covers the stage and Scrubby Zoom doubles per step', () => {
  const stage = { imageWidth: 2000, imageHeight: 1000, stageWidth: 1000, stageHeight: 800 };
  assert.equal(fitViewZoom(stage), 50);
  assert.equal(fillViewZoom(stage), 80);
  assert.equal(fillViewZoom({ ...stage, imageWidth: 0 }), 100);
  assert.equal(fillViewZoom({ imageWidth: 1, imageHeight: 1, stageWidth: 1e6, stageHeight: 1e6 }), MAX_VIEW_ZOOM);
  assert.equal(scrubbyViewZoom(100, 160), 200);
  assert.equal(scrubbyViewZoom(100, -160), 50);
  assert.equal(scrubbyViewZoom(100, 0), 100);
  assert.equal(scrubbyViewZoom(100, -1e6), MIN_VIEW_ZOOM);
  assert.equal(scrubbyViewZoom(100, Number.NaN), 100);
});
