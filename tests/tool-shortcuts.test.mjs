import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolShortcutPreferences, normalizeToolShortcutChord, toolShortcutMatches } from '../src/toolShortcuts.ts';

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

test('tool shortcut chords normalize aliases and match exact modifiers', () => {
  assert.equal(normalizeToolShortcutChord(' Cmd + Shift + Q '), 'meta+shift+q');
  assert.equal(normalizeToolShortcutChord('option+9'), 'alt+9');
  assert.equal(normalizeToolShortcutChord('shift+shift+q'), undefined);
  assert.equal(normalizeToolShortcutChord('ctrl+enter'), undefined);
  const normalized = normalizeToolShortcutPreferences({ bindings: { brush: 'cmd+shift+b', text: 'shift+t', move: 'cmd+shift+b' } }, tools);
  assert.deepEqual(normalized.bindings, { brush: 'meta+shift+b', text: 'shift+t' });
  assert.equal(toolShortcutMatches('cmd+shift+b', { key: 'B', metaKey: true, shiftKey: true }), true);
  assert.equal(toolShortcutMatches('cmd+shift+b', { key: 'b', metaKey: true }), false);
});
