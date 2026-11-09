import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TOOL_CATEGORIES,
  TOOL_FAMILIES,
  TOOL_FLYOUTS,
  TOOL_ICONS,
  TYPE_TOOLS,
  categoryForTool,
  compactCategoryTools,
  cycleFamilyTool,
  familyForTool,
  flyoutForTool,
  flyoutTools,
  typeToolMode,
} from '../src/toolPalette.ts';
import { TOOL_SECTIONS, sectionForTool } from '../src/sidebarSections.ts';
import { normalizeToolFamilyChoices, serializeToolFamilyChoices } from '../src/toolFamilyChoices.ts';
import { TEXT_MASK_MAX_TEXT, typeMaskEntryText } from '../src/textMask.ts';
import { prepareDraftForStorage, validateDraft } from '../src/drafts.ts';
import { neutral } from '../src/document.ts';

const draw = TOOL_CATEGORIES.find((category) => category.id === 'draw');
const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('the T family lists Photoshop type tools in toolbar order', () => {
  assert.deepEqual([...TYPE_TOOLS], ['text', 'vertical-text', 'text-mask', 'vertical-text-mask']);
  assert.deepEqual(TOOL_FAMILIES.t, TYPE_TOOLS);
  assert.deepEqual(TOOL_FLYOUTS.type, TYPE_TOOLS);
  for (const tool of TYPE_TOOLS) {
    assert.equal(familyForTool(tool), 't', tool);
    assert.equal(flyoutForTool(tool), 'type', tool);
    assert.equal(categoryForTool(tool), 'draw', tool);
    assert.deepEqual(flyoutTools(tool), TYPE_TOOLS);
  }
});

test('T cycles forward and Shift+T cycles backward with wrap-around', () => {
  assert.equal(cycleFamilyTool('text', 't'), 'vertical-text');
  assert.equal(cycleFamilyTool('vertical-text', 't'), 'text-mask');
  assert.equal(cycleFamilyTool('text-mask', 't'), 'vertical-text-mask');
  assert.equal(cycleFamilyTool('vertical-text-mask', 't'), 'text');
  assert.equal(cycleFamilyTool('text', 't', true), 'vertical-text-mask');
  assert.equal(cycleFamilyTool('vertical-text-mask', 't', true), 'text-mask');
  // From outside the family the first press selects Horizontal Type.
  assert.equal(cycleFamilyTool('brush', 't'), 'text');
  let tool = 'text';
  for (let step = 0; step < TYPE_TOOLS.length; step += 1) tool = cycleFamilyTool(tool, 't');
  assert.equal(tool, 'text');
});

test('the editor keyboard group mirrors the shared T family', () => {
  assert.match(pageSource, /\r?\n  t: \[\.\.\.TYPE_TOOLS\],\r?\n/);
  for (const [id, label] of [
    ['vertical-text', 'Vertical Type'],
    ['text-mask', 'Horizontal Type Mask'],
    ['vertical-text-mask', 'Vertical Type Mask'],
  ])
    assert.match(pageSource, new RegExp(`id: '${id}', label: '${label}', icon: toolIcon\\('${id}'\\), key: 'T'`));
});

test('type tool modes resolve orientation and mask output', () => {
  assert.deepEqual(typeToolMode('text'), { orientation: 'horizontal', mask: false });
  assert.deepEqual(typeToolMode('vertical-text'), { orientation: 'vertical', mask: false });
  assert.deepEqual(typeToolMode('text-mask'), { orientation: 'horizontal', mask: true });
  assert.deepEqual(typeToolMode('vertical-text-mask'), { orientation: 'vertical', mask: true });
  for (const other of ['brush', 'select', '', 'TEXT', 'type'])
    assert.equal(typeToolMode(other), undefined, other);
});

