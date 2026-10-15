import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomPatternPreset, normalizeCustomPatternPresets } from '../src/customPatternPresets.ts';

const values = { pattern: 'dots', tileSize: 24, foreground: '#112233', background: '#ddeeff' };

test('custom pattern presets validate, trim labels and normalize tile settings', () => {
  const preset = createCustomPatternPreset('00000000-0000-4000-8000-000000000011', '  Dots  ', values);
  assert.equal(preset.label, 'Dots');
  assert.deepEqual(normalizeCustomPatternPresets([preset]), [preset]);
});

test('custom pattern preset normalization rejects malformed, duplicate and oversized entries', () => {
  const first = createCustomPatternPreset('00000000-0000-4000-8000-000000000011', 'Dots', values);
  const second = createCustomPatternPreset('00000000-0000-4000-8000-000000000012', 'Grid', { ...values, pattern: 'grid' });
  assert.deepEqual(normalizeCustomPatternPresets([first, first, { ...second, foreground: 'red' }, second]), [first, second]);
  assert.equal(normalizeCustomPatternPresets(Array.from({ length: 40 }, (_, index) => ({ ...first, id: `${index.toString(16).padStart(8, '0')}-0000-4000-8000-000000000011` }))).length, 32);
  assert.throws(() => createCustomPatternPreset('bad', 'x', values), /invalid/);
});
