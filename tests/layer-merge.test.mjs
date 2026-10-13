import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySelectedLayerMerge,
  layerMergeReason,
  planLayerMerge,
  planSelectedLayerMerge,
  selectedLayerMergeReason,
} from '../src/layerMerge.ts';

const frame = (patch = {}) => ({
  w: 8,
  h: 8,
  layers: [
    { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
    { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
  ],
  active: 'active',
  ...patch,
});

test('plans an adjacent visible unlocked ungrouped pair in stack order', () => {
  assert.deepEqual(planLayerMerge(frame()), { ok: true, activeIndex: 1, lowerIndex: 0 });
});

test('rejects missing, bottom and locked or hidden layer states', () => {
  assert.equal(planLayerMerge(frame({ active: 'missing' })).reason, 'missing-active');
  assert.equal(planLayerMerge(frame({ active: 'bottom' })).reason, 'no-lower-layer');
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: false, locked: false },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
    ] })).reason,
    'lower-layer-hidden',
  );
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: true },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
    ] })).reason,
    'lower-layer-locked',
  );
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
      { id: 'active', name: 'Active', kind: 'text', visible: false, locked: false },
    ] })).reason,
    'active-layer-hidden',
  );
  assert.equal(
    planLayerMerge(frame({ layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false, groupId: 'folder' },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false, groupId: 'folder' },
    ] })).reason,
    'grouped-layers',
  );
});

test('guard reasons are user-facing and identify the staged boundary', () => {
  assert.match(layerMergeReason('grouped-layers'), /isolated folder compositing/);
  assert.match(layerMergeReason('no-lower-layer'), /above another layer/);
});

test('plans a contiguous multi-selection in canonical stack order', () => {
  const value = frame({
    layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
      { id: 'middle', name: 'Middle', kind: 'raster', visible: true, locked: false },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
      { id: 'unrelated', name: 'Unrelated', kind: 'raster', visible: true, locked: false },
    ],
    active: 'active',
    // Deliberately reverse the persisted array to prove stack order wins.
    selectedLayerIds: ['active', 'middle', 'bottom'],
  });
  assert.deepEqual(planSelectedLayerMerge(value), {
    ok: true,
    firstIndex: 0,
    lastIndex: 2,
    selectedIndices: [0, 1, 2],
    selectedLayerIds: ['bottom', 'middle', 'active'],
  });
});

test('expands a complete folder selection into an isolated merge unit', () => {
  const value = frame({
    layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
      { id: 'folder-a', name: 'Folder A', kind: 'raster', visible: true, locked: false, groupId: 'folder' },
      { id: 'outside', name: 'Outside', kind: 'raster', visible: true, locked: false },
      { id: 'folder-b', name: 'Folder B', kind: 'text', visible: true, locked: false, groupId: 'folder' },
    ],
    active: 'folder-b',
    selectedLayerIds: ['folder-a'],
    groups: [{ id: 'folder', name: 'Folder', visible: true, locked: false, opacity: 0.8, blend: 'multiply', collapsed: false }],
  });
  assert.deepEqual(planSelectedLayerMerge(value), {
    ok: true,
    firstIndex: 1,
    lastIndex: 3,
    selectedIndices: [1, 3],
    selectedLayerIds: ['folder-a', 'folder-b'],
  });
});

test('multi-selection planner guards insufficient, missing, non-contiguous, grouped, hidden and locked inputs', () => {
  assert.equal(planSelectedLayerMerge(frame()).reason, 'insufficient-selection');
  assert.equal(
    planSelectedLayerMerge(frame({ selectedLayerIds: ['bottom', 'missing'] })).reason,
    'missing-selection-layer',
  );
  assert.equal(
    planSelectedLayerMerge(frame({
      layers: [
        { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
        { id: 'gap', name: 'Gap', kind: 'raster', visible: true, locked: false },
        { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
      ],
      selectedLayerIds: ['bottom', 'active'],
    })).reason,
    'non-contiguous-selection',
  );
  assert.equal(
    planSelectedLayerMerge(frame({
      selectedLayerIds: ['bottom', 'active'],
      layers: [
        { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false, groupId: 'folder' },
        { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
      ],
    })).reason,
    'grouped-layers',
  );
  assert.equal(
    planSelectedLayerMerge(frame({
      selectedLayerIds: ['bottom', 'active'],
      layers: [
        { id: 'bottom', name: 'Bottom', kind: 'raster', visible: false, locked: false },
        { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
      ],
    })).reason,
    'hidden-layer',
  );
  assert.equal(
    planSelectedLayerMerge(frame({
      selectedLayerIds: ['bottom', 'active'],
      layers: [
        { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: true },
        { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
      ],
    })).reason,
    'locked-layer',
  );
  assert.match(selectedLayerMergeReason('non-contiguous-selection'), /contiguous/);
});

test('applies a selected merge without mutating unrelated layers, groups or artboards', () => {
  const source = frame({
    layers: [
      { id: 'bottom', name: 'Bottom', kind: 'raster', visible: true, locked: false },
      { id: 'middle', name: 'Middle', kind: 'raster', visible: true, locked: false },
      { id: 'active', name: 'Active', kind: 'text', visible: true, locked: false },
      { id: 'outside', name: 'Outside', kind: 'raster', visible: true, locked: false, groupId: 'folder' },
    ],
    active: 'active',
    groups: [{ id: 'folder', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false }],
    selectedLayerIds: ['bottom', 'middle', 'active'],
    artboards: [
      { id: 'all', name: 'All', x: 0, y: 0, w: 8, h: 8, visible: true, locked: false, layerIds: ['bottom', 'middle', 'active', 'outside'] },
      { id: 'partial', name: 'Partial', x: 0, y: 0, w: 8, h: 8, visible: true, locked: false, layerIds: ['bottom', 'outside'] },
      { id: 'other', name: 'Other', x: 0, y: 0, w: 8, h: 8, visible: true, locked: false, layerIds: ['outside'] },
    ],
  });
  assert.equal(planSelectedLayerMerge(source).reason, 'artboard-partial-membership');
  const mergeableSource = {
    ...source,
    artboards: source.artboards.filter((artboard) => artboard.id !== 'partial'),
  };
  const plan = planSelectedLayerMerge(mergeableSource);
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error('expected merge plan');
  const merged = { id: 'merged', name: 'Bottom + Middle + Active', kind: 'raster', visible: true, locked: false };
  const result = applySelectedLayerMerge(mergeableSource, plan, merged);
  assert.deepEqual(result.layers.map((layer) => layer.id), ['merged', 'outside']);
  assert.equal(result.active, 'merged');
  assert.deepEqual(result.selectedLayerIds, ['merged']);
  assert.equal(result.groups?.[0].id, 'folder');
  assert.deepEqual(result.artboards?.map((artboard) => artboard.layerIds), [
    ['merged', 'outside'],
    ['outside'],
  ]);
  assert.deepEqual(mergeableSource.layers.map((layer) => layer.id), ['bottom', 'middle', 'active', 'outside']);
  assert.deepEqual(mergeableSource.artboards?.[0].layerIds, ['bottom', 'middle', 'active', 'outside']);
});
