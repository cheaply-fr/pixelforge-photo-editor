import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TOOL_SIDEBAR,
  FIXED_SECTIONS,
  OPEN_PANELS_STORAGE_KEY,
  SIDEBAR_PANELS,
  SIDEBAR_PANEL_IDS,
  TOOL_AREA_SECTIONS,
  TOOL_SIDEBAR,
  isSidebarPanelId,
  openPanelForTool,
  panelForSection,
  parseOpenPanels,
  sectionPlacement,
  serializeOpenPanels,
  togglePanel,
  toolAreaShows,
  toolSidebar,
  withOpenPanel,
} from '../src/sidebarPanels.ts';
import {
  COMMAND_SECTIONS,
  FILTER_SECTIONS,
  SIDEBAR_SECTIONS,
  SIDEBAR_SECTION_IDS,
  STYLE_SECTIONS,
  TOOL_SECTIONS,
  sectionForTool,
} from '../src/sidebarSections.ts';
import { TOOL_CATEGORIES } from '../src/toolPalette.ts';

// Contract: docs/contextual-sidebar-contract.md.
const allTools = TOOL_CATEGORIES.flatMap((category) => category.tools);
const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');

const SELECTION_TOOLS = [
  'select', 'ellipse-select', 'row-select', 'column-select', 'lasso', 'polygonal-lasso',
  'magnetic-lasso', 'magic-wand', 'selection-brush', 'quick-selection',
];
const RETOUCH_TOOLS = TOOL_CATEGORIES.find((category) => category.id === 'retouch').tools;

test('every palette tool has exactly one sidebar context and nothing else is mapped', () => {
  assert.deepEqual(Object.keys(TOOL_SIDEBAR).sort(), [...allTools].sort());
  assert.deepEqual(Object.keys(TOOL_SIDEBAR).sort(), Object.keys(TOOL_SECTIONS).sort());
});

test('the first tool-area section is the reveal target of the tool', () => {
  for (const tool of allTools) {
    const { sections } = toolSidebar(tool);
    assert.equal(sections[0] ?? null, sectionForTool(tool), tool);
    assert.equal(new Set(sections).size, sections.length, `${tool} lists a section twice`);
    for (const section of sections)
      assert.ok(TOOL_AREA_SECTIONS.includes(section), `${tool} → ${section} is not a tool-area section`);
  }
});

test('tool-area sections keep a single canonical order across tools', () => {
  for (const tool of allTools) {
    const order = toolSidebar(tool).sections.map((section) => TOOL_AREA_SECTIONS.indexOf(section));
    // Tool options precede the shared selection block for brush-style selection tools.
    const sorted = [...order].sort((a, b) => a - b);
    if (tool === 'selection-brush' || tool === 'quick-selection')
      assert.deepEqual(toolSidebar(tool).sections, ['tool-options', 'selection-options']);
    else assert.deepEqual(order, sorted, tool);
  }
});

test('each tool shows only its own options', () => {
  assert.deepEqual(toolSidebar('brush').sections, ['tool-options']);
  assert.deepEqual(toolSidebar('gradient').sections, ['tool-options']);
  assert.deepEqual(toolSidebar('text').sections, ['text']);
  assert.deepEqual(toolSidebar('move').sections, ['layer-alignment']);
  assert.deepEqual(toolSidebar('rotate-view').sections, ['rotate-view']);
  assert.deepEqual(toolSidebar('crop').sections, []);
  for (const tool of SELECTION_TOOLS) assert.ok(toolAreaShows(tool, 'selection-options'), tool);
  for (const tool of allTools.filter((tool) => !SELECTION_TOOLS.includes(tool)))
    assert.equal(toolAreaShows(tool, 'selection-options'), false, tool);
  for (const tool of RETOUCH_TOOLS) assert.deepEqual(toolSidebar(tool).sections, ['tool-options'], tool);
  assert.equal(toolAreaShows('brush', 'text'), false);
  assert.equal(toolAreaShows('text', 'tool-options'), false);
  assert.equal(toolAreaShows('move', 'tool-options'), false);
  for (const tool of allTools) {
    assert.equal(toolAreaShows(tool, 'adjustments'), false, tool);
    assert.equal(toolAreaShows(tool, 'filter-effects'), false, tool);
    assert.equal(toolAreaShows(tool, 'layer-styles'), false, tool);
  }
});

