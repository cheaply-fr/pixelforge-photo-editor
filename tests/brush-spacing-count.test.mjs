import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_COUNT_MAX,
  BRUSH_SCATTER_MAX,
  DEFAULT_BRUSH_DYNAMICS,
  brushDabCount,
  brushDabRandom,
  brushDabsAt,
  brushScatterRadius,
  normalizeBrushDynamics,
  scatterBrushPoint,
  validBrushDynamics,
  wrapBrushAngle,
} from '../src/brushDynamics.ts';
import {
  BRUSH_SPACING_MAX,
  BRUSH_SPACING_MIN,
  resolveBrushStamp,
  validBrushTipSettings,
} from '../src/brush.ts';
import { spacedDabPositions } from '../src/brushSize.ts';
import { brushStampReach } from '../src/selectionClip.ts';
import { createCustomBrushPreset, normalizeCustomBrushPresets } from '../src/customBrushPresets.ts';

const dynamics = (overrides = {}) => ({ ...DEFAULT_BRUSH_DYNAMICS, ...overrides });

test('spacing accepts 1–1,000% of the diameter and rejects values outside it', () => {
  assert.equal(BRUSH_SPACING_MIN, 1);
  assert.equal(BRUSH_SPACING_MAX, 1000);
  assert.equal(validBrushTipSettings({ spacing: 500 }), true);
  assert.equal(validBrushTipSettings({ spacing: 1000 }), true);
  assert.equal(validBrushTipSettings({ spacing: 1001 }), false);
  assert.equal(validBrushTipSettings({ spacing: 0 }), false);
  assert.equal(resolveBrushStamp({ size: 20, hardness: 100, opacity: 1, spacing: 500 }).spacing, 500);
});

test('sparse spacing places dabs five diameters apart across pointer segments', () => {
  const size = 10, interval = size * 500 / 100, state = { started: false, carry: 0 };
  // Three pointer segments totalling 300 px.
  const travelled = [];
  let offset = 0;
  for (const length of [70, 130, 100]) {
    for (const t of spacedDabPositions(length, interval, state)) travelled.push(offset + t * length);
    offset += length;
  }
  assert.deepEqual(travelled.map((value) => Math.round(value)), [0, 50, 100, 150, 200, 250, 300]);
  // Gaps between neighbouring dab edges are 40 px wide: separated, not a line.
  for (let index = 1; index < travelled.length; index += 1)
    assert.equal(Math.round(travelled[index] - travelled[index - 1] - size), 40);
});

test('scatter is bounded up to 1,000% and index 0 keeps the legacy offset', () => {
  assert.equal(BRUSH_SCATTER_MAX, 1000);
  assert.equal(brushScatterRadius(20, 100), 15);
  assert.equal(brushScatterRadius(20, 1000), 150);
  assert.equal(brushScatterRadius(20, 5000), 150);
  const point = { x: 123.5, y: 77.25 };
  assert.deepEqual(scatterBrushPoint(point, 20, 80), scatterBrushPoint(point, 20, 80, { index: 0, bothAxes: true }));
  for (let index = 0; index < 64; index += 1) {
    const scattered = scatterBrushPoint({ x: index * 17, y: index * 3 }, 20, 1000, { index });
    assert.ok(Math.abs(scattered.x - index * 17) <= 150 + 1e-9);
    assert.ok(Math.abs(scattered.y - index * 3) <= 150 + 1e-9);
  }
  // Selection-confined strokes must reach every possible scattered dab.
  assert.equal(brushStampReach(20, 1000), 10 + 150 + 2);
});

test('scatter without both axes moves dabs only perpendicular to the stroke', () => {
  const direction = { x: 1, y: 0 };
  let moved = 0;
  for (let index = 0; index < 32; index += 1) {
    const point = { x: 40 + index * 9, y: 60 };
    const scattered = scatterBrushPoint(point, 30, 600, { index, direction, bothAxes: false });
    assert.equal(scattered.x, point.x);
    assert.ok(Math.abs(scattered.y - point.y) <= brushScatterRadius(30, 600) + 1e-9);
    if (scattered.y !== point.y) moved += 1;
  }
  assert.ok(moved > 24);
  // A zero-length direction (first dab of a stroke) falls back to both axes.
  const fallback = scatterBrushPoint({ x: 5, y: 5 }, 30, 600, { direction: { x: 0, y: 0 }, bothAxes: false });
  assert.deepEqual(fallback, scatterBrushPoint({ x: 5, y: 5 }, 30, 600));
});

