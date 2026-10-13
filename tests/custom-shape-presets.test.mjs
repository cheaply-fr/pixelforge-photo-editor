import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomShapePresets, validCustomShapePreset } from '../src/customShapePresets.ts';

test('custom shape presets validate, trim labels and normalize colors', () => {
  const value = { id: '12345678-abcd', label: '  Star  ', kind: 'polygon', color: '#AABBCC' };
  assert.equal(validCustomShapePreset(value), true);
  assert.deepEqual(normalizeCustomShapePresets([value]), [{ ...value, label: 'Star', color: '#aabbcc' }]);
});

test('custom shape presets reject malformed, duplicate and oversized entries', () => {
  const valid = { id: '12345678-abcd', label: 'Shape', kind: 'rectangle', color: '#112233' };
  assert.equal(validCustomShapePreset({ ...valid, kind: 'triangle' }), false);
  const many = Array.from({ length: 40 }, (_, index) => ({ ...valid, id: `12345678-${String(index).padStart(4, '0')}` }));
  const normalized = normalizeCustomShapePresets([valid, valid, ...many]);
  assert.equal(normalized.length, 32);
  assert.equal(new Set(normalized.map((item) => item.id)).size, 32);
});
