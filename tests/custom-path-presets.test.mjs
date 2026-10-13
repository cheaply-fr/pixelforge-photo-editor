import assert from 'node:assert/strict';
import test from 'node:test';
import { createCustomPathPreset, normalizeCustomPathPresets, validCustomPathPreset } from '../src/customPathPresets.ts';

const path = {
  nodes: [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 4, y: 7 }],
  closed: true,
  fill: true,
  stroke: true,
  strokeWidth: 2,
  fillColor: '#ff0000',
  strokeColor: '#000000',
};

test('custom path presets clone editable geometry and normalize labels', () => {
  const preset = createCustomPathPreset({ label: '  Badge  ', path });
  assert.equal(preset.label, 'Badge');
  path.nodes[0].x = 99;
  assert.equal(preset.path.nodes[0].x, 1);
  assert.equal(validCustomPathPreset(preset), true);
});

test('custom path normalization rejects malformed paths, duplicate ids and caps the library', () => {
  const first = { id: '11111111-1111-1111-1111-111111111111', label: 'one', path };
  const malformed = { id: '22222222-2222-2222-2222-222222222222', label: 'bad', path: { ...path, nodes: [] } };
  const values = [first, { ...first, label: 'duplicate' }, malformed];
  for (let i = 0; i < 40; i += 1) values.push({ ...first, id: `${i.toString(16).padStart(8, '0')}-1111-1111-1111-111111111111`, label: `path-${i}` });
  const normalized = normalizeCustomPathPresets(values);
  assert.equal(normalized.length, 32);
  assert.equal(normalized[0].label, 'one');
  assert.equal(normalized.some((item) => item.label === 'bad'), false);
});
