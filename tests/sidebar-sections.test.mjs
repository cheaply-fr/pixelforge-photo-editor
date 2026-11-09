import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMMAND_SECTIONS,
  FILTER_SECTIONS,
  LAYER_SELECTION_SECTION,
  LAYER_STYLE_IDS,
  QUICK_FILTER_SECTION,
  QUICK_MASK_SECTION,
  SIDEBAR_SECTIONS,
  SIDEBAR_SECTION_IDS,
  STYLE_SECTIONS,
  TOOLS_WITHOUT_SECTION,
  TOOL_SECTIONS,
  isSidebarSectionId,
  parseCollapsedSections,
  sectionForCommand,
  sectionForFilter,
  sectionForStyle,
  sectionForTool,
  sectionSelector,
  serializeCollapsedSections,
  toolShowsSection,
} from '../src/sidebarSections.ts';
import { TOOL_CATEGORIES } from '../src/toolPalette.ts';
import { FILTER_EFFECT_TYPES } from '../src/filterEffects.ts';
import { neutralLayerStyles } from '../src/layerStyles.ts';

const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const layersSource = readFileSync(new URL('../src/LayersPanel.tsx', import.meta.url), 'utf8');
const allTools = TOOL_CATEGORIES.flatMap((category) => category.tools);

// The exact tool list that rendered "Tool options" before the registry
// became its single source of truth. Pinned so a registry edit cannot
// silently hide or show the section for a tool.
const LEGACY_TOOL_OPTIONS_TOOLS = [
  'brush', 'pencil', 'color-replace', 'eraser', 'background-eraser', 'magic-eraser',
  'mask-brush', 'mask-eraser', 'adjustment-brush', 'dodge', 'burn', 'sponge', 'smudge',
  'blur', 'sharpen', 'clone', 'heal', 'spot-heal', 'patch', 'red-eye', 'pattern-stamp',
  'mixer-brush', 'history-brush', 'art-history-brush', 'selection-brush', 'quick-selection',
  'gradient', 'rectangle', 'ellipse', 'line', 'polygon', 'pen', 'freeform-pen',
  'curvature-pen', 'direct-select',
  // Added deliberately: lists the document's audio annotations (play/delete).
  'audio-note',
  // Path tools added after the registry; they share the Pen tool options.
  'add-anchor', 'delete-anchor', 'convert-point', 'path-select',
];

test('every palette tool has exactly one registry entry and nothing else is mapped', () => {
  assert.equal(new Set(allTools).size, allTools.length);
  assert.deepEqual(Object.keys(TOOL_SECTIONS).sort(), [...allTools].sort());
});

test('every tool resolves to a registered section or to a documented no-section reason', () => {
  for (const tool of allTools) {
    const section = sectionForTool(tool);
    if (section === null) {
      assert.ok(Object.hasOwn(TOOLS_WITHOUT_SECTION, tool), `${tool} maps to null without a reason`);
      assert.ok(TOOLS_WITHOUT_SECTION[tool].length >= 20, `${tool} reason is too thin`);
    } else {
      assert.ok(isSidebarSectionId(section), `${tool} → unknown section ${section}`);
      assert.ok(!Object.hasOwn(TOOLS_WITHOUT_SECTION, tool), `${tool} has a section and a no-section reason`);
    }
  }
  for (const tool of Object.keys(TOOLS_WITHOUT_SECTION))
    assert.equal(TOOL_SECTIONS[tool], null, `${tool} is documented as section-less but mapped`);
});

test('Tool options renders for exactly the legacy tool set', () => {
  const now = allTools.filter((tool) => toolShowsSection(tool, 'tool-options')).sort();
  assert.deepEqual(now, [...LEGACY_TOOL_OPTIONS_TOOLS].sort());
  assert.deepEqual(allTools.filter((tool) => toolShowsSection(tool, 'text')), ['text']);
  assert.deepEqual(allTools.filter((tool) => toolShowsSection(tool, 'rotate-view')), ['rotate-view']);
});

test('selection tools reveal selection options and Move reveals alignment', () => {
  for (const tool of ['select', 'ellipse-select', 'row-select', 'column-select', 'lasso', 'polygonal-lasso', 'magnetic-lasso', 'magic-wand'])
    assert.equal(sectionForTool(tool), 'selection-options', tool);
  assert.equal(sectionForTool('move'), 'layer-alignment');
  assert.equal(sectionForTool('no-such-tool'), null);
});

test('every filter effect type resolves to the Filter effects section', () => {
  assert.deepEqual(Object.keys(FILTER_SECTIONS).sort(), [...FILTER_EFFECT_TYPES].sort());
  for (const type of FILTER_EFFECT_TYPES) assert.equal(sectionForFilter(type), 'filter-effects', type);
  assert.ok(Object.isFrozen(FILTER_SECTIONS));
});

