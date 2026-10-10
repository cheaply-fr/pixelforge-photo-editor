import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMergeVisible,
  mergeVisibleReason,
  planMergeVisible,
} from '../src/layerMergeVisible.ts';

const layer = (id, patch = {}) => ({
  id,
  name: id,
  kind: 'raster',
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: {},
  ...patch,
});
const base = (patch = {}) => ({
  w: 4,
  h: 4,
  layers: [layer('bottom'), layer('middle'), layer('top')],
  active: 'top',
  ...patch,
});

test('plans effective visible layers in stable stack order, including visible groups', () => {
  const source = base({
    layers: [
      layer('hidden-bottom', { visible: false }),
      layer('group-a', { groupId: 'group' }),
      layer('hidden-group', { visible: false, groupId: 'group' }),
      layer('plain-top'),
      layer('hidden-top', { visible: false }),
    ],
    groups: [
      {
        id: 'group',
        name: 'Group',
        visible: true,
        locked: false,
        opacity: 1,
        blend: 'source-over',
        collapsed: false,
      },
    ],
  });
  assert.deepEqual(planMergeVisible(source), {
    ok: true,
    visibleLayerIds: ['group-a', 'plain-top'],
    visibleIndices: [1, 3],
    firstVisibleIndex: 1,
    lastVisibleIndex: 3,
    visibleGroupIds: ['group'],
  });
  assert.deepEqual(
    source.layers.map((item) => item.id),
    ['hidden-bottom', 'group-a', 'hidden-group', 'plain-top', 'hidden-top'],
  );
});

test('hidden groups and empty documents are guarded without mutating source state', () => {
  const hidden = base({
    layers: [layer('member', { groupId: 'group' })],
    groups: [
      {
        id: 'group',
        name: 'Group',
        visible: false,
        locked: false,
        opacity: 1,
        blend: 'source-over',
        collapsed: false,
      },
    ],
  });
  assert.deepEqual(planMergeVisible(hidden), {
    ok: false,
    reason: 'no-visible-layers',
  });
  assert.match(mergeVisibleReason('no-visible-layers'), /no visible/);
  assert.deepEqual(
    planMergeVisible(base({ layers: [layer('missing', { groupId: 'gone' })] })),
    {
      ok: false,
      reason: 'missing-group',
    },
  );
});

test('applies replacement at the highest visible slot, retaining hidden layers and folders', () => {
  const source = base({
    layers: [
      layer('hidden-bottom', { visible: false }),
      layer('group-visible', { groupId: 'group' }),
      layer('group-hidden', { groupId: 'group', visible: false }),
      layer('plain-visible'),
      layer('hidden-top', { visible: false }),
    ],
    active: 'plain-visible',
    selectedLayerIds: ['plain-visible'],
    groups: [
      {
        id: 'group',
        name: 'Group',
        visible: true,
        locked: false,
        opacity: 1,
        blend: 'source-over',
        collapsed: false,
      },
    ],
  });
  const plan = planMergeVisible(source);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error('expected merge plan');
  const merged = layer('merged', { name: 'Merged visible', groupId: 'wrong' });
  const result = applyMergeVisible(source, plan, merged);
  assert.deepEqual(
    result.layers.map((item) => item.id),
    ['hidden-bottom', 'group-hidden', 'merged', 'hidden-top'],
  );
  assert.equal(
    result.layers.find((item) => item.id === 'merged').groupId,
    undefined,
  );
  assert.deepEqual(
    result.groups?.map((item) => item.id),
    ['group'],
  );
  assert.deepEqual(
    source.layers.map((item) => item.id),
    [
      'hidden-bottom',
      'group-visible',
      'group-hidden',
      'plain-visible',
      'hidden-top',
    ],
  );
  assert.equal(
    source.layers.find((item) => item.id === 'group-visible').groupId,
    'group',
  );
  assert.deepEqual(result.selectedLayerIds, ['merged']);
  assert.equal(result.active, 'merged');
});

test('repairs explicit artboard membership only for complete visible source sets', () => {
  const source = base({
    layers: [
      layer('hidden', { visible: false }),
      layer('visible-a'),
      layer('visible-b'),
    ],
    artboards: [
      {
        id: 'all',
        name: 'All',
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        visible: true,
        locked: false,
        layerIds: ['hidden', 'visible-a', 'visible-b'],
      },
      {
        id: 'partial',
        name: 'Partial',
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        visible: true,
        locked: false,
        layerIds: ['hidden', 'visible-a'],
      },
      {
        id: 'legacy',
        name: 'Legacy',
        x: 0,
        y: 0,
        w: 4,
        h: 4,
        visible: true,
        locked: false,
      },
    ],
  });
  const plan = planMergeVisible(source);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error('expected merge plan');
  const result = applyMergeVisible(source, plan, layer('merged'));
  assert.deepEqual(
    result.artboards?.map((item) => item.layerIds),
    [['hidden', 'merged'], ['hidden'], undefined],
  );
  assert.deepEqual(source.artboards?.[0].layerIds, [
    'hidden',
    'visible-a',
    'visible-b',
  ]);
});
