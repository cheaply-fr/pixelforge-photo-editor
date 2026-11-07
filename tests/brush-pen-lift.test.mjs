import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_PEN_LIFT_PRESSURE,
  applyRadialStamp,
  isBrushPenLift,
  normalizeBrushPressure,
  resolveBrushStamp,
} from '../src/brush.ts';
import { BRUSH_PRESSURE_CURVES, mapBrushPressure } from '../src/brushPressure.ts';

const base = { size: 20, hardness: 100, opacity: 1 };
const paint = (overrides) => {
  const pixels = new Uint8ClampedArray(21 * 21 * 4);
  const result = applyRadialStamp(pixels, {
    width: 21, height: 21, x: 10, y: 10, mode: 'source-over', color: [255, 0, 0, 255], ...base, ...overrides,
  });
  let painted = 0;
  for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] > 0) painted += 1;
  return { changed: result.changed, painted };
};

test('pen pressure 0 is a real reading; mouse and zero touch pressure stay full', () => {
  assert.equal(normalizeBrushPressure('pen', 0), 0);
  assert.equal(normalizeBrushPressure('pen', 0.004), 0.004);
  assert.equal(normalizeBrushPressure('pen', 1), 1);
  assert.equal(normalizeBrushPressure('pen', undefined), 1);
  assert.equal(normalizeBrushPressure('pen', Number.NaN), 1);
  assert.equal(normalizeBrushPressure('pen', -0.1), 1);
  assert.equal(normalizeBrushPressure('mouse', 0), 1);
  assert.equal(normalizeBrushPressure('mouse', 0.5), 1);
  assert.equal(normalizeBrushPressure('touch', 0), 1);
  assert.equal(normalizeBrushPressure('touch', 0.3), 0.3);
});

test('every pressure curve has a 0 floor', () => {
  for (const curve of BRUSH_PRESSURE_CURVES) assert.equal(mapBrushPressure(0, curve), 0);
});

test('near-zero pen pressure paints nothing when a pressure mapping is enabled', () => {
  for (const flags of [{ pressureSize: true }, { pressureOpacity: true }, { pressureSize: true, pressureOpacity: true }])
    for (const curve of BRUSH_PRESSURE_CURVES)
      for (const pressure of [0, BRUSH_PEN_LIFT_PRESSURE / 2, BRUSH_PEN_LIFT_PRESSURE]) {
        const stamp = resolveBrushStamp({ ...base, ...flags, pressureCurve: curve, pointerType: 'pen', pressure });
        assert.equal(stamp.lifted, true);
        assert.equal(stamp.opacity, 0);
        assert.deepEqual(paint({ ...flags, pressureCurve: curve, pointerType: 'pen', pressure }), { changed: false, painted: 0 });
      }
  assert.equal(isBrushPenLift(0, { pressureSize: true }), true);
  assert.equal(isBrushPenLift(0, undefined), false);
});

test('pen pressure 1 paints, and light pressure above the lift threshold still paints', () => {
  const full = paint({ pressureSize: true, pressureOpacity: true, pointerType: 'pen', pressure: 1 });
  assert.equal(full.changed, true);
  assert.ok(full.painted > 250);
  const light = paint({ pressureSize: true, pointerType: 'pen', pressure: 0.2 });
  assert.equal(light.changed, true);
  assert.ok(light.painted > 0 && light.painted < full.painted);
});

test('pressure 0 without pressure mapping, and mouse input, paint at full strength', () => {
  const unmapped = paint({ pointerType: 'pen', pressure: 0 });
  const mouse = paint({ pressureSize: true, pressureOpacity: true, pointerType: 'mouse', pressure: 0 });
  const reference = paint({ pointerType: 'mouse', pressure: 1 });
  assert.deepEqual(unmapped, reference);
  assert.deepEqual(mouse, reference);
  assert.equal(resolveBrushStamp({ ...base, pressureSize: true, pointerType: 'mouse', pressure: 0 }).lifted, false);
  // Erasing with a lifted pen leaves pixels untouched as well.
  const pixels = new Uint8ClampedArray(21 * 21 * 4).fill(255);
  const erased = applyRadialStamp(pixels, {
    width: 21, height: 21, x: 10, y: 10, mode: 'destination-out', ...base, pressureOpacity: true, pointerType: 'pen', pressure: 0,
  });
  assert.equal(erased.changed, false);
  assert.ok(pixels.every((value) => value === 255));
});
