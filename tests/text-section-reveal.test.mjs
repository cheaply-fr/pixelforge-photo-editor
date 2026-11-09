import test from 'node:test';
import assert from 'node:assert/strict';
import { textSectionToReveal } from '../src/textSectionReveal.ts';

test('selecting a text layer reveals the Text section once', () => {
  assert.equal(textSectionToReveal({ id: 'a', kind: 'text' }, undefined), 'text');
  assert.equal(textSectionToReveal({ id: 'a', kind: 'text' }, 'b'), 'text');
  // Re-selecting the layer revealed last does not scroll again.
  assert.equal(textSectionToReveal({ id: 'a', kind: 'text' }, 'a'), undefined);
});

test('other layers and no selection leave the panel alone', () => {
  for (const kind of ['raster', 'path', 'shape', 'adjustment', 'smart-object'])
    assert.equal(textSectionToReveal({ id: 'a', kind }, undefined), undefined, kind);
  assert.equal(textSectionToReveal(undefined, 'a'), undefined);
});
