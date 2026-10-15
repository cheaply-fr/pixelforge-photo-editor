import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolbarPreferences } from '../src/toolbarPreferences.ts';

const ids = ['navigation', 'measure', 'paint', 'draw'];
const tools = {
  navigation: ['move', 'hand'],
  measure: ['eyedropper', 'ruler'],
  paint: ['brush', 'fill'],
  draw: ['pen', 'text'],
};

test('toolbar preferences migrate unknown and duplicate IDs without changing canonical order', () => {
  assert.deepEqual(normalizeToolbarPreferences({
    columns: '3',
    density: 'comfortable',
    hiddenCategories: ['measure', 'measure', 'missing', 'navigation'],
    categoryOrder: ['paint', 'paint', 'missing'],
  }, ids, tools), {
    version: 1,
    columns: '3',
    density: 'comfortable',
    hiddenCategories: ['measure'],
    categoryOrder: ['paint', 'navigation', 'measure', 'draw'],
    toolOrder: { navigation: ['move', 'hand'], measure: ['eyedropper', 'ruler'], paint: ['brush', 'fill'], draw: ['pen', 'text'] },
  });
});

test('toolbar preferences never allow all categories to be hidden', () => {
  const result = normalizeToolbarPreferences({ hiddenCategories: ids }, ids, tools);
  assert.ok(result.hiddenCategories.length < ids.length);
  assert.equal(result.hiddenCategories.includes('navigation'), false);
  assert.deepEqual(result.categoryOrder, ids);
  assert.deepEqual(result.toolOrder, tools);
});

test('malformed toolbar preferences fail closed to defaults', () => {
  assert.deepEqual(normalizeToolbarPreferences(null, ids, tools), {
    version: 1,
    columns: 'auto', density: 'compact', hiddenCategories: [], categoryOrder: ids, toolOrder: {},
  });
  assert.deepEqual(normalizeToolbarPreferences({ columns: '9' }, ids, tools).columns, 'auto');
  assert.deepEqual(normalizeToolbarPreferences({ version: 99 }, ids, tools), {
    version: 1, columns: 'auto', density: 'compact', hiddenCategories: [], categoryOrder: ids, toolOrder: {},
  });
});

test('toolbar tool ordering migrates unknown and duplicate tool IDs safely', () => {
  assert.deepEqual(normalizeToolbarPreferences({
    toolOrder: { paint: ['fill', 'fill', 'missing'], draw: ['text'] },
  }, ids, tools).toolOrder, {
    navigation: ['move', 'hand'],
    measure: ['eyedropper', 'ruler'],
    paint: ['fill', 'brush'],
    draw: ['text', 'pen'],
  });
});
