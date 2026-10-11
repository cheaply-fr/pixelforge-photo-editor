import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLayerLock, layerLockReason, planLayerLock } from '../src/layerLock.ts';
import { appendActionStep, createActionSet, parseActionSets, serializeActionSets } from '../src/actions.ts';

const ids = ['layer-a', 'layer-b', 'layer-c'];
const frame = (patch = {}) => ({
  w: 100,
  h: 100,
  layers: ids.map((id, index) => ({ id, name: id, locked: index === 2, matrix: [1, 0, 0, 1, 0, 0] })),
  active: ids[0],
  ...patch,
});

test('legacy active-layer toggle is immutable and preserves metadata', () => {
  const source = frame({ name: 'draft' });
  const plan = planLayerLock(source);
  assert.deepEqual(plan, { ok: true, mode: 'lock', layerIds: [ids[0]] });
  const locked = applyLayerLock(source, plan);
  assert.equal(locked.layers[0].locked, true);
  assert.equal(source.layers[0].locked, false);
  assert.equal(locked.name, 'draft');
});

test('explicit selected layers lock together while unselected state is preserved', () => {
  const source = frame({ selectedLayerIds: [ids[0], ids[1]], active: ids[1] });
  const locked = applyLayerLock(source);
  assert.deepEqual(locked.layers.map((layer) => layer.locked), [true, true, true]);
  assert.deepEqual(locked.selectedLayerIds, source.selectedLayerIds);
  assert.deepEqual(source.layers.map((layer) => layer.locked), [false, false, true]);
});

test('toggle unlocks selected layers when every selected layer is locked', () => {
  const source = frame({ selectedLayerIds: [ids[0], ids[2]], layers: frame().layers.map((layer) => ({ ...layer, locked: true })) });
  const unlocked = applyLayerLock(source);
  assert.deepEqual(unlocked.layers.map((layer) => layer.locked), [false, true, false]);
});

test('explicit lock and unlock modes are deterministic', () => {
  const source = frame({ selectedLayerIds: [ids[0], ids[1]] });
  assert.deepEqual(planLayerLock(source, 'unlock'), { ok: true, mode: 'unlock', layerIds: [ids[0], ids[1]] });
  assert.equal(applyLayerLock(source, 'unlock').layers[0].locked, false);
  assert.equal(applyLayerLock(source, 'lock').layers[1].locked, true);
});

test('invalid selections and locked groups fail closed', () => {
  assert.deepEqual(planLayerLock(frame({ selectedLayerIds: [] })), { ok: false, mode: 'toggle', reason: 'no-selection', layerIds: [] });
  assert.deepEqual(planLayerLock(frame({ selectedLayerIds: ['missing'] })), { ok: false, mode: 'toggle', reason: 'missing-selection-layer', layerIds: ['missing'] });
  const grouped = frame({ selectedLayerIds: [ids[0]], groups: [{ id: 'group-1', name: 'Locked', visible: true, locked: true, opacity: 1, blend: 'source-over', collapsed: false }], layers: frame().layers.map((layer) => layer.id === ids[0] ? { ...layer, groupId: 'group-1' } : layer) });
  const plan = planLayerLock(grouped);
  assert.deepEqual(plan, { ok: false, mode: 'toggle', reason: 'locked-group', layerIds: [ids[0]] });
  assert.equal(applyLayerLock(grouped, plan), grouped);
  assert.equal(layerLockReason('locked-group'), 'Unlock the containing group before changing its layers');
});

test('duplicate, malformed and oversized selections cannot fall back to another layer', () => {
  for (const selectedLayerIds of [[ids[0], ids[0]], null, 'layer-a', Array(33).fill(ids[0])]) {
    const source = frame({ selectedLayerIds });
    assert.equal(planLayerLock(source).reason, 'invalid-selection');
    assert.equal(applyLayerLock(source), source);
  }
  assert.equal(planLayerLock(frame({ active: 'missing' })).reason, 'missing-selection-layer');
});

test('stale plans and plans bypassing a group lock cannot modify the frame', () => {
  const source = frame({ selectedLayerIds: [ids[0]] });
  const plan = planLayerLock(source);
  const changedSelection = { ...source, selectedLayerIds: [ids[1]] };
  assert.equal(applyLayerLock(changedSelection, plan), changedSelection);
  const changedGroup = { ...source, groups: [{ id: 'group', locked: true }],
    layers: source.layers.map((layer) => ({ ...layer, groupId: 'group' })) };
  assert.equal(applyLayerLock(changedGroup, plan), changedGroup);
});

test('explicit no-op locking does not allocate a new history frame', () => {
  const source = frame({ selectedLayerIds: [ids[2]] });
  assert.equal(applyLayerLock(source, 'lock'), source);
  const unlocked = frame({ selectedLayerIds: [ids[0]] });
  assert.equal(applyLayerLock(unlocked, 'unlock'), unlocked);
});

test('lock command can be recorded and round-tripped as a local action', () => {
  const action = appendActionStep(createActionSet('Lock selection'), 'lock-layers', 'Lock Layers');
  const [restored] = parseActionSets(serializeActionSets([action]));
  assert.equal(restored.steps[0].command, 'lock-layers');
});
