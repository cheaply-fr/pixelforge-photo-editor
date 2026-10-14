import test from 'node:test';
import assert from 'node:assert/strict';
import { applySelectLinkedLayers, planSelectLinkedLayers, selectLinkedLayersReason } from '../src/linkedLayers.ts';

const layer = (id, linkId) => ({
  id,
  name: id,
  kind: 'smart-object',
  linkId,
  asset: `asset-${id}`,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: {},
});
const frame = (patch = {}) => ({
  w: 10,
  h: 10,
  layers: [layer('a', 'group-a'), layer('b', 'group-a'), layer('c', 'group-b'), { ...layer('d'), kind: 'raster', linkId: undefined }],
  active: 'a',
  selectedLayerIds: ['a'],
  ...patch,
});

test('selects every instance sharing the selected smart-object link', () => {
  const source = frame();
  const plan = planSelectLinkedLayers(source);
  assert.deepEqual(plan, { ok: true, layerIds: ['a', 'b'], linkIds: ['group-a'] });
  const selected = applySelectLinkedLayers(source, plan);
  assert.deepEqual(selected.selectedLayerIds, ['a', 'b']);
  assert.deepEqual(source.selectedLayerIds, ['a']);
  assert.equal(selected.active, source.active);
});

test('unions linked groups when more than one linked instance is selected', () => {
  const plan = planSelectLinkedLayers(frame({ selectedLayerIds: ['a', 'c'] }));
  assert.deepEqual(plan, { ok: true, layerIds: ['a', 'b', 'c'], linkIds: ['group-a', 'group-b'] });
});

test('fails closed for empty, unlinked, and stale selections', () => {
  assert.deepEqual(planSelectLinkedLayers(frame({ selectedLayerIds: [] })), {
    ok: false, reason: 'no-selection', layerIds: [],
  });
  assert.deepEqual(planSelectLinkedLayers(frame({ selectedLayerIds: ['d'] })), {
    ok: false, reason: 'no-linked-selection', layerIds: ['d'],
  });
  assert.deepEqual(planSelectLinkedLayers(frame({ selectedLayerIds: ['missing'] })), {
    ok: false, reason: 'missing-selection-layer', layerIds: [],
  });
  assert.equal(selectLinkedLayersReason('no-linked-selection'), 'Select a linked smart-object layer first');
});

test('repeating the command is a no-op and stale plans cannot overwrite selection', () => {
  const source = frame({ selectedLayerIds: ['a', 'b'] });
  assert.equal(applySelectLinkedLayers(source), source);
  const plan = planSelectLinkedLayers(source);
  const changed = { ...source, selectedLayerIds: ['c'] };
  assert.equal(applySelectLinkedLayers(changed, plan), changed);
});