test('tools with no inline section show none; unknown tools fall back to the default', () => {
  for (const [tool, section] of Object.entries(TOOL_SECTIONS))
    if (section === null) assert.deepEqual(toolSidebar(tool).sections, [], tool);
  for (const value of ['no-such-tool', '', 'toString', '__proto__', 'Brush'])
    assert.equal(toolSidebar(value), DEFAULT_TOOL_SIDEBAR, value);
  assert.deepEqual(DEFAULT_TOOL_SIDEBAR, { sections: [], panel: null });
  assert.equal(toolAreaShows('no-such-tool', 'tool-options'), false);
});

test('every registered section has exactly one placement', () => {
  const inPanels = SIDEBAR_PANEL_IDS.flatMap((panel) => SIDEBAR_PANELS[panel].sections);
  assert.equal(new Set(inPanels).size, inPanels.length, 'a section is in two panels');
  for (const id of SIDEBAR_SECTION_IDS) {
    const placements = [
      inPanels.includes(id),
      TOOL_AREA_SECTIONS.includes(id),
      FIXED_SECTIONS.includes(id),
    ].filter(Boolean).length;
    assert.equal(placements, 1, `${id} has ${placements} placements`);
    const placement = sectionPlacement(id);
    if (inPanels.includes(id)) {
      assert.equal(placement.area, 'panel');
      assert.ok(SIDEBAR_PANELS[placement.panel].sections.includes(id));
      assert.equal(panelForSection(id), placement.panel);
    } else {
      assert.equal(placement.area, TOOL_AREA_SECTIONS.includes(id) ? 'tool' : 'fixed');
      assert.equal(panelForSection(id), null);
    }
  }
  // Layer style blocks live with their parent.
  for (const section of Object.values(STYLE_SECTIONS)) assert.equal(panelForSection(section), 'layer-styles');
});

test('every reveal target resolves to a renderable place', () => {
  for (const section of Object.values(FILTER_SECTIONS)) assert.equal(panelForSection(section), 'filters');
  assert.equal(panelForSection(COMMAND_SECTIONS.levels), 'adjustments');
  assert.equal(panelForSection(COMMAND_SECTIONS['layer-style']), 'layer-styles');
  assert.equal(sectionPlacement(COMMAND_SECTIONS['rename-layer']).area, 'fixed');
  assert.equal(sectionPlacement(COMMAND_SECTIONS['find-layers']).area, 'fixed');
  assert.equal(panelForSection('quick-filters'), 'filters');
  for (const tool of allTools) {
    const section = sectionForTool(tool);
    if (section) assert.equal(sectionPlacement(section).area, 'tool', tool);
  }
});

test('panels are labelled, iconised and default panels are real panels', () => {
  assert.equal(new Set(SIDEBAR_PANEL_IDS).size, SIDEBAR_PANEL_IDS.length);
  assert.deepEqual(Object.keys(SIDEBAR_PANELS).sort(), [...SIDEBAR_PANEL_IDS].sort());
  const labels = new Set();
  for (const panel of SIDEBAR_PANEL_IDS) {
    const spec = SIDEBAR_PANELS[panel];
    assert.ok(spec.label.length > 2 && spec.short.length > 2 && spec.short.length <= 10, panel);
    // The visible strip text is part of the accessible name ("<label> panel").
    assert.ok(`${spec.label} panel`.toLowerCase().includes(spec.short.toLowerCase()), panel);
    assert.ok(!labels.has(spec.label), `duplicate label ${spec.label}`);
    labels.add(spec.label);
    assert.ok(spec.sections.length > 0, panel);
    assert.ok(pageSource.includes(`  '${panel}': `) || pageSource.includes(`  ${panel}: `), `${panel} has no strip icon`);
  }
  for (const tool of allTools) {
    const { panel } = toolSidebar(tool);
    assert.ok(panel === null || isSidebarPanelId(panel), tool);
  }
  assert.equal(toolSidebar('history-brush').panel, 'history');
  assert.equal(toolSidebar('text').panel, null);
  assert.equal(toolSidebar('brush').panel, null);
});

test('isSidebarPanelId rejects lookalikes', () => {
  for (const value of [undefined, null, 1, {}, 'History', ' history', 'layers', 'tool-options'])
    assert.equal(isSidebarPanelId(value), false, JSON.stringify(value) ?? "undefined");
  for (const panel of SIDEBAR_PANEL_IDS) assert.equal(isSidebarPanelId(panel), true);
});

