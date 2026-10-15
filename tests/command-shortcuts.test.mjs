import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commandShortcutMatches,
  normalizeCommandShortcutChord,
  normalizeCommandShortcutPreferences,
} from '../src/commandShortcuts.ts';

const commands = ['undo', 'zoom-in', 'fill-layer', 'hide-layer'];

test('command shortcut chords accept punctuation and function keys', () => {
  assert.equal(normalizeCommandShortcutChord(' Ctrl + Shift + F5 '), 'ctrl+shift+f5');
  assert.equal(normalizeCommandShortcutChord('ctrl+,'), 'ctrl+,');
  assert.equal(normalizeCommandShortcutChord('−'), '-');
  assert.equal(normalizeCommandShortcutChord('ctrl+enter'), undefined);
});

test('command shortcut preferences reject malformed versions and collisions', () => {
  assert.deepEqual(normalizeCommandShortcutPreferences({ bindings: {
    undo: 'cmd+z', 'zoom-in': 'cmd+z', 'fill-layer': 'shift+f5', unknown: 'x',
  } }, commands), {
    version: 1,
    bindings: { undo: 'meta+z', 'fill-layer': 'shift+f5' },
  });
  assert.deepEqual(normalizeCommandShortcutPreferences({ version: 9, bindings: { undo: 'z' } }, commands), { version: 1, bindings: {} });
});

test('command shortcut matching requires the exact modifier set', () => {
  assert.equal(commandShortcutMatches('cmd+shift+f5', { key: 'F5', metaKey: true, shiftKey: true }), true);
  assert.equal(commandShortcutMatches('cmd+shift+f5', { key: 'F5', metaKey: true }), false);
  assert.equal(commandShortcutMatches('ctrl+,', { key: ',', ctrlKey: true }), true);
  assert.equal(commandShortcutMatches('-', { key: '−' }), true);
});