test('the draw category keeps one type slot that shows the active or remembered variant', () => {
  assert.deepEqual(compactCategoryTools(draw), ['pen', 'direct-select', 'text', 'rectangle']);
  for (const tool of TYPE_TOOLS)
    assert.deepEqual(compactCategoryTools(draw, tool), ['pen', 'direct-select', tool, 'rectangle']);
  assert.deepEqual(
    compactCategoryTools(draw, 'move', { type: 'vertical-text-mask' }),
    ['pen', 'direct-select', 'vertical-text-mask', 'rectangle'],
  );
  assert.deepEqual(
    compactCategoryTools(draw, 'vertical-text', { type: 'text-mask' }),
    ['pen', 'direct-select', 'vertical-text', 'rectangle'],
  );
});

test('type tools have distinct icons and the remembered flyout choice persists', () => {
  const icons = TYPE_TOOLS.map((tool) => TOOL_ICONS[tool]);
  assert.deepEqual(icons, ['Type', 'ArrowDownAZ', 'SquareDashedText', 'TypeOutline']);
  assert.equal(new Set(icons).size, icons.length);
  assert.deepEqual(normalizeToolFamilyChoices({ version: 1, choices: { type: 'text-mask' } }), { type: 'text-mask' });
  assert.deepEqual(normalizeToolFamilyChoices({ version: 1, choices: { type: 'brush' } }), {});
  assert.equal(
    serializeToolFamilyChoices({ type: 'vertical-text' }),
    '{"version":1,"choices":{"type":"vertical-text"}}',
  );
});

test('every type tool opens the Text sidebar section', () => {
  for (const tool of TYPE_TOOLS) {
    assert.equal(TOOL_SECTIONS[tool], 'text', tool);
    assert.equal(sectionForTool(tool), 'text', tool);
  }
});

test('type mask entries reject blank, oversized and non-string text', () => {
  assert.deepEqual(typeMaskEntryText('ABCD'), { ok: true, text: 'ABCD' });
  assert.deepEqual(typeMaskEntryText('  lead'), { ok: true, text: '  lead' });
  assert.deepEqual(typeMaskEntryText('A\r\nB\rC'), { ok: true, text: 'A\nB\nC' });
  for (const blank of ['', '   ', '\n\t'])
    assert.equal(typeMaskEntryText(blank).ok, false, JSON.stringify(blank));
  for (const invalid of [undefined, null, 4, ['A'], { text: 'A' }])
    assert.equal(typeMaskEntryText(invalid).ok, false);
  assert.equal(typeMaskEntryText('x'.repeat(TEXT_MASK_MAX_TEXT)).ok, true);
  const tooLong = typeMaskEntryText('x'.repeat(TEXT_MASK_MAX_TEXT + 1));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /limited to 10000 characters/);
});

test('each type tool survives draft storage validation as the selected tool', () => {
  const layerId = '22222222-2222-4222-8222-222222222222';
  for (const tool of TYPE_TOOLS) {
    const draft = {
      version: 2,
      name: 'Type tool fixture',
      index: 0,
      settings: { tool, zoom: 100, color: '#000000', size: 18, text: 'ABCD', fontSize: 56, ...neutral },
      assets: {},
      history: [{
        w: 64, h: 64, active: layerId,
        layers: [{
          id: layerId, name: 'Vertical text', visible: true, locked: false,
          opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 4, 4],
          adjustments: { ...neutral }, kind: 'text', text: 'ABCD', fontSize: 12,
          fontFamily: 'Arial', bold: true, color: '#000000', boxWidth: 60,
          textAlign: 'left', lineHeight: 1.2, letterSpacing: 0, orientation: 'vertical',
        }],
      }],
    };
    const reopened = validateDraft(JSON.parse(JSON.stringify(prepareDraftForStorage(draft))));
    assert.equal(reopened.settings.tool, tool);
    assert.equal(reopened.history[0].layers[0].orientation, 'vertical');
  }
  assert.throws(() => validateDraft({
    version: 2, name: 'Bad', index: 0,
    settings: { tool: 'type-mask', zoom: 100, color: '#000000', size: 18, text: '', fontSize: 56, ...neutral },
    assets: {}, history: [{ w: 1, h: 1, active: '', layers: [] }],
  }));
});
