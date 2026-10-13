import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayerArrange,
  layerArrangeReason,
  planLayerArrange,
} from '../src/layerArrange.ts';

const ids = ['bottom', 'middle', 'upper', 'top'];
const frame = (patch = {}) => ({
  w: 100,
  h: 80,
  layers: ids.map((id) => ({
    id,
    name: id,
    groupId: undefined,
    locked: false,
  })),
  active: 'middle',
  selectedLayerIds: ['middle'],
  ...patch,
});

test('single-layer arrange reaches each Photoshop stack boundary without mutating the source', () => {
  const source = frame();
  const front = applyLayerArrange(source, 'front');
  assert.deepEqual(front.layers.map((layer) => layer.id), ['bottom', 'upper', 'top', 'middle']);
  assert.equal(front.active, source.active);
  assert.deepEqual(front.selectedLayerIds, source.selectedLayerIds);
  assert.deepEqual(source.layers.map((layer) => layer.id), ids);

  const back = applyLayerArrange(source, 'back');
  assert.deepEqual(back.layers.map((layer) => layer.id), ['middle', 'bottom', 'upper', 'top']);
  assert.deepEqual(applyLayerArrange(source, 'forward').layers.map((layer) => layer.id), ['bottom', 'upper', 'middle', 'top']);
  assert.deepEqual(applyLayerArrange(source, 'backward').layers.map((layer) => layer.id), ['middle', 'bottom', 'upper', 'top']);
});

test('multi-selection moves as a stable stack-order block and preserves active and selection IDs', () => {
  const source = frame({ active: 'upper', selectedLayerIds: ['upper', 'middle'] });
  assert.deepEqual(applyLayerArrange(source, 'front').layers.map((layer) => layer.id), ['bottom', 'top', 'middle', 'upper']);
  assert.deepEqual(applyLayerArrange(source, 'back').layers.map((layer) => layer.id), ['middle', 'upper', 'bottom', 'top']);
  assert.deepEqual(applyLayerArrange(source, 'forward').layers.map((layer) => layer.id), ['bottom', 'top', 'middle', 'upper']);
  assert.deepEqual(applyLayerArrange(source, 'backward').layers.map((layer) => layer.id), ['middle', 'upper', 'bottom', 'top']);
  const result = applyLayerArrange(source, 'front');
  assert.equal(result.active, 'upper');
  assert.deepEqual(result.selectedLayerIds, ['upper', 'middle']);
});

test('arrange planner guards empty, missing, duplicate, grouped and locked selections', () => {
  assert.equal(planLayerArrange(frame({ selectedLayerIds: [] }), 'front').reason, 'no-selection');
  assert.equal(planLayerArrange(frame({ selectedLayerIds: ['missing'] }), 'front').reason, 'missing-selection-layer');
  assert.equal(planLayerArrange(frame({ selectedLayerIds: ['middle', 'middle'] }), 'front').reason, 'duplicate-selection');
  assert.equal(planLayerArrange(frame({ selectedLayerIds: ['middle'], layers: frame().layers.map((layer) => layer.id === 'middle' ? { ...layer, groupId: 'folder' } : layer) }), 'front').reason, 'grouped-selection');
  assert.equal(planLayerArrange(frame({ selectedLayerIds: ['middle'], layers: frame().layers.map((layer) => layer.id === 'middle' ? { ...layer, locked: true } : layer) }), 'front').reason, 'locked-selection');
  assert.equal(layerArrangeReason('grouped-selection').includes('missing'), true);
});

test('folder members move as one atomic block and retain member order', () => {
  const source = frame({
    groups: [{ id: 'folder', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'normal', collapsed: false }],
    layers: ids.map((id) => ({ id, name: id, locked: false, groupId: ['middle', 'upper'].includes(id) ? 'folder' : undefined })),
    active: 'middle',
    selectedLayerIds: ['middle'],
  });
  const plan = planLayerArrange(source, 'front');
  assert.equal(plan.ok, true);
  if (plan.ok) assert.deepEqual(plan.selectedLayerIds, ['middle', 'upper']);
  assert.deepEqual(applyLayerArrange(source, 'front').layers.map((layer) => layer.id), ['bottom', 'top', 'middle', 'upper']);
  assert.deepEqual(applyLayerArrange(source, 'backward').layers.map((layer) => layer.id), ['middle', 'upper', 'bottom', 'top']);
});

test('boundaries are explicit no-ops and preserve the exact frame reference', () => {
  for (const mode of ['front', 'forward', 'backward', 'back']) {
    const all = frame({ active: 'upper', selectedLayerIds: ids });
    const plan = planLayerArrange(all, mode);
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, 'boundary');
    assert.equal(applyLayerArrange(all, mode), all);
  }
  const front = frame({ active: 'top', selectedLayerIds: ['top'] });
  assert.equal(planLayerArrange(front, 'front').reason, 'boundary');
  const back = frame({ active: 'bottom', selectedLayerIds: ['bottom'] });
  assert.equal(planLayerArrange(back, 'back').reason, 'boundary');
});

test('legacy active selection is used when selectedLayerIds is absent', () => {
  const legacy = frame({ selectedLayerIds: undefined, active: 'upper' });
  assert.deepEqual(applyLayerArrange(legacy, 'front').layers.map((layer) => layer.id), ['bottom', 'middle', 'top', 'upper']);
  assert.equal(applyLayerArrange(legacy, 'front').selectedLayerIds, undefined);
});