test('togglePanel opens, switches and closes', () => {
  assert.equal(togglePanel(null, 'history'), 'history');
  assert.equal(togglePanel('history', 'history'), null);
  assert.equal(togglePanel('history', 'filters'), 'filters');
});

test('open panel is remembered per tool, defaulting to the tool default', () => {
  let state = {};
  assert.equal(openPanelForTool(state, 'brush'), null);
  assert.equal(openPanelForTool(state, 'history-brush'), 'history');
  assert.equal(openPanelForTool(state, 'no-such-tool'), null);
  state = withOpenPanel(state, 'brush', 'filters');
  assert.equal(openPanelForTool(state, 'brush'), 'filters');
  assert.equal(openPanelForTool(state, 'eraser'), null, 'other tools are unaffected');
  state = withOpenPanel(state, 'history-brush', null);
  assert.equal(openPanelForTool(state, 'history-brush'), null, 'an explicit close beats the default');
  const same = withOpenPanel(state, 'brush', 'filters');
  assert.equal(same, state, 'no-op updates keep identity');
  assert.equal(withOpenPanel(state, 'no-such-tool', 'filters'), state);
  assert.equal(withOpenPanel(state, '__proto__', 'filters'), state);
});

test('the last chosen panel is carried to tools without their own choice', () => {
  const state = { brush: 'adjustments', eraser: null };
  // No remembered choice and no default: the carried panel stays open.
  assert.equal(openPanelForTool(state, 'gradient', 'filters'), 'filters');
  assert.equal(openPanelForTool({}, 'move', 'layer-styles'), 'layer-styles');
  // A remembered choice (including an explicit close) wins.
  assert.equal(openPanelForTool(state, 'brush', 'filters'), 'adjustments');
  assert.equal(openPanelForTool(state, 'eraser', 'filters'), null);
  // A tool default wins over the carried panel.
  assert.equal(openPanelForTool(state, 'history-brush', 'filters'), 'history');
  // Garbage carried values are ignored.
  assert.equal(openPanelForTool(state, 'gradient', 'bogus'), null);
  assert.equal(openPanelForTool(state, 'no-such-tool', 'filters'), 'filters');
});

test('persistence round-trips and rejects malformed input', () => {
  assert.equal(OPEN_PANELS_STORAGE_KEY, 'pixelforge.sidebar-open-panels');
  for (const raw of [null, undefined, '', '{not json', '[]', '"brush"', '42', 'null', JSON.stringify({ x: 'y'.repeat(9000) })])
    assert.deepEqual(parseOpenPanels(raw), {}, String(raw).slice(0, 20));
  assert.deepEqual(
    parseOpenPanels(JSON.stringify({
      brush: 'filters', text: null, eraser: 'nope', 'no-such-tool': 'history', move: 3, __proto__: 'history', gradient: 'history',
    })),
    { brush: 'filters', text: null, gradient: 'history' },
  );
  const state = { gradient: 'layer-styles', brush: 'adjustments', crop: null };
  const serialized = serializeOpenPanels(state);
  assert.equal(serialized, JSON.stringify({ brush: 'adjustments', crop: null, gradient: 'layer-styles' }));
  assert.deepEqual(parseOpenPanels(serialized), state);
  assert.equal(serializeOpenPanels({ brush: 'bogus', nope: 'history' }), '{}');
  // Every tool × panel combination survives a round trip.
  let all = {};
  for (const [index, tool] of allTools.entries())
    all = withOpenPanel(all, tool, index % 5 === 0 ? null : SIDEBAR_PANEL_IDS[index % SIDEBAR_PANEL_IDS.length]);
  assert.deepEqual(parseOpenPanels(serializeOpenPanels(all)), all);
  for (const tool of allTools) assert.equal(openPanelForTool(parseOpenPanels(serializeOpenPanels(all)), tool), all[tool]);
});

test('the page renders the tool area from the table and every panel in the strip', () => {
  assert.match(pageSource, /activeToolSidebar\.sections\.map\(\(section\)/);
  for (const section of TOOL_AREA_SECTIONS) assert.ok(pageSource.includes(`section === '${section}'`), section);
  for (const panel of SIDEBAR_PANEL_IDS)
    assert.ok(pageSource.includes(`openSidebarPanel === '${panel}'`), `${panel} has no panel body`);
  assert.ok(!pageSource.includes('toolShowsSection('), 'the page must not bypass the contextual table');
  for (const section of SIDEBAR_SECTION_IDS) assert.ok(SIDEBAR_SECTIONS[section]);
});
