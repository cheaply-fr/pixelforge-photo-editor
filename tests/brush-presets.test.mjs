import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRUSH_PRESETS,
  brushPresetById,
  validBrushPreset,
  validBrushPresetId,
} from '../src/brushPresets.ts';

test('built-in brush presets are finite, bounded and deterministic', () => {
  assert.ok(BRUSH_PRESETS.length >= 3);
  const ids = new Set();
  for (const preset of BRUSH_PRESETS) {
    assert.equal(validBrushPreset(preset), true);
    assert.equal(ids.has(preset.id), false);
    ids.add(preset.id);
    assert.equal(brushPresetById(preset.id)?.label, preset.label);
  }
  assert.equal(validBrushPresetId('round-hard'), true);
  assert.equal(validBrushPresetId('remote-pixels'), false);
  assert.equal(brushPresetById('missing'), undefined);
});

test('preset validation rejects unbounded or executable-looking values', () => {
  const preset = { ...BRUSH_PRESETS[0] };
  assert.equal(validBrushPreset({ ...preset, size: 0 }), false);
  assert.equal(validBrushPreset({ ...preset, spacing: 1001 }), false);
  assert.equal(validBrushPreset({ ...preset, label: 'x'.repeat(81) }), false);
  assert.equal(validBrushPreset({ ...preset, id: 'data:text/plain,pixels' }), false);
  assert.equal(validBrushPreset({ ...preset, pressureSize: 'yes' }), false);
});

