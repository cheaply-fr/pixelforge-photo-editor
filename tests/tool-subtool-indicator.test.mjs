import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_CATEGORIES,
  compactCategoryTools,
  flyoutForTool,
  flyoutTools,
  hiddenFamilyTools,
} from '../src/toolPalette.ts';

/** What the toolbar renders: one row per button with its hidden-family count. */
const toolbar = (activeTool, remembered) =>
  TOOL_CATEGORIES.flatMap((category) => {
    const shown = compactCategoryTools(category, activeTool, remembered);
    return shown.map((tool) => {
      const family = flyoutForTool(tool);
      return { tool, hidden: family ? hiddenFamilyTools(flyoutTools(family), shown) : [] };
    });
  });

test('hiddenFamilyTools lists the family members without their own button', () => {
  assert.deepEqual(hiddenFamilyTools(['brush', 'pencil', 'mixer'], ['brush']), ['pencil', 'mixer']);
  assert.deepEqual(hiddenFamilyTools(['brush', 'pencil'], ['brush', 'pencil']), []);
  assert.deepEqual(hiddenFamilyTools([], ['brush']), []);
});

test('every family whose sub-tools open only from the flyout gets the corner mark', () => {
  const buttons = toolbar('move');
  const marked = buttons.filter((button) => button.hidden.length > 0);
  assert.ok(marked.length >= 10, `expected many marked families, got ${marked.length}`);
  for (const button of marked) {
    // The mark is never shown for a tool that is not part of a flyout family.
    assert.ok(flyoutForTool(button.tool));
    assert.ok(!button.hidden.includes(button.tool), 'the shown tool is not counted as hidden');
  }
  // A hidden sub-tool is reachable only from its family button: no other button shows it.
  const shownTools = new Set(buttons.map((button) => button.tool));
  for (const button of marked) for (const hidden of button.hidden) assert.ok(!shownTools.has(hidden), hidden);
  // Plain tools (Move, Hand) never get a mark.
  for (const plain of buttons.filter((button) => !flyoutForTool(button.tool))) assert.equal(plain.hidden.length, 0);
});

test('the mark follows the visible family member and keeps its count', () => {
  const brushFamily = flyoutTools(flyoutForTool('brush'));
  assert.ok(brushFamily.length > 1);
  for (const member of brushFamily) {
    const button = toolbar(member).find((item) => brushFamily.includes(item.tool));
    assert.equal(button.tool, member, 'the active member takes the family slot');
    assert.equal(button.hidden.length, brushFamily.length - 1);
  }
});
