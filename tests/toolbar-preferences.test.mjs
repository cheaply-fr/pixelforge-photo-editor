import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolbarPreferences } from '../src/toolbarPreferences.ts';

const ids = ['navigation', 'measure', 'paint', 'draw'];

test('toolbar preferences migrate unknown and duplicate IDs without changing canonical order', () => {
  assert.deepEqual(normalizeToolbarPreferences({
    columns: '3',
    hiddenCategories: ['measure', 'measure', 'missing', 'navigation'],
    categoryOrder: ['paint', 'paint', 'missing'],
  }, ids), {
    columns: '3',
    hiddenCategories: ['measure'],
    categoryOrder: ['paint', 'navigation', 'measure', 'draw'],
  });
});

test('toolbar preferences never allow all categories to be hidden', () => {
  const result = normalizeToolbarPreferences({ hiddenCategories: ids }, ids);
  assert.ok(result.hiddenCategories.length < ids.length);
  assert.equal(result.hiddenCategories.includes('navigation'), false);
  assert.deepEqual(result.categoryOrder, ids);
});

test('malformed toolbar preferences fail closed to defaults', () => {
  assert.deepEqual(normalizeToolbarPreferences(null, ids), {
    columns: 'auto', hiddenCategories: [], categoryOrder: ids,
  });
  assert.deepEqual(normalizeToolbarPreferences({ columns: '9' }, ids).columns, 'auto');
});
