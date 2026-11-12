import test from 'node:test';
import assert from 'node:assert/strict';
import { layerPanelPosition, planLayerMoveToPosition } from '../src/layerArrange.ts';

// 77 layers, like the painting that prompted the command; index 0 is the bottom.
const stack = (count, patch = {}) => ({
  w: 100,
  h: 80,
  layers: Array.from({ length: count }, (_, index) => ({ id: `L${index}`, name: `Layer ${index}`, kind: 'raster', asset: 'a', visible: true, opacity: 1, locked: false })),
  active: 'L5',
  selectedLayerIds: ['L5'],
  ...patch,
});
const order = (frame) => frame.layers.map((layer) => layer.id);
const position = (frame, id) => layerPanelPosition(frame, frame.layers.findIndex((layer) => layer.id === id));

test('panel positions count from the top row', () => {
  const frame = stack(77);
  assert.equal(position(frame, 'L76'), 1);
  assert.equal(position(frame, 'L0'), 77);
  assert.equal(position(frame, 'L5'), 72);
});

test('a layer jumps many rows in one step, up or down, without mutating the source', () => {
  const source = stack(77);
  const before = order(source);
  const up = planLayerMoveToPosition(source, 3);
  assert.equal(up.ok, true);
  assert.equal(up.from, 72);
  assert.equal(up.to, 3);
  assert.equal(position(up.frame, 'L5'), 3);
  assert.equal(up.frame.layers.length, 77);
  assert.deepEqual(order(source), before, 'source frame untouched');
  // Every other layer keeps its relative order.
  assert.deepEqual(order(up.frame).filter((id) => id !== 'L5'), before.filter((id) => id !== 'L5'));

  const top = stack(77, { active: 'L70', selectedLayerIds: ['L70'] });
  const down = planLayerMoveToPosition(top, 77);
  assert.equal(down.ok, true);
  assert.equal(order(down.frame)[0], 'L70', 'moved to the very bottom');
  const toTop = planLayerMoveToPosition(source, 1);
  assert.equal(order(toTop.frame).at(-1), 'L5');
});

test('invalid, unchanged and locked moves are refused with a reason', () => {
  const source = stack(10);
  for (const bad of [0, 11, 2.5, Number.NaN]) assert.deepEqual(planLayerMoveToPosition(source, bad), { ok: false, reason: 'invalid-position' });
  assert.deepEqual(planLayerMoveToPosition(source, position(source, 'L5')), { ok: false, reason: 'same-position', from: 5 });
  const locked = stack(10, { layers: stack(10).layers.map((layer) => layer.id === 'L5' ? { ...layer, locked: true } : layer) });
  assert.equal(planLayerMoveToPosition(locked, 1).reason, 'locked-selection');
  assert.equal(planLayerMoveToPosition(stack(10, { selectedLayerIds: [] }), 1).reason, 'no-selection');
});

test('a multi-layer selection moves as one block; its top row lands on the target', () => {
  const source = stack(20, { active: 'L3', selectedLayerIds: ['L2', 'L3'] });
  const plan = planLayerMoveToPosition(source, 2);
  assert.equal(plan.ok, true);
  assert.equal(position(plan.frame, 'L3'), 2);
  assert.equal(position(plan.frame, 'L2'), 3, 'block stays together and in order');
  assert.deepEqual(plan.layerIds.sort(), ['L2', 'L3']);
});

test('a clipping group passed on the way is jumped as one unit and the landing row is reported', () => {
  const layers = stack(8).layers.map((layer) =>
    layer.id === 'L5' ? { ...layer, clippingTo: 'L4' } : layer.id === 'L6' ? { ...layer, clippingTo: 'L5' } : layer,
  );
  const source = stack(8, { layers, active: 'L1', selectedLayerIds: ['L1'] });
  // Target row 3 is L5, inside the L4 clipping group: the move must not split it.
  const plan = planLayerMoveToPosition(source, 3);
  assert.equal(plan.ok, true);
  const ids = order(plan.frame);
  const base = ids.indexOf('L4');
  assert.deepEqual(ids.slice(base, base + 3), ['L4', 'L5', 'L6'], 'clipping group kept contiguous');
  assert.equal(plan.to, position(plan.frame, 'L1'));
  assert.notEqual(plan.to, 3);
});

test('selecting a folder member moves the whole folder', () => {
  const layers = stack(10).layers.map((layer) => (['L2', 'L3', 'L4'].includes(layer.id) ? { ...layer, groupId: 'g' } : layer));
  const source = stack(10, {
    layers,
    groups: [{ id: 'g', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over', collapsed: false }],
    active: 'L3',
    selectedLayerIds: ['L3'],
  });
  const plan = planLayerMoveToPosition(source, 1);
  assert.equal(plan.ok, true);
  assert.deepEqual(order(plan.frame).slice(-3), ['L2', 'L3', 'L4']);
});
