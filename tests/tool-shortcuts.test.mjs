import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolShortcutPreferences } from '../src/toolShortcuts.ts';

const tools = ['move', 'brush', 'text'];

test('tool shortcut preferences accept one-character overrides and reject collisions', () => {
  assert.deepEqual(normalizeToolShortcutPreferences({ bindings: {
    brush: 'B', text: 't', move: 't', unknown: 'x', bad: '!!',
  } }, tools), {
    version: 1,
    bindings: { brush: 'b', text: 't' },
  });
});

test('tool shortcut preferences fail closed for malformed or unsupported versions', () => {
  assert.deepEqual(normalizeToolShortcutPreferences(null, tools), { version: 1, bindings: {} });
  assert.deepEqual(normalizeToolShortcutPreferences({ version: 8, bindings: { brush: 'b' } }, tools), { version: 1, bindings: {} });
});
