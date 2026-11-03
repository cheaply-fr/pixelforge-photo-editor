import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as LucideModule from 'lucide-react';
import {
  TOOL_CATEGORIES,
  TOOL_FLYOUTS,
  TOOL_ICONS,
  compactCategoryTools,
  duplicateToolIcons,
  flyoutForTool,
} from '../src/toolPalette.ts';
import { toolIcon } from '../src/toolIcons.ts';

// A plain object keeps computed lookups lint-clean.
const Lucide = { ...LucideModule };
const toolIds = TOOL_CATEGORIES.flatMap((category) => category.tools);
// Rendered SVG body without the wrapper's class names, so two components
// that draw the same picture compare equal even under different names.
const drawing = (tool) =>
  renderToStaticMarkup(createElement(toolIcon(tool))).replace(/^<svg[^>]*>/, '');

test('every palette tool has exactly one icon entry', () => {
  assert.deepEqual(Object.keys(TOOL_ICONS).sort(), [...toolIds].sort());
  for (const tool of toolIds) assert.equal(typeof toolIcon(tool), 'object', tool);
});

test('icon names are canonical Lucide exports, not aliases', () => {
  for (const [tool, name] of Object.entries(TOOL_ICONS)) {
    assert.ok(Lucide[name], `${tool} uses missing Lucide icon ${name}`);
    assert.equal(Lucide[name].displayName, name, `${tool} uses alias ${name}`);
    assert.equal(toolIcon(tool), Lucide[name], `${tool} renders a different component`);
  }
});

test('no two palette tools share an icon name', () => {
  assert.deepEqual(duplicateToolIcons(), []);
});

test('no two palette tools render the same drawing', () => {
  const seen = new Map();
  for (const tool of toolIds) {
    const svg = drawing(tool);
    assert.match(svg, /<(path|circle|rect|line|polyline|polygon|ellipse)\b/, `${tool} renders no shape`);
    assert.equal(seen.get(svg), undefined, `${tool} draws the same icon as ${seen.get(svg)}`);
    seen.set(svg, tool);
  }
});

test('the Wand2 alias would be caught as a duplicate drawing of WandSparkles', () => {
  // Guards the regression where Quick Selection (Wand2) and Lasso
  // (WandSparkles) looked identical despite different import names.
  const a = renderToStaticMarkup(createElement(Lucide.Wand2)).replace(/^<svg[^>]*>/, '');
  const b = renderToStaticMarkup(createElement(Lucide.WandSparkles)).replace(/^<svg[^>]*>/, '');
  assert.equal(a, b);
});

test('duplicateToolIcons reports every tool sharing an icon', () => {
  assert.deepEqual(
    duplicateToolIcons({ crop: 'Crop', slice: 'Crop', frame: 'Frame', select: 'Crop' }),
    [['crop', 'slice', 'select']],
  );
  assert.deepEqual(duplicateToolIcons({}), []);
});

test('each flyout lists visually distinct subtools', () => {
  for (const [flyout, tools] of Object.entries(TOOL_FLYOUTS)) {
    const drawings = tools.map(drawing);
    assert.equal(new Set(drawings).size, tools.length, `${flyout} flyout repeats an icon`);
  }
});

test('choosing a subtool visibly changes its representative slot icon', () => {
  for (const category of TOOL_CATEGORIES) {
    const defaults = compactCategoryTools(category);
    for (const active of category.tools) {
      const flyout = flyoutForTool(active);
      if (!flyout) continue;
      const slots = compactCategoryTools(category, active);
      const index = slots.indexOf(active);
      assert.notEqual(index, -1, `${active} is not shown in ${category.id}`);
      if (defaults[index] !== active)
        assert.notEqual(drawing(slots[index]), drawing(defaults[index]), `${active} slot did not change icon`);
    }
  }
});

test('selection, crop and paint tools keep icons distinct from each other', () => {
  // These were the concrete live collisions on 0394bc3: marquee used the Crop
  // glyph, lasso/selection/healing shared a wand, and Pen used Pencil.
  const pairs = [
    ['select', 'crop'],
    ['lasso', 'quick-selection'],
    ['selection-brush', 'quick-selection'],
    ['heal', 'quick-selection'],
    ['pen', 'pencil'],
    ['smudge', 'brush'],
    ['mask-brush', 'brush'],
    ['eyedropper', 'color-sampler'],
    ['gradient', 'color-replace'],
    ['sponge', 'sharpen'],
    ['direct-select', 'move'],
  ];
  for (const [a, b] of pairs) assert.notEqual(drawing(a), drawing(b), `${a} vs ${b}`);
});
