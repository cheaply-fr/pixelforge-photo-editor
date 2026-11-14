import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_MENU_SHORTCUTS,
  ROUTED_MENU_SHORTCUTS,
  menuShortcutChord,
  normalizeMenuShortcutLabel,
  routedMenuCommand,
} from '../src/menuShortcuts.ts';
import { TOOL_KEY_FAMILIES, resolveToolKey } from '../src/toolKeys.ts';

const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const menuBlock = pageSource.slice(
  pageSource.indexOf('const MENU_DEFS: Record<MenuName, MenuItem[]> = {'),
  pageSource.indexOf('/** Image-pixel distance a path tool press must travel'),
);
// Every `{ label, shortcut, command }` menu item, single- or multi-line, in any key order.
const advertised = [...menuBlock.matchAll(/\{([^{}]*?shortcut: '([^']+)'[^{}]*?)\}/g)].map(([, body, shortcut]) => ({
  label: /label: '([^']*)'/.exec(body)?.[1],
  command: /command: '([^']*)'/.exec(body)?.[1],
  shortcut,
}));

test('the menu definitions were parsed', () => {
  assert.ok(advertised.length >= 40, `found ${advertised.length} shortcut labels`);
  for (const item of advertised) assert.ok(item.label && item.command, JSON.stringify(item));
  assert.ok(advertised.some((item) => item.command === 'fade' && item.shortcut === 'Ctrl+Shift+F'));
  assert.ok(advertised.some((item) => item.command === 'find-layers' && item.shortcut === 'Alt+Shift+Ctrl+F'));
});

test('every shortcut shown in a menu is implemented for that command', () => {
  for (const { label, command, shortcut } of advertised) {
    const chord = normalizeMenuShortcutLabel(shortcut);
    assert.ok(chord, `${label}: ${shortcut} parses`);
    assert.ok(BUILT_IN_MENU_SHORTCUTS[chord]?.includes(command), `${label} (${shortcut}) → ${command} is handled`);
    // Single letters are tool keys: the menu's tool must be in that key's family.
    if (/^[a-z]$/.test(chord) && chord !== 'f') {
      assert.ok(TOOL_KEY_FAMILIES[chord], `${shortcut} is a tool key`);
      assert.ok(resolveToolKey({ key: chord }, 'move'), `${shortcut} selects a tool`);
    }
  }
});

test('every built-in chord in the table is advertised by some menu item', () => {
  const advertisedChords = new Set(advertised.map((item) => normalizeMenuShortcutLabel(item.shortcut)));
  for (const chord of Object.keys(BUILT_IN_MENU_SHORTCUTS)) assert.ok(advertisedChords.has(chord), chord);
});

test('menu labels normalize to one modifier order with Cmd folded into Ctrl', () => {
  assert.equal(normalizeMenuShortcutLabel('Alt+Shift+Ctrl+F'), 'ctrl+alt+shift+f');
  assert.equal(normalizeMenuShortcutLabel('Shift+Ctrl+L'), 'ctrl+shift+l');
  assert.equal(normalizeMenuShortcutLabel('Cmd+,'), 'ctrl+,');
  assert.equal(normalizeMenuShortcutLabel('Option+Backspace'), 'alt+backspace');
  assert.equal(normalizeMenuShortcutLabel('−'), '-');
  assert.equal(normalizeMenuShortcutLabel('Ctrl++'), 'ctrl++');
  assert.equal(normalizeMenuShortcutLabel('Hyper+F'), undefined);
});

test('routed commands match every modifier exactly (Ctrl+F no longer swallows Fade or Find Layers)', () => {
  assert.equal(routedMenuCommand({ key: 'f', ctrlKey: true }), 'search-commands');
  assert.equal(routedMenuCommand({ key: 'f', metaKey: true }), 'search-commands');
  assert.equal(routedMenuCommand({ key: 'F', ctrlKey: true, shiftKey: true }), 'fade');
  assert.equal(routedMenuCommand({ key: 'F', ctrlKey: true, shiftKey: true, altKey: true }), 'find-layers');
  // macOS Option can change the produced character; the physical key decides.
  assert.equal(routedMenuCommand({ key: 'Ï', code: 'KeyF', metaKey: true, shiftKey: true, altKey: true }), 'find-layers');
  assert.equal(routedMenuCommand({ key: 'Ω', code: 'KeyZ', metaKey: true, altKey: true }), 'toggle-last-state');
  assert.equal(routedMenuCommand({ key: ',', ctrlKey: true }), 'hide-layer');
  assert.equal(routedMenuCommand({ key: 'z', ctrlKey: true, altKey: true }), 'toggle-last-state');
  assert.equal(routedMenuCommand({ key: 'z', ctrlKey: true }), undefined, 'plain Ctrl+Z stays Undo');
  assert.equal(routedMenuCommand({ key: 'f' }), undefined, 'plain F stays the screen-mode cycle');
  assert.equal(routedMenuCommand({ key: 'f', ctrlKey: true, altKey: true }), undefined);
  // A non-QWERTY layout keeps its own letter: AZERTY "z" sits on KeyW.
  assert.equal(menuShortcutChord({ key: 'z', code: 'KeyW', ctrlKey: true, altKey: true }), 'ctrl+alt+z');
  assert.deepEqual(Object.values(ROUTED_MENU_SHORTCUTS).sort(), ['fade', 'find-layers', 'hide-layer', 'search-commands', 'toggle-last-state']);
});

test('the keydown handler routes these chords before the generic Ctrl handling', () => {
  assert.doesNotMatch(pageSource, /if \(command && e\.key\.toLowerCase\(\) === 'f'\)/);
  const handler = pageSource.slice(pageSource.indexOf('const key = (e: KeyboardEvent) => {'));
  const routed = handler.indexOf('if (routedCommand) {');
  const generic = handler.indexOf('if (command) {\n        const k = e.key.toLowerCase();');
  assert.ok(routed > 0 && generic > routed, 'routed menu chords run before Ctrl+Z → Undo');
});