test('count places several deterministic dabs per spacing step within scatter bounds', () => {
  const point = { x: 200, y: 140 }, size = 12, scatter = 800;
  const settings = dynamics({ count: 6 });
  const dabs = brushDabsAt(point, size, scatter, settings);
  assert.equal(dabs.length, 6);
  assert.deepEqual(dabs, brushDabsAt(point, size, scatter, settings));
  const radius = brushScatterRadius(size, scatter);
  for (const dab of dabs) {
    assert.ok(Math.abs(dab.x - point.x) <= radius + 1e-9);
    assert.ok(Math.abs(dab.y - point.y) <= radius + 1e-9);
    assert.equal(dab.sizeScale, 1);
    assert.equal(dab.angleOffset, 0);
    assert.equal(dab.opacityScale, 1);
  }
  assert.equal(new Set(dabs.map((dab) => `${dab.x},${dab.y}`)).size, 6);
  // Default dynamics with no scatter are exactly the single legacy dab.
  assert.deepEqual(brushDabsAt(point, size, 0), [{ ...point, sizeScale: 1, angleOffset: 0, opacityScale: 1 }]);
});

test('count jitter only reduces the count and never below one dab', () => {
  const counts = [];
  for (let index = 0; index < 200; index += 1)
    counts.push(brushDabCount({ x: index * 13.7, y: index * 5.1 }, dynamics({ count: 10, countJitter: 100 })));
  assert.ok(counts.every((count) => count >= 1 && count <= 10));
  assert.ok(new Set(counts).size > 4);
  assert.equal(brushDabCount({ x: 1, y: 1 }, dynamics({ count: 10, countJitter: 0 })), 10);
  assert.equal(brushDabCount({ x: 1, y: 1 }, dynamics({ count: 99 })), BRUSH_COUNT_MAX);
});

test('size, angle and opacity jitter stay within their ranges', () => {
  const settings = dynamics({ count: 4, sizeJitter: 60, angleJitter: 50, opacityJitter: 80 });
  const all = [];
  for (let step = 0; step < 50; step += 1) all.push(...brushDabsAt({ x: step * 11, y: 30 }, 40, 0, settings));
  assert.ok(all.every((dab) => dab.sizeScale >= 0.4 - 1e-9 && dab.sizeScale <= 1));
  assert.ok(all.every((dab) => dab.angleOffset >= -90 && dab.angleOffset <= 90));
  assert.ok(all.every((dab) => dab.opacityScale >= 0.2 - 1e-9 && dab.opacityScale <= 1));
  assert.ok(new Set(all.map((dab) => dab.sizeScale.toFixed(3))).size > 20);
  const random = Array.from({ length: 1000 }, (_, index) => brushDabRandom({ x: index, y: 2 * index }, index % 7, 3));
  assert.ok(random.every((value) => value >= 0 && value < 1));
  const mean = random.reduce((sum, value) => sum + value, 0) / random.length;
  assert.ok(mean > 0.4 && mean < 0.6);
  assert.equal(wrapBrushAngle(190), -170);
  assert.equal(wrapBrushAngle(-190), 170);
  assert.equal(wrapBrushAngle(180), 180);
  assert.equal(wrapBrushAngle(-180), -180);
});

test('persisted dynamics validate strictly and normalize older or partial values', () => {
  assert.equal(validBrushDynamics({}), true);
  assert.equal(validBrushDynamics({ count: 4, countJitter: 50, scatterBothAxes: false }), true);
  assert.equal(validBrushDynamics({ count: 0 }), false);
  assert.equal(validBrushDynamics({ count: 2.5 }), false);
  assert.equal(validBrushDynamics({ count: 17 }), false);
  assert.equal(validBrushDynamics({ sizeJitter: 101 }), false);
  assert.equal(validBrushDynamics({ scatterBothAxes: 'yes' }), false);
  assert.equal(validBrushDynamics([]), false);
  assert.deepEqual(normalizeBrushDynamics(undefined), DEFAULT_BRUSH_DYNAMICS);
  assert.deepEqual(normalizeBrushDynamics({ count: 40, angleJitter: -5 }), { ...DEFAULT_BRUSH_DYNAMICS, count: 16 });
});

test('custom brush presets accept wide spacing/scatter and keep older presets valid', () => {
  const base = {
    size: 30, hardness: 80, spacing: 750, angle: 0, roundness: 100, flipX: false, flipY: false,
    pressureSize: false, pressureOpacity: false, brushSmoothing: 0, brushScatter: 900, brushTexture: 0,
    brushDual: 0, secondaryBrushPreset: 'none', brushBristle: 0, brushWetEdges: 0, brushBuildUp: 0, brushFlow: 100,
  };
  const id = '00000000-0000-4000-8000-000000000001';
  const preset = createCustomBrushPreset(id, 'Stars', { ...base, brushDynamics: dynamics({ count: 5 }) });
  assert.equal(preset.spacing, 750);
  const [restored] = normalizeCustomBrushPresets([preset]);
  assert.equal(restored.brushDynamics.count, 5);
  const [legacy] = normalizeCustomBrushPresets([{ id, label: 'Old', ...base, spacing: 25, brushScatter: 10 }]);
  assert.equal(legacy.brushDynamics, undefined);
  assert.throws(() => createCustomBrushPreset(id, 'Bad', { ...base, brushDynamics: { count: 0 } }));
});
