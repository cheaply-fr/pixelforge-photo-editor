import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_CATEGORIES,
  compactCategoryTools,
  TOOL_FAMILIES,
  categoryForTool,
  cycleFamilyTool,
  familyForTool,
  familyTools,
  flyoutForTool,
  flyoutTools,
  validatePaletteTaxonomy,
} from '../src/toolPalette.ts';

const toolIds = TOOL_CATEGORIES.flatMap((category) => category.tools);

test('palette taxonomy covers every tool exactly once', () => {
  assert.equal(validatePaletteTaxonomy(toolIds), true);
  assert.equal(new Set(toolIds).size, toolIds.length);
  assert.ok(TOOL_CATEGORIES.every((category) => category.label.length > 0));
});

test('categories and families resolve stable labels for common Photoshop groups', () => {
  assert.equal(categoryForTool('clone'), 'retouch');
  assert.equal(categoryForTool('polygon'), 'draw');
  assert.equal(familyForTool('clone'), 's');
  assert.equal(familyForTool('magic-wand'), 'w');
  assert.equal(flyoutForTool('select'), 'marquee');
  assert.equal(flyoutForTool('lasso'), 'lasso');
  assert.equal(flyoutForTool('pen'), 'pen');
  assert.equal(flyoutForTool('blur'), 'retouch');
  assert.deepEqual(flyoutTools('retouch'), ['smudge', 'blur', 'sharpen']);
  assert.deepEqual(flyoutTools('pen'), ['pen', 'freeform-pen', 'curvature-pen']);
  assert.equal(flyoutForTool('selection-brush'), undefined);
  assert.equal(flyoutForTool('quick-selection'), 'selection');
  assert.deepEqual(familyTools('s'), ['clone', 'pattern-stamp']);
  assert.deepEqual(familyTools('clone'), ['clone', 'pattern-stamp']);
  assert.deepEqual(familyTools('r'), ['smudge', 'blur', 'sharpen']);
  assert.deepEqual(familyTools('move'), []);
  assert.deepEqual(flyoutTools('selection'), ['quick-selection', 'magic-wand']);
  assert.deepEqual(flyoutTools('magic-wand'), ['quick-selection', 'magic-wand']);
  assert.deepEqual(flyoutTools('eyedropper'), []);
});

test('family cycling wraps and supports reverse keyboard navigation', () => {
  assert.equal(cycleFamilyTool('brush', 'b'), 'pencil');
  assert.equal(cycleFamilyTool('color-replace', 'b'), 'mixer-brush');
  assert.equal(cycleFamilyTool('brush', 'b', true), 'mixer-brush');
  assert.equal(cycleFamilyTool('unknown', 'b'), 'brush');
  assert.equal(cycleFamilyTool('clone', 'missing'), undefined);
});

test('family definitions stay aligned with repeated-key groups', () => {
  for (const [key, tools] of Object.entries(TOOL_FAMILIES)) {
    assert.ok(tools.length >= 2, `${key} must expose a flyout`);
    for (const tool of tools) assert.equal(familyForTool(tool), key);
  }
});

test('selection flyouts preserve Photoshop M/L/W group membership', () => {
  assert.deepEqual(flyoutTools('marquee'), ['select', 'ellipse-select', 'row-select', 'column-select']);
  assert.deepEqual(flyoutTools('lasso'), ['lasso', 'polygonal-lasso', 'magnetic-lasso']);
  assert.deepEqual(flyoutTools('selection'), ['quick-selection', 'magic-wand']);
});

test('compact category slots show one family representative and active variant', () => {
  const lasso = TOOL_CATEGORIES.find((category) => category.id === 'lasso');
  assert.deepEqual(compactCategoryTools(lasso), ['lasso']);
  assert.deepEqual(compactCategoryTools(lasso, 'magnetic-lasso'), ['magnetic-lasso']);
  assert.deepEqual(compactCategoryTools(lasso, 'move', { lasso: 'magnetic-lasso' }), ['magnetic-lasso']);
  assert.deepEqual(compactCategoryTools(lasso, 'lasso', { lasso: 'magnetic-lasso' }), ['lasso']);
  const retouch = TOOL_CATEGORIES.find((category) => category.id === 'retouch');
  assert.deepEqual(compactCategoryTools(retouch), ['clone', 'heal', 'smudge', 'dodge', 'history-brush']);
  const measure = TOOL_CATEGORIES.find((category) => category.id === 'measure');
  assert.deepEqual(compactCategoryTools(measure), ['eyedropper', 'color-sampler', 'ruler', 'note', 'count']);
  const selection = TOOL_CATEGORIES.find((category) => category.id === 'selection');
  assert.deepEqual(compactCategoryTools(selection), ['selection-brush', 'quick-selection']);
  const draw = TOOL_CATEGORIES.find((category) => category.id === 'draw');
  assert.deepEqual(compactCategoryTools(draw), ['pen', 'direct-select', 'text', 'rectangle']);
  assert.deepEqual(compactCategoryTools(draw, 'curvature-pen'), ['curvature-pen', 'direct-select', 'text', 'rectangle']);
});

test('every active variant keeps one visible slot per family', () => {
  for (const category of TOOL_CATEGORIES) {
    for (const active of category.tools) {
      const slots = compactCategoryTools(category, active);
      assert.equal(
        new Set(slots).size,
        slots.length,
        `${category.id} duplicated a tool slot while ${active} was active`,
      );
      const families = slots.map((tool) => flyoutForTool(tool) ?? `tool:${tool}`);
      assert.equal(
        new Set(families).size,
        families.length,
        `${category.id} duplicated a family while ${active} was active`,
      );
    }
  }
});
