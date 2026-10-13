import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCustomBrushPreset,
  normalizeCustomBrushPresets,
  validCustomBrushPreset,
} from '../src/customBrushPresets.ts';

const values = {
  size: 24,
  hardness: 70,
  spacing: 18,
  angle: 12,
  roundness: 92,
  flipX: false,
  flipY: true,
  pressureSize: true,
  pressureOpacity: false,
  brushSmoothing: 20,
  brushScatter: 4,
  brushTexture: 6,
  brushDual: 0,
  secondaryBrushPreset: 'none',
  brushBristle: 0,
  brushWetEdges: 0,
  brushBuildUp: 0,
  brushFlow: 90,
};

test('custom brush presets validate, trim labels and round-trip bounded settings', () => {
  const preset = createCustomBrushPreset('00000000-0000-4000-8000-000000000001', '  Studio ink  ', values);
  assert.equal(preset.label, 'Studio ink');
  assert.equal(validCustomBrushPreset(preset), true);
  assert.deepEqual(normalizeCustomBrushPresets([preset]), [preset]);
});

test('custom brush preset normalization rejects malformed, duplicate and oversized entries', () => {
  const first = createCustomBrushPreset('00000000-0000-4000-8000-000000000001', 'First', values);
  const second = createCustomBrushPreset('00000000-0000-4000-8000-000000000002', 'Second', values);
  const normalized = normalizeCustomBrushPresets([first, first, { ...second, size: 0 }, second]);
  assert.deepEqual(normalized, [first, second]);
  assert.equal(normalizeCustomBrushPresets(Array.from({ length: 40 }, (_, index) => ({ ...first, id: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000001` }))).length, 32);
  assert.throws(() => createCustomBrushPreset('bad', 'x', values), /invalid/);
});

test('custom brush preset migration defaults newly added dynamics safely', () => {
  const legacy = { ...values };
  delete legacy.secondaryBrushPreset;
  delete legacy.brushWetEdges;
  delete legacy.brushBuildUp;
  const legacyPreset = {
    id: '00000000-0000-4000-8000-000000000003',
    label: 'Legacy',
    ...legacy,
  };
  const [normalized] = normalizeCustomBrushPresets([legacyPreset]);
  assert.equal(normalized?.secondaryBrushPreset, 'none');
  assert.equal(normalized?.brushWetEdges, 0);
  assert.equal(normalized?.brushBuildUp, 0);
});
