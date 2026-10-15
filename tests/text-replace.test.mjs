import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceTextLayers } from '../src/textReplace.ts';

const frame = {
  w: 400, h: 200, active: 'headline', layers: [
    { id: 'headline', kind: 'text', text: 'Hello hello HELLO world', x: 0, y: 0, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true, locked: false, adjustments: {} },
    { id: 'shape', kind: 'rectangle', width: 20, height: 20, x: 0, y: 0, matrix: [1, 0, 0, 1, 0, 0], opacity: 1, visible: true, locked: false, adjustments: {} },
  ],
};

test('replaces case-insensitive matches only in editable text layers', () => {
  const result = replaceTextLayers(frame, { find: 'hello', replace: 'Hi' });
  assert.equal(result.replacements, 3);
  assert.equal(result.layersChanged, 1);
  assert.equal(result.frame.layers[0].text, 'Hi Hi Hi world');
  assert.equal(result.frame.layers[1], frame.layers[1]);
  assert.equal(frame.layers[0].text, 'Hello hello HELLO world');
});

test('supports match-case and whole-word boundaries without mutating no-op frames', () => {
  const result = replaceTextLayers(frame, { find: 'hello', replace: 'X', matchCase: true, wholeWord: true });
  assert.equal(result.replacements, 1);
  assert.equal(result.frame.layers[0].text, 'Hello X HELLO world');
  const noop = replaceTextLayers(frame, { find: 'missing', replace: 'X' });
  assert.equal(noop.frame, frame);
  assert.equal(noop.replacements, 0);
});
