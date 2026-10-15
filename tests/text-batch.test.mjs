import test from 'node:test';
import assert from 'node:assert/strict';
import { updateAllTextLayers } from '../src/textBatch.ts';

const frame = { w: 100, h: 100, layers: [
  { id: 'text', kind: 'text', fontFamily: 'Arial', fontSize: 20, text: 'A' },
  { id: 'raster', kind: 'raster', source: 'asset', opacity: 1 },
] };

test('updateAllTextLayers changes only editable text layers', () => {
  const result = updateAllTextLayers(frame, { fontFamily: 'Georgia', fontSize: 32 });
  assert.equal(result.updated, 1);
  assert.equal(result.frame.layers[0].fontFamily, 'Georgia');
  assert.equal(result.frame.layers[0].fontSize, 32);
  assert.deepEqual(result.frame.layers[1], frame.layers[1]);
  assert.equal(frame.layers[0].fontFamily, 'Arial');
});

test('updateAllTextLayers keeps the original frame when no text exists', () => {
  const empty = { ...frame, layers: [frame.layers[1]] };
  const result = updateAllTextLayers(empty, { bold: true });
  assert.equal(result.updated, 0);
  assert.equal(result.frame, empty);
});

test('updateAllTextLayers rejects unsupported values', () => {
  assert.throws(() => updateAllTextLayers(frame, { fontFamily: 'Comic Sans' }), /Unsupported/);
  assert.throws(() => updateAllTextLayers(frame, { fontSize: 0 }), /between/);
});
