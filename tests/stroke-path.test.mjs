import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_STROKE_PATH_SETTINGS,
  STROKE_PATH_MAX_SAMPLES,
  defaultStrokePathChoice,
  flattenStrokePath,
  invertPathMatrix,
  multiplyPathMatrix,
  normalizeStrokePathSettings,
  planStrokePath,
  sampleStrokePath,
  strokePathPressure,
  strokePathScales,
  strokePathSources,
  strokePathTargetMatrix,
  taperEase,
} from '../src/strokePath.ts';

const path = (nodes, closed = false, patch = {}) => ({
  nodes,
  closed,
  fill: false,
  stroke: true,
  strokeWidth: 1,
  fillColor: '#000000',
  strokeColor: '#000000',
  ...patch,
});
const line = path([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
const noPressure = { simulatePressure: false, taperStart: 0, taperEnd: 0, minSize: 0, pressureSize: true, pressureOpacity: false };
const cubicArc = path([
  { x: 0, y: 0, outHandle: { x: 0, y: 55.228 } },
  { x: 100, y: 100, inHandle: { x: 44.772, y: 100 } },
]);
const near = (actual, expected, epsilon, message) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message ?? ''} expected ${expected}±${epsilon}, got ${actual}`);

test('settings normalize to bounded defaults and keep valid choices', () => {
  assert.deepEqual(normalizeStrokePathSettings(undefined), DEFAULT_STROKE_PATH_SETTINGS);
  assert.deepEqual(normalizeStrokePathSettings('nope'), DEFAULT_STROKE_PATH_SETTINGS);
  const value = normalizeStrokePathSettings({
    tool: 'smudge', simulatePressure: false, taperStart: '40', taperEnd: 140, minSize: -5,
    pressureSize: false, pressureOpacity: true, scope: 'all',
  });
  assert.deepEqual(value, {
    tool: 'smudge', simulatePressure: false, taperStart: 40, taperEnd: 100, minSize: 0,
    pressureSize: false, pressureOpacity: true, scope: 'all',
  });
  const junk = normalizeStrokePathSettings({ tool: 'flamethrower', taperStart: Number.NaN, minSize: 'x', scope: 'some', simulatePressure: 1 });
  assert.equal(junk.tool, 'brush');
  assert.equal(junk.taperStart, DEFAULT_STROKE_PATH_SETTINGS.taperStart);
  assert.equal(junk.minSize, DEFAULT_STROKE_PATH_SETTINGS.minSize);
  assert.equal(junk.scope, 'selected');
  assert.equal(junk.simulatePressure, true);
  assert.equal(normalizeStrokePathSettings({ minSize: 12.6 }).minSize, 13);
});

test('taper ease is smooth, monotonic and bounded', () => {
  assert.equal(taperEase(0), 0);
  assert.equal(taperEase(1), 1);
  assert.equal(taperEase(-3), 0);
  assert.equal(taperEase(4), 1);
  assert.equal(taperEase(Number.NaN), 0);
  assert.equal(taperEase(0.5), 0.5);
  let previous = 0;
  for (let step = 1; step <= 100; step += 1) {
    const value = taperEase(step / 100);
    assert.ok(value >= previous);
    previous = value;
  }
  // Zero slope at both ends (smooth tips and smooth join to full pressure).
  assert.ok(taperEase(0.001) < 0.00001);
  assert.ok(1 - taperEase(0.999) < 0.00001);
});

test('simulated pressure ramps in and out over the taper fractions', () => {
  const settings = { simulatePressure: true, taperStart: 20, taperEnd: 30 };
  assert.equal(strokePathPressure(0, 100, settings), 0);
  assert.equal(strokePathPressure(100, 100, settings), 0);
  assert.equal(strokePathPressure(10, 100, settings), 0.5);
  assert.equal(strokePathPressure(85, 100, settings), 0.5);
  assert.equal(strokePathPressure(20, 100, settings), 1);
  assert.equal(strokePathPressure(50, 100, settings), 1);
  assert.equal(strokePathPressure(70, 100, settings), 1);
  // Out-of-range distances clamp to the contour.
  assert.equal(strokePathPressure(-5, 100, settings), 0);
  assert.equal(strokePathPressure(500, 100, settings), 0);
  // No simulation, no taper, or a dot: full pressure.
  assert.equal(strokePathPressure(0, 100, { ...settings, simulatePressure: false }), 1);
  assert.equal(strokePathPressure(0, 100, { simulatePressure: true, taperStart: 0, taperEnd: 0 }), 1);
  assert.equal(strokePathPressure(0, 0, settings), 1);
  // Overlapping tapers never reach full pressure.
  const overlap = { simulatePressure: true, taperStart: 80, taperEnd: 80 };
  assert.ok(strokePathPressure(50, 100, overlap) < 1);
  assert.ok(strokePathPressure(50, 100, overlap) > 0.5);
});

test('pressure scales size from the minimum and optionally opacity', () => {
  assert.deepEqual(strokePathScales(0, { minSize: 25, pressureSize: true, pressureOpacity: false }), { sizeScale: 0.25, opacityScale: 1 });
  assert.deepEqual(strokePathScales(1, { minSize: 25, pressureSize: true, pressureOpacity: true }), { sizeScale: 1, opacityScale: 1 });
  assert.deepEqual(strokePathScales(0.5, { minSize: 0, pressureSize: true, pressureOpacity: true }), { sizeScale: 0.5, opacityScale: 0.5 });
  assert.deepEqual(strokePathScales(0.2, { minSize: 50, pressureSize: false, pressureOpacity: true }), { sizeScale: 1, opacityScale: 0.2 });
  assert.deepEqual(strokePathScales(Number.NaN, { minSize: 0, pressureSize: true, pressureOpacity: true }), { sizeScale: 1, opacityScale: 1 });
  assert.deepEqual(strokePathScales(7, { minSize: 0, pressureSize: true, pressureOpacity: true }), { sizeScale: 1, opacityScale: 1 });
});

test('matrices compose like canvas transforms and invert exactly', () => {
  const scale = [2, 0, 0, 3, 0, 0], translate = [1, 0, 0, 1, 10, 20];
  // translate ∘ scale: scale first, then translate.
  assert.deepEqual(multiplyPathMatrix(translate, scale), [2, 0, 0, 3, 10, 20]);
  const rotate = [Math.cos(0.4), Math.sin(0.4), -Math.sin(0.4), Math.cos(0.4), 12, -7];
  const inverse = invertPathMatrix(rotate);
  const identity = multiplyPathMatrix(rotate, inverse);
  [1, 0, 0, 1, 0, 0].forEach((value, index) => near(identity[index], value, 1e-12));
  assert.equal(invertPathMatrix([1, 2, 2, 4, 0, 0]), null);
  assert.equal(invertPathMatrix([1, 0, 0, Number.NaN, 0, 0]), null);
  assert.throws(() => strokePathTargetMatrix([1, 0, 0, 1, 0, 0], [0, 0, 0, 0, 0, 0]), /cannot be inverted/);
  assert.throws(() => strokePathTargetMatrix([1, 0, 0], [1, 0, 0, 1, 0, 0]), /matrix is invalid/);
  // Path at canvas offset (50, 40); target layer at offset (10, 10) and 2× scale.
  const matrix = strokePathTargetMatrix([1, 0, 0, 1, 50, 40], [2, 0, 0, 2, 10, 10]);
  assert.deepEqual(matrix, [0.5, 0, 0, 0.5, 20, 15]);
});

test('straight contours flatten to their anchors', () => {
  const [contour] = flattenStrokePath(path([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 0 }]));
  assert.deepEqual(contour.points, [{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 0 }]);
  assert.equal(contour.closed, false);
  assert.equal(contour.length, 90);
  const [closed] = flattenStrokePath(path([{ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 30, y: 0 }], true));
  assert.equal(closed.closed, true);
  assert.deepEqual(closed.points.at(-1), { x: 0, y: 0 });
  assert.equal(closed.length, 120);
});

test('cubic contours flatten within tolerance and match the analytic arc length', () => {
  const [contour] = flattenStrokePath(cubicArc, undefined, 0.05);
  // Quarter circle of radius 100 → length π·50.
  near(contour.length, Math.PI * 50, 0.1, 'quarter arc length');
  assert.ok(contour.points.length > 8);
  for (const point of contour.points)
    near(Math.hypot(point.x - 100, point.y - 0), 100, 0.1, 'stays on the circle');
  // A coarser tolerance needs fewer vertices but stays close.
  const [coarse] = flattenStrokePath(cubicArc, undefined, 2);
  assert.ok(coarse.points.length < contour.points.length);
  near(coarse.length, Math.PI * 50, 1.5);
  assert.throws(() => flattenStrokePath(cubicArc, undefined, 0), /tolerance/);
});

test('flattening honours the path transform (and the target layer inverse)', () => {
  const matrix = [0, 2, -2, 0, 300, 100]; // rotate 90°, scale 2, translate.
  const [contour] = flattenStrokePath(line, matrix);
  assert.deepEqual(contour.points, [{ x: 300, y: 100 }, { x: 300, y: 300 }]);
  assert.equal(contour.length, 200);
  const [arc] = flattenStrokePath(cubicArc, [3, 0, 0, 3, 0, 0], 0.05);
  near(arc.length, Math.PI * 150, 0.3, 'scaled arc');
  const plan = planStrokePath([{ path: line, matrix: [1, 0, 0, 1, 40, 20] }], [2, 0, 0, 2, 0, 0], { ...noPressure, size: 10, spacing: 50 });
  // Canvas 40..140 on y = 20 → target 20..70 on y = 10.
  assert.deepEqual(plan.samples[0], { ...plan.samples[0], x: 20, y: 10 });
  assert.deepEqual({ x: plan.samples.at(-1).x, y: plan.samples.at(-1).y }, { x: 70, y: 10 });
});

test('compound and closed contours are all flattened and sampled separately', () => {
  const first = { nodes: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }], closed: true };
  const second = { nodes: [{ x: 100, y: 0 }, { x: 160, y: 0 }], closed: false };
  const compound = path(first.nodes, true, { contours: [first, second] });
  const contours = flattenStrokePath(compound);
  assert.equal(contours.length, 2);
  assert.equal(contours[0].length, 160);
  assert.equal(contours[1].length, 60);
  const { samples } = sampleStrokePath(contours, { ...noPressure, size: 10, spacing: 100 });
  const closedSamples = samples.filter((sample) => sample.contour === 0);
  const openSamples = samples.filter((sample) => sample.contour === 1);
  // Closed: 0,10,…,150 (the end coincides with the start and is not doubled).
  assert.equal(closedSamples.length, 16);
  assert.deepEqual({ x: closedSamples[4].x, y: closedSamples[4].y }, { x: 40, y: 0 });
  assert.deepEqual({ x: closedSamples[5].x, y: closedSamples[5].y }, { x: 40, y: 10 });
  assert.deepEqual(closedSamples[5].direction, { x: 0, y: 1 });
  assert.deepEqual(closedSamples[13].direction, { x: 0, y: -1 });
  // Open: 0,10,…,60 including the exact end anchor.
  assert.equal(openSamples.length, 7);
  assert.deepEqual({ x: openSamples.at(-1).x, y: openSamples.at(-1).y }, { x: 160, y: 0 });
  // Each contour carries its own taper.
  const tapered = sampleStrokePath(contours, { ...noPressure, simulatePressure: true, taperStart: 50, taperEnd: 50, size: 10, spacing: 25 }).samples;
  assert.equal(tapered.find((sample) => sample.contour === 1).pressure, 0);
  assert.equal(tapered.find((sample) => sample.contour === 0).pressure, 0);
});

test('arc-length samples are evenly spaced on lines and cubics', () => {
  const { samples, limited } = sampleStrokePath(flattenStrokePath(line), { ...noPressure, size: 20, spacing: 25 });
  assert.equal(limited, false);
  assert.equal(samples.length, 21);
  samples.forEach((sample, index) => {
    near(sample.x, index * 5, 1e-9);
    assert.equal(sample.y, 0);
    near(sample.distance, index * 5, 1e-9);
    assert.deepEqual(sample.direction, { x: 1, y: 0 });
  });
  const arc = sampleStrokePath(flattenStrokePath(cubicArc, undefined, 0.02), { ...noPressure, size: 10, spacing: 50 }).samples;
  for (let index = 1; index < arc.length - 1; index += 1) {
    const gap = Math.hypot(arc[index].x - arc[index - 1].x, arc[index].y - arc[index - 1].y);
    // Chord of a 5 px arc step is within a hair of 5 px.
    near(gap, 5, 0.02, `gap ${index}`);
    near(Math.hypot(arc[index].x - 100, arc[index].y), 100, 0.05);
    // Tangent is perpendicular to the radius.
    const radial = { x: (arc[index].x - 100) / 100, y: arc[index].y / 100 };
    near(radial.x * arc[index].direction.x + radial.y * arc[index].direction.y, 0, 0.02);
  }
});

test('tapered strokes thin toward both tips and tighten spacing there', () => {
  const { samples } = sampleStrokePath(flattenStrokePath(path([{ x: 0, y: 0 }, { x: 400, y: 0 }])), {
    simulatePressure: true, taperStart: 25, taperEnd: 25, minSize: 10, pressureSize: true, pressureOpacity: true, size: 40, spacing: 25,
  });
  assert.equal(samples[0].sizeScale, 0.1);
  assert.equal(samples[0].opacityScale, 0);
  assert.equal(samples.at(-1).sizeScale, 0.1);
  assert.equal(samples.at(-1).x, 400);
  const middle = samples.filter((sample) => sample.x >= 100 && sample.x <= 300);
  assert.ok(middle.every((sample) => sample.sizeScale === 1 && sample.opacityScale === 1));
  // Sizes rise monotonically over the start taper and fall over the end taper.
  const start = samples.filter((sample) => sample.x <= 100), end = samples.filter((sample) => sample.x >= 300);
  for (let index = 1; index < start.length; index += 1) assert.ok(start[index].sizeScale >= start[index - 1].sizeScale);
  for (let index = 1; index < end.length; index += 1) assert.ok(end[index].sizeScale <= end[index - 1].sizeScale);
  // Spacing follows the current diameter, so the tips are denser than the body.
  const firstGap = samples[1].x - samples[0].x, bodyGap = middle[1].x - middle[0].x;
  assert.ok(firstGap < bodyGap / 4, `${firstGap} vs ${bodyGap}`);
  assert.equal(bodyGap, 10);
});

test('sampling is deterministic and bounded by the sample limit', () => {
  const contours = flattenStrokePath(cubicArc);
  const options = { ...DEFAULT_STROKE_PATH_SETTINGS, size: 12, spacing: 10 };
  assert.deepEqual(sampleStrokePath(contours, options), sampleStrokePath(contours, options));
  const long = flattenStrokePath(path([{ x: 0, y: 0 }, { x: 900_000, y: 0 }]));
  const bounded = sampleStrokePath(long, { ...noPressure, size: 1, spacing: 1 });
  assert.equal(bounded.limited, true);
  assert.ok(bounded.samples.length <= STROKE_PATH_MAX_SAMPLES);
  assert.ok(bounded.spacingScale > 1);
  const small = sampleStrokePath(flattenStrokePath(line), { ...noPressure, size: 10, spacing: 10, maxSamples: 5 });
  assert.equal(small.limited, true);
  assert.ok(small.samples.length <= 5);
  // Minimum step keeps tiny brushes bounded too (0.5 px).
  const tiny = sampleStrokePath(flattenStrokePath(line), { ...noPressure, size: 1, spacing: 1 });
  assert.equal(tiny.samples.length, 201);
});

test('degenerate and malformed input is handled or rejected', () => {
  const dot = sampleStrokePath(flattenStrokePath(path([{ x: 5, y: 6 }])), { ...DEFAULT_STROKE_PATH_SETTINGS, size: 10, spacing: 25 });
  assert.equal(dot.samples.length, 1);
  assert.deepEqual({ x: dot.samples[0].x, y: dot.samples[0].y, pressure: dot.samples[0].pressure }, { x: 5, y: 6, pressure: 1 });
  // Coincident anchors keep a usable tangent.
  const repeated = sampleStrokePath(flattenStrokePath(path([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }])), { ...noPressure, size: 10, spacing: 100 });
  assert.deepEqual(repeated.samples[0].direction, { x: 0, y: 1 });
  assert.throws(() => flattenStrokePath({ nodes: [] }), /Path/);
  assert.throws(() => flattenStrokePath(line, [1, 0, 0, 1, Number.NaN, 0]), /matrix/);
  assert.throws(() => flattenStrokePath(line, [1e9, 0, 0, 1e9, 0, 0]), /too far/);
  assert.throws(() => sampleStrokePath(flattenStrokePath(line), { ...noPressure, size: 0, spacing: 25 }), /size/);
  assert.throws(() => sampleStrokePath(flattenStrokePath(line), { ...noPressure, size: 5, spacing: Number.NaN }), /spacing/);
  assert.throws(() => sampleStrokePath('x', { ...noPressure, size: 5, spacing: 25 }), /contours/);
});

test('source and target choices follow the active layer and scope', () => {
  const layers = [
    { id: 'bg', name: 'Background', kind: 'raster', visible: true, matrix: [1, 0, 0, 1, 0, 0] },
    { id: 'paint', name: 'Paint', kind: 'raster', visible: true, matrix: [1, 0, 0, 1, 0, 0] },
    { id: 'p1', name: 'Lashes', kind: 'path', visible: false, matrix: [1, 0, 0, 1, 0, 0], path: line },
    { id: 'text', name: 'Title', kind: 'text', visible: true, matrix: [1, 0, 0, 1, 0, 0] },
    { id: 'p2', name: 'Halo', kind: 'path', visible: true, matrix: [1, 0, 0, 1, 0, 0], path: cubicArc },
  ];
  assert.deepEqual(defaultStrokePathChoice(layers, 'paint'), { pathLayerId: 'p2', targetLayerId: 'paint' });
  assert.deepEqual(defaultStrokePathChoice(layers, 'paint', ['p1']), { pathLayerId: 'p1', targetLayerId: 'paint' });
  assert.deepEqual(defaultStrokePathChoice(layers, 'p1'), { pathLayerId: 'p1', targetLayerId: 'paint' });
  assert.deepEqual(defaultStrokePathChoice(layers, 'p2'), { pathLayerId: 'p2', targetLayerId: 'paint' });
  assert.deepEqual(defaultStrokePathChoice(layers, 'text'), { pathLayerId: 'p2', targetLayerId: 'paint' });
  assert.deepEqual(defaultStrokePathChoice(layers, 'p2', [], (layer) => layer.id === 'bg'), { pathLayerId: 'p2', targetLayerId: 'bg' });
  assert.deepEqual(defaultStrokePathChoice([layers[2], layers[1]], 'p1'), { pathLayerId: 'p1', targetLayerId: 'paint' });
  assert.deepEqual(defaultStrokePathChoice([layers[0]], 'bg'), { pathLayerId: undefined, targetLayerId: 'bg' });
  assert.deepEqual(strokePathSources(layers, 'p1', 'selected').map((layer) => layer.id), ['p1']);
  assert.deepEqual(strokePathSources(layers, 'paint', 'selected'), []);
  assert.deepEqual(strokePathSources(layers, undefined, 'all').map((layer) => layer.id), ['p2']);
});
