import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_PRESSURE_CURVES,
  mapBrushPressure,
  normalizeBrushPressureCurve,
  validBrushPressureCurve,
} from '../src/brushPressure.ts';
import { resolveBrushStamp } from '../src/brush.ts';

test('pressure curves are finite, bounded and monotonic', () => {
  assert.deepEqual(BRUSH_PRESSURE_CURVES, ['linear', 'soft', 'firm']);
  for (const curve of BRUSH_PRESSURE_CURVES) {
    const values = [0, 0.25, 0.5, 0.75, 1].map((pressure) => mapBrushPressure(pressure, curve));
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 1);
    assert.ok(values.every((value) => value >= 0 && value <= 1));
    assert.ok(values.every((value, index) => index === 0 || value >= values[index - 1]));
  }
  assert.ok(mapBrushPressure(0.25, 'soft') > mapBrushPressure(0.25, 'linear'));
  assert.ok(mapBrushPressure(0.25, 'firm') < mapBrushPressure(0.25, 'linear'));
});

test('pressure curve normalization fails closed and preserves legacy defaults', () => {
  assert.equal(normalizeBrushPressureCurve(undefined), 'linear');
  assert.equal(normalizeBrushPressureCurve('invalid'), 'linear');
  assert.equal(validBrushPressureCurve('soft'), true);
  assert.equal(validBrushPressureCurve('invalid'), false);
  assert.throws(() => mapBrushPressure(Number.NaN, 'linear'));
  assert.throws(() => mapBrushPressure(0.5, 'invalid'));
});

test('resolved brush stamps use the selected curve only when pressure mapping is enabled', () => {
  const base = {
    size: 100,
    hardness: 100,
    opacity: 1,
    pointerType: 'pen',
    pressure: 0.25,
    pressureSize: true,
    pressureOpacity: true,
  };
  const soft = resolveBrushStamp({ ...base, pressureCurve: 'soft' });
  const firm = resolveBrushStamp({ ...base, pressureCurve: 'firm' });
  const disabled = resolveBrushStamp({ ...base, pressureSize: false, pressureOpacity: false, pressureCurve: 'firm' });
  assert.equal(soft.size, 50);
  assert.equal(soft.opacity, 0.5);
  assert.equal(firm.size, 6.25);
  assert.equal(firm.opacity, 0.0625);
  assert.equal(disabled.size, 100);
  assert.equal(disabled.opacity, 1);
  assert.equal(disabled.pressureCurve, 'firm');
});