test('every layer style resolves to its own block inside Layer styles', () => {
  assert.deepEqual([...LAYER_STYLE_IDS].sort(), Object.keys(neutralLayerStyles).sort());
  const targets = LAYER_STYLE_IDS.map((style) => sectionForStyle(style));
  assert.equal(new Set(targets).size, targets.length, 'two styles share one block');
  for (const section of targets) {
    assert.ok(isSidebarSectionId(section));
    assert.equal(SIDEBAR_SECTIONS[section].parent, 'layer-styles');
  }
  assert.deepEqual(Object.keys(STYLE_SECTIONS).sort(), [...LAYER_STYLE_IDS].sort());
});

test('section-targeting commands are editor commands with registered sections', () => {
  for (const [command, section] of Object.entries(COMMAND_SECTIONS)) {
    assert.ok(isSidebarSectionId(section), command);
    assert.ok(pageSource.includes(`  | '${command}'`), `${command} is not an editor Command`);
    assert.equal(sectionForCommand(command), section);
  }
  assert.equal(sectionForCommand('toString'), null, 'prototype keys must not resolve');
  assert.equal(sectionForCommand('gaussian-blur'), null);
  for (const command of ['levels', 'curves', 'hue-saturation', 'color-balance', 'sharpen-noise'])
    assert.equal(sectionForCommand(command), 'adjustments');
});

test('section metadata is consistent: ids, labels, parents and owners', () => {
  assert.equal(new Set(SIDEBAR_SECTION_IDS).size, SIDEBAR_SECTION_IDS.length);
  assert.deepEqual(Object.keys(SIDEBAR_SECTIONS).sort(), [...SIDEBAR_SECTION_IDS].sort());
  for (const id of SIDEBAR_SECTION_IDS) {
    const spec = SIDEBAR_SECTIONS[id];
    assert.ok(spec.label.trim().length > 1, id);
    const seen = new Set([id]);
    let parent = spec.parent;
    while (parent) {
      assert.ok(isSidebarSectionId(parent), `${id} parent ${parent}`);
      assert.ok(!seen.has(parent), `parent cycle at ${id}`);
      seen.add(parent);
      parent = SIDEBAR_SECTIONS[parent].parent;
    }
    if (spec.collapsible) assert.equal(spec.owner, 'page', `${id}: only page sections render a disclosure`);
  }
  for (const section of [LAYER_SELECTION_SECTION, QUICK_MASK_SECTION, QUICK_FILTER_SECTION])
    assert.ok(isSidebarSectionId(section));
  assert.equal(sectionSelector('tool-options'), '[data-sidebar-section="tool-options"]');
});

test('every registered section is anchored exactly once in the markup that owns it', () => {
  for (const id of SIDEBAR_SECTION_IDS) {
    const spec = SIDEBAR_SECTIONS[id];
    const source = spec.owner === 'page' ? pageSource : layersSource;
    const attribute = (source.match(new RegExp(`data-sidebar-section="${id}"`, 'g')) || []).length;
    const component = spec.owner === 'page'
      ? (source.match(new RegExp(`<SidebarSection\\s+id="${id}"`, 'g')) || []).length
      : 0;
    assert.equal(attribute + component, 1, `${id} anchored ${attribute + component} times in ${spec.owner}`);
    if (spec.collapsible) assert.equal(component, 1, `${id} is collapsible but not a SidebarSection`);
  }
});

test('every reachable section target is registered (no orphan targets)', () => {
  const targets = new Set([
    ...Object.values(TOOL_SECTIONS).filter(Boolean),
    ...Object.values(FILTER_SECTIONS),
    ...Object.values(STYLE_SECTIONS),
    ...Object.values(COMMAND_SECTIONS),
    LAYER_SELECTION_SECTION,
    QUICK_MASK_SECTION,
    QUICK_FILTER_SECTION,
  ]);
  for (const target of targets) assert.ok(isSidebarSectionId(target), target);
});

test('collapsed-section persistence accepts only known collapsible ids', () => {
  assert.deepEqual(parseCollapsedSections(null), []);
  assert.deepEqual(parseCollapsedSections(''), []);
  assert.deepEqual(parseCollapsedSections('{not json'), []);
  assert.deepEqual(parseCollapsedSections('{"tool-options":true}'), []);
  assert.deepEqual(parseCollapsedSections('"tool-options"'), []);
  assert.deepEqual(parseCollapsedSections(JSON.stringify(['x'.repeat(5000)])), []);
  assert.deepEqual(
    parseCollapsedSections(JSON.stringify(['tool-options', 'layers', 'nope', 42, null, 'tool-options', 'filter-effects', 'quick-mask'])),
    ['tool-options', 'filter-effects'],
  );
  const serialized = serializeCollapsedSections(['filter-effects', 'adjustments', 'layers', 'adjustments']);
  assert.equal(serialized, JSON.stringify(['adjustments', 'filter-effects']));
  assert.deepEqual(parseCollapsedSections(serialized), ['adjustments', 'filter-effects']);
  assert.equal(serializeCollapsedSections([]), '[]');
});

test('isSidebarSectionId rejects non-strings and lookalikes', () => {
  for (const value of [undefined, null, 1, {}, [], 'Tool-options', ' tool-options', 'tool-options '])
    assert.equal(isSidebarSectionId(value), false, JSON.stringify(value) ?? 'undefined');
  for (const id of SIDEBAR_SECTION_IDS) assert.equal(isSidebarSectionId(id), true);
});
