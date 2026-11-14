import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RETOUCH_KEY_FAMILY,
  TOOL_KEY_FAMILIES,
  TOOL_KEY_SINGLES,
  compactToolKeyLabel,
  resolveToolKey,
  toolKeyLabel,
} from '../src/toolKeys.ts';
import { TOOL_CATEGORIES } from '../src/toolPalette.ts';

const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const toolsBlock = pageSource.slice(
  pageSource.indexOf('const TOOLS: { id: Tool;'),
  pageSource.indexOf('/** Icons of the "More panels" strip'),
);
// Every palette tool with the key the toolbar badge, tooltip and flyout show.
const advertised = [...toolsBlock.matchAll(/id: '([a-z-]+)',\s*label: '[^']+',\s*icon: toolIcon\('[a-z-]+'\),\s*key: '([^']*)'/g)]
  .map(([, id, key]) => ({ id, key }));

/** Press a key the way a user would until the tool is reached. */
function reach(tool, label, from) {
  const shift = label.startsWith('Shift+');
  const key = label.slice(-1).toLowerCase();
  let current = from;
  for (let press = 0; press < 8; press++) {
    current = resolveToolKey({ key: shift ? key.toUpperCase() : key, shiftKey: shift }, current);
    if (current === tool) return press + 1;
  }
  return 0;
}

test('the toolbar advertises a key for every palette tool except the anchor pens', () => {
  const ids = TOOL_CATEGORIES.flatMap((category) => category.tools);
  assert.equal(advertised.length, ids.length, 'every TOOLS entry was parsed');
  for (const { id, key } of advertised) {
    if (['add-anchor', 'delete-anchor', 'convert-point'].includes(id)) assert.equal(key, '', id);
    else assert.ok(key, `${id} advertises a key`);
  }
});

test('every advertised tool key selects that tool from any other tool', () => {
  for (const { id, key } of advertised) {
    if (!key) continue;
    assert.equal(toolKeyLabel(id), key, `${id} badge matches src/toolKeys.ts`);
    for (const from of ['brush', 'move', 'rotate-view', 'text', 'smudge', 'lasso']) {
      assert.ok(reach(id, key, from) > 0, `${key} reaches ${id} from ${from}`);
    }
  }
});

test('V, H, Z and T select Move, Hand, Zoom and Horizontal Type (production defect)', () => {
  assert.equal(resolveToolKey({ key: 'h' }, 'brush'), 'hand');
  assert.equal(resolveToolKey({ key: 'v' }, 'brush'), 'move');
  assert.equal(resolveToolKey({ key: 'z' }, 'brush'), 'zoom');
  assert.equal(resolveToolKey({ key: 't' }, 'brush'), 'text');
  assert.equal(resolveToolKey({ key: 't' }, 'text'), 'vertical-text');
  assert.equal(resolveToolKey({ key: 'T', shiftKey: true }, 'text'), 'vertical-text-mask');
  assert.deepEqual(TOOL_KEY_SINGLES, { v: 'move', h: 'hand', z: 'zoom', r: 'rotate-view' });
});

test('R is Rotate View and Shift+R reaches and cycles Smudge, Blur and Sharpen from any tool', () => {
  assert.equal(resolveToolKey({ key: 'r' }, 'smudge'), 'rotate-view');
  assert.equal(resolveToolKey({ key: 'r' }, 'brush'), 'rotate-view');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'brush'), 'smudge');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'brush', 'sharpen'), 'sharpen');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'rotate-view', 'blur'), 'blur');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'smudge'), 'blur');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'blur'), 'sharpen');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'sharpen'), 'smudge');
  assert.equal(resolveToolKey({ key: 'R', shiftKey: true }, 'brush', 'not-a-tool'), 'smudge');
  assert.deepEqual(RETOUCH_KEY_FAMILY, ['smudge', 'blur', 'sharpen']);
  for (const tool of RETOUCH_KEY_FAMILY) assert.equal(toolKeyLabel(tool), 'Shift+R');
  assert.equal(compactToolKeyLabel('Shift+R'), '⇧R');
  assert.equal(compactToolKeyLabel('B'), 'B');
});

test('families cycle forward, Shift cycles back, and modifier chords never select tools', () => {
  assert.equal(resolveToolKey({ key: 'b' }, 'brush'), 'pencil');
  assert.equal(resolveToolKey({ key: 'B', shiftKey: true }, 'brush'), 'mixer-brush');
  assert.equal(resolveToolKey({ key: 'u' }, 'custom-shape'), 'rectangle');
  assert.equal(resolveToolKey({ key: 'h', ctrlKey: true }, 'brush'), undefined);
  assert.equal(resolveToolKey({ key: 'v', metaKey: true }, 'brush'), undefined);
  assert.equal(resolveToolKey({ key: 'z', altKey: true }, 'brush'), undefined);
  assert.equal(resolveToolKey({ key: 'Enter' }, 'brush'), undefined);
  for (const letter of ['d', 'f', 'q', 'x', 'n']) assert.equal(resolveToolKey({ key: letter }, 'brush'), undefined, letter);
  for (const [key, tools] of Object.entries(TOOL_KEY_FAMILIES)) assert.ok(tools.length >= 2, key);
});

test('the keydown handler uses the shared resolver instead of a private key table', () => {
  assert.match(pageSource, /resolveToolKey\(e, tool, lastRFamilyTool\.current\)/);
  assert.doesNotMatch(pageSource, /const TOOL_GROUPS: Record<string, Tool\[\]>/);
  assert.doesNotMatch(pageSource, /const TOOL_ALIASES: Record<string, Tool>/);
});
