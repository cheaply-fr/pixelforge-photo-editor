import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDroppedFile,
  describeLayerDrop,
  describeLayerMove,
  dropPositionFromPointer,
  layerDeleteNotice,
  layerDeleteReason,
  layerDropNotice,
  layerStackDescription,
  placementMatrixAt,
  planLayerDelete,
  planLayerDrop,
} from '../src/layerDragReorder.ts';

/** Build a frame from bottom-to-top layer specs: 'id' or { id, ...patch }. */
const frame = (specs, patch = {}) => ({
  w: 100,
  h: 80,
  layers: specs.map((spec) => {
    const value = typeof spec === 'string' ? { id: spec } : spec;
    return { name: value.id, kind: 'raster', locked: false, visible: true, ...value };
  }),
  active: patch.active ?? (typeof specs.at(-1) === 'string' ? specs.at(-1) : specs.at(-1).id),
  ...patch,
});
const order = (value) => value.layers.map((layer) => layer.id);
const layer = (value, id) => value.layers.find((item) => item.id === id);
const folder = (id, extra = {}) => ({
  id,
  name: id,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  collapsed: false,
  ...extra,
});

test('pointer zones split layer rows in halves and folder rows into above / into', () => {
  assert.equal(dropPositionFromPointer('layer', 100, 40, 105), 'above');
  assert.equal(dropPositionFromPointer('layer', 100, 40, 119.9), 'above');
  assert.equal(dropPositionFromPointer('layer', 100, 40, 120), 'below');
  assert.equal(dropPositionFromPointer('layer', 100, 40, 139), 'below');
  assert.equal(dropPositionFromPointer('group', 100, 30, 105), 'above');
  assert.equal(dropPositionFromPointer('group', 100, 30, 111), 'into');
  assert.equal(dropPositionFromPointer('group', 100, 30, 129), 'into');
  // A zero-height row never divides by zero.
  assert.equal(dropPositionFromPointer('layer', 100, 0, 100), 'above');
});

test('a single layer drops above or below another row without mutating the input', () => {
  const source = frame(['a', 'b', 'c', 'd']);
  const snapshot = JSON.stringify(source);
  const above = planLayerDrop(source, { kind: 'layers', ids: ['a'] }, { kind: 'layer', id: 'c', position: 'above' });
  assert.equal(above.ok, true);
  assert.deepEqual(order(above.frame), ['b', 'c', 'a', 'd']);
  assert.equal(above.mode, 'above');
  assert.equal(describeLayerDrop(above), 'Drop above c');
  const below = planLayerDrop(source, { kind: 'layers', ids: ['d'] }, { kind: 'layer', id: 'b', position: 'below' });
  assert.deepEqual(order(below.frame), ['a', 'd', 'b', 'c']);
  assert.equal(describeLayerDrop(below), 'Drop below b');
  const bottom = planLayerDrop(source, { kind: 'layers', ids: ['c'] }, { kind: 'layer', id: 'a', position: 'below' });
  assert.deepEqual(order(bottom.frame), ['c', 'a', 'b', 'd']);
  assert.equal(JSON.stringify(source), snapshot);
  // Active layer and selection are left as they were.
  assert.equal(above.frame.active, source.active);
  assert.match(layerDropNotice(above), /^Layer reordered\. Undo restores/);
});

test('drops that leave the stack unchanged, onto the dragged row or with missing ids are refused', () => {
  const source = frame(['a', 'b', 'c']);
  const same = planLayerDrop(source, { kind: 'layers', ids: ['b'] }, { kind: 'layer', id: 'a', position: 'above' });
  assert.deepEqual([same.ok, same.reason], [false, 'no-change']);
  assert.equal(describeLayerDrop(same), 'Already here');
  const self = planLayerDrop(source, { kind: 'layers', ids: ['b'] }, { kind: 'layer', id: 'b', position: 'below' });
  assert.deepEqual([self.ok, self.reason], [false, 'onto-self']);
  assert.equal(planLayerDrop(source, { kind: 'layers', ids: [] }, { kind: 'layer', id: 'a', position: 'above' }).reason, 'empty');
  assert.equal(planLayerDrop(source, { kind: 'layers', ids: ['zz'] }, { kind: 'layer', id: 'a', position: 'above' }).reason, 'missing');
  assert.equal(planLayerDrop(source, { kind: 'layers', ids: ['a'] }, { kind: 'layer', id: 'zz', position: 'above' }).reason, 'missing');
});

test('multi-selected layers move together in their stack order, even when not contiguous', () => {
  const source = frame(['a', 'b', 'c', 'd', 'e']);
  const plan = planLayerDrop(source, { kind: 'layers', ids: ['d', 'a'] }, { kind: 'layer', id: 'e', position: 'above' });
  assert.deepEqual(order(plan.frame), ['b', 'c', 'e', 'a', 'd']);
  assert.deepEqual(plan.movedIds, ['a', 'd']);
  assert.match(layerDropNotice(plan), /^2 layers reordered/);
  const down = planLayerDrop(source, { kind: 'layers', ids: ['e', 'c'] }, { kind: 'layer', id: 'a', position: 'below' });
  assert.deepEqual(order(down.frame), ['c', 'e', 'a', 'b', 'd']);
});

test('locked layers and layers in locked folders refuse to move', () => {
  const source = frame(['a', { id: 'b', locked: true }, 'c']);
  const locked = planLayerDrop(source, { kind: 'layers', ids: ['b'] }, { kind: 'layer', id: 'c', position: 'above' });
  assert.deepEqual([locked.ok, locked.reason], [false, 'locked']);
  assert.equal(describeLayerDrop(locked), 'Locked layers cannot be moved');
  // Moving an unlocked layer past a locked one is fine.
  assert.equal(planLayerDrop(source, { kind: 'layers', ids: ['a'] }, { kind: 'layer', id: 'c', position: 'above' }).ok, true);
  const grouped = frame(['a', { id: 'g1', groupId: 'G' }, 'c'], { groups: [folder('G', { locked: true })] });
  assert.equal(planLayerDrop(grouped, { kind: 'layers', ids: ['g1'] }, { kind: 'layer', id: 'c', position: 'above' }).reason, 'locked');
  assert.equal(planLayerDrop(grouped, { kind: 'group', id: 'G' }, { kind: 'layer', id: 'c', position: 'above' }).reason, 'locked-folder');
  // A locked destination folder refuses new members.
  const into = planLayerDrop(grouped, { kind: 'layers', ids: ['a'] }, { kind: 'group', id: 'G', position: 'into' });
  assert.deepEqual([into.ok, into.reason], [false, 'locked-folder']);
  assert.equal(planLayerDrop(grouped, { kind: 'layers', ids: ['c'] }, { kind: 'layer', id: 'g1', position: 'below' }).reason, 'locked-folder');
  assert.equal(describeLayerDrop(into), 'Locked folders cannot be changed');
});

test('dropping onto a folder row puts the layer at the top of the folder; above the header stays outside', () => {
  const source = frame(['a', { id: 'g1', groupId: 'G' }, { id: 'g2', groupId: 'G' }, 'z'], {
    groups: [folder('G', { name: 'Folder' })],
  });
  const into = planLayerDrop(source, { kind: 'layers', ids: ['a'] }, { kind: 'group', id: 'G', position: 'into' });
  assert.equal(into.ok, true);
  assert.equal(into.mode, 'into-folder');
  assert.deepEqual(order(into.frame), ['g1', 'g2', 'a', 'z']);
  assert.equal(layer(into.frame, 'a').groupId, 'G');
  assert.equal(describeLayerDrop(into), 'Drop into folder Folder');
  assert.match(layerDropNotice(into), /moved into folder Folder/);
  const aboveHeader = planLayerDrop(source, { kind: 'layers', ids: ['a'] }, { kind: 'group', id: 'G', position: 'above' });
  assert.deepEqual(order(aboveHeader.frame), ['g1', 'g2', 'a', 'z']);
  assert.equal(layer(aboveHeader.frame, 'a').groupId, undefined);
  // Next to a member: joins that folder at that position.
  const between = planLayerDrop(source, { kind: 'layers', ids: ['z'] }, { kind: 'layer', id: 'g1', position: 'above' });
  assert.deepEqual(order(between.frame), ['a', 'g1', 'z', 'g2']);
  assert.equal(layer(between.frame, 'z').groupId, 'G');
  assert.equal(describeLayerDrop(between, source), 'Drop above g1 in Folder');
});

test('dragging a member next to a layer outside the folder takes it out; the emptied folder is removed', () => {
  const source = frame(['a', { id: 'g1', groupId: 'G' }, 'z'], { groups: [folder('G')] });
  const out = planLayerDrop(source, { kind: 'layers', ids: ['g1'] }, { kind: 'layer', id: 'z', position: 'above' });
  assert.deepEqual(order(out.frame), ['a', 'z', 'g1']);
  assert.equal(layer(out.frame, 'g1').groupId, undefined);
  assert.deepEqual(out.frame.groups, []);
  // Reordering within a folder keeps membership.
  const two = frame(['a', { id: 'g1', groupId: 'G' }, { id: 'g2', groupId: 'G' }], { groups: [folder('G')] });
  const inside = planLayerDrop(two, { kind: 'layers', ids: ['g1'] }, { kind: 'layer', id: 'g2', position: 'above' });
  assert.deepEqual(order(inside.frame), ['a', 'g2', 'g1']);
  assert.equal(layer(inside.frame, 'g1').groupId, 'G');
  assert.equal(inside.frame.groups.length, 1);
});

test('a dragged folder moves as one block and never nests inside another folder', () => {
  const source = frame(
    ['a', { id: 'g1', groupId: 'G' }, { id: 'g2', groupId: 'G' }, 'b', { id: 'h1', groupId: 'H' }, { id: 'h2', groupId: 'H' }, 'c'],
    { groups: [folder('G'), folder('H')] },
  );
  const top = planLayerDrop(source, { kind: 'group', id: 'G' }, { kind: 'layer', id: 'c', position: 'above' });
  assert.deepEqual(order(top.frame), ['a', 'b', 'h1', 'h2', 'c', 'g1', 'g2']);
  assert.equal(layer(top.frame, 'g1').groupId, 'G');
  // Onto a member of H: lands beside the whole H block.
  const beside = planLayerDrop(source, { kind: 'group', id: 'G' }, { kind: 'layer', id: 'h1', position: 'above' });
  assert.deepEqual(order(beside.frame), ['a', 'b', 'h1', 'h2', 'g1', 'g2', 'c']);
  assert.equal(layer(beside.frame, 'g1').groupId, 'G');
  assert.equal(layer(beside.frame, 'h2').groupId, 'H');
  const below = planLayerDrop(source, { kind: 'group', id: 'G' }, { kind: 'layer', id: 'h2', position: 'below' });
  assert.deepEqual(order(below.frame), ['a', 'b', 'g1', 'g2', 'h1', 'h2', 'c']);
  // 'into' another folder header lands above it instead of nesting.
  const header = planLayerDrop(source, { kind: 'group', id: 'G' }, { kind: 'group', id: 'H', position: 'into' });
  assert.deepEqual(order(header.frame), ['a', 'b', 'h1', 'h2', 'g1', 'g2', 'c']);
  assert.equal(planLayerDrop(source, { kind: 'group', id: 'G' }, { kind: 'group', id: 'G', position: 'into' }).reason, 'onto-self');
});

test('a dragged clipping base carries its clipped layers as one unit', () => {
  const source = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, { id: 'c2', clippingTo: 'c1' }, 'top']);
  const plan = planLayerDrop(source, { kind: 'layers', ids: ['base'] }, { kind: 'layer', id: 'top', position: 'above' });
  assert.deepEqual(order(plan.frame), ['bg', 'top', 'base', 'c1', 'c2']);
  assert.equal(layer(plan.frame, 'c1').clippingTo, 'base');
  assert.equal(layer(plan.frame, 'c2').clippingTo, 'c1');
  assert.deepEqual(plan.released, []);
  assert.deepEqual(plan.movedIds, ['base', 'c1', 'c2']);
});

test('an unclipped raster dropped between a base and its clipped layers joins the clipping group', () => {
  const source = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, 'free']);
  const plan = planLayerDrop(source, { kind: 'layers', ids: ['free'] }, { kind: 'layer', id: 'base', position: 'above' });
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'join-clipping');
  assert.deepEqual(order(plan.frame), ['bg', 'base', 'free', 'c1']);
  assert.equal(layer(plan.frame, 'free').clippingTo, 'base');
  assert.equal(layer(plan.frame, 'c1').clippingTo, 'free');
  assert.deepEqual(plan.released, []);
  assert.equal(describeLayerDrop(plan), 'Drop into clipping group of base');
  assert.match(layerDropNotice(plan), /moved into the clipping group of base/);
  // Dropping "below c1" is the same gap.
  const same = planLayerDrop(source, { kind: 'layers', ids: ['free'] }, { kind: 'layer', id: 'c1', position: 'below' });
  assert.deepEqual(order(same.frame), ['bg', 'base', 'free', 'c1']);
  // Two layers join together as a chain.
  const many = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, 'x', 'y']);
  const chain = planLayerDrop(many, { kind: 'layers', ids: ['x', 'y'] }, { kind: 'layer', id: 'base', position: 'above' });
  assert.deepEqual(order(chain.frame), ['bg', 'base', 'x', 'y', 'c1']);
  assert.deepEqual(
    ['x', 'y', 'c1'].map((id) => layer(chain.frame, id).clippingTo),
    ['base', 'x', 'y'],
  );
});

test('layers that cannot clip are redirected above the clipping group, never splitting it', () => {
  const source = frame([{ id: 'adj', kind: 'adjustment' }, 'bg', 'base', { id: 'c1', clippingTo: 'base' }, { id: 'c2', clippingTo: 'c1' }, 'top']);
  const plan = planLayerDrop(source, { kind: 'layers', ids: ['adj'] }, { kind: 'layer', id: 'base', position: 'above' });
  assert.equal(plan.mode, 'above-clipping-group');
  assert.deepEqual(order(plan.frame), ['bg', 'base', 'c1', 'c2', 'adj', 'top']);
  assert.equal(layer(plan.frame, 'c1').clippingTo, 'base');
  assert.equal(layer(plan.frame, 'adj').clippingTo, undefined);
  assert.equal(plan.ok, true);
  assert.equal(describeLayerDrop(plan), 'Drop above the clipping group (cannot join it)');
  // A base with its own clipped layers cannot join another group either.
  const two = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, 'b2', { id: 'd1', clippingTo: 'b2' }]);
  const nested = planLayerDrop(two, { kind: 'layers', ids: ['b2'] }, { kind: 'layer', id: 'base', position: 'above' });
  assert.equal(nested.mode, 'above-clipping-group');
  assert.equal(nested.ok, false); // already directly above that group: no change
  const from = frame(['b2', { id: 'd1', clippingTo: 'b2' }, 'bg', 'base', { id: 'c1', clippingTo: 'base' }, 'top']);
  const moved = planLayerDrop(from, { kind: 'layers', ids: ['b2'] }, { kind: 'layer', id: 'c1', position: 'below' });
  assert.deepEqual(order(moved.frame), ['bg', 'base', 'c1', 'b2', 'd1', 'top']);
  assert.equal(layer(moved.frame, 'd1').clippingTo, 'b2');
  assert.equal(layer(moved.frame, 'c1').clippingTo, 'base');
});

test('a clipped layer dragged out of its group is released alone and reported', () => {
  const source = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, { id: 'c2', clippingTo: 'c1' }, 'top']);
  const plan = planLayerDrop(source, { kind: 'layers', ids: ['c1'] }, { kind: 'layer', id: 'top', position: 'above' });
  assert.deepEqual(order(plan.frame), ['bg', 'base', 'c2', 'top', 'c1']);
  assert.equal(layer(plan.frame, 'c1').clippingTo, undefined);
  // The remaining clipped layer stays in the group, re-pointed to the base.
  assert.equal(layer(plan.frame, 'c2').clippingTo, 'base');
  assert.deepEqual(plan.released.map((item) => item.id), ['c1']);
  assert.match(layerDropNotice(plan), /clipping mask released for c1/);
  // Reordering inside the group keeps both clipped.
  const inside = planLayerDrop(source, { kind: 'layers', ids: ['c1'] }, { kind: 'layer', id: 'c2', position: 'above' });
  assert.deepEqual(order(inside.frame), ['bg', 'base', 'c2', 'c1', 'top']);
  assert.equal(layer(inside.frame, 'c2').clippingTo, 'base');
  assert.equal(layer(inside.frame, 'c1').clippingTo, 'c2');
  assert.deepEqual(inside.released, []);
});

test('delete removes the selection in one step and selects the layer below, else above', () => {
  const source = frame(['a', 'b', 'c', 'd'], { active: 'c', selectedLayerIds: ['c'] });
  const one = planLayerDelete(source, ['c']);
  assert.deepEqual(order(one.frame), ['a', 'b', 'd']);
  assert.equal(one.frame.active, 'b');
  assert.deepEqual(one.frame.selectedLayerIds, ['b']);
  assert.equal(layerDeleteNotice(one), 'c deleted. Undo restores it.');
  const bottom = planLayerDelete({ ...source, active: 'a', selectedLayerIds: ['a'] }, ['a']);
  assert.equal(bottom.frame.active, 'b');
  const many = planLayerDelete({ ...source, active: 'd', selectedLayerIds: ['b', 'd'] }, ['b', 'd']);
  assert.deepEqual(order(many.frame), ['a', 'c']);
  assert.equal(many.frame.active, 'a');
  assert.equal(layerDeleteNotice(many), '2 layers deleted. Undo restores them.');
  const lowest = planLayerDelete({ ...source, active: 'a' }, ['a', 'b']);
  assert.equal(lowest.frame.active, 'c');
  // A surviving active layer stays active.
  const keep = planLayerDelete(source, ['a']);
  assert.equal(keep.frame.active, 'c');
  assert.deepEqual(keep.frame.selectedLayerIds, ['c']);
  assert.deepEqual(order(source), ['a', 'b', 'c', 'd']);
});

test('delete refuses locked layers, locked folders, missing ids and the last layer', () => {
  const source = frame(['a', { id: 'b', locked: true }, { id: 'g', groupId: 'G' }], { groups: [folder('G', { locked: true })] });
  assert.equal(planLayerDelete(source, ['b']).reason, 'locked');
  assert.equal(planLayerDelete(source, ['g']).reason, 'locked');
  assert.equal(planLayerDelete(source, ['a', 'b']).reason, 'locked');
  assert.equal(planLayerDelete(source, []).reason, 'no-selection');
  assert.equal(planLayerDelete(source, ['zz']).reason, 'missing');
  assert.equal(planLayerDelete(frame(['only']), ['only']).reason, 'last-layer');
  assert.equal(layerDeleteReason('last-layer'), 'Keep at least one layer in the document');
  assert.equal(layerDeleteReason('locked'), 'Unlock all selected layers before deleting');
});

test('deleting a clipping base releases the lowest clipped layer, which becomes the new base', () => {
  const source = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, { id: 'c2', clippingTo: 'c1' }], { active: 'base' });
  const plan = planLayerDelete(source, ['base']);
  assert.deepEqual(order(plan.frame), ['bg', 'c1', 'c2']);
  assert.equal(layer(plan.frame, 'c1').clippingTo, undefined);
  assert.equal(layer(plan.frame, 'c2').clippingTo, 'c1');
  assert.deepEqual(plan.released.map((item) => item.id), ['c1']);
  assert.match(layerDeleteNotice(plan), /clipping mask released for c1/);
  assert.equal(plan.frame.active, 'bg');
});

test('deleting a clipped member keeps the layers above it clipped to the same base', () => {
  const source = frame(['bg', 'base', { id: 'c1', clippingTo: 'base' }, { id: 'c2', clippingTo: 'c1' }, { id: 'c3', clippingTo: 'c2' }]);
  const plan = planLayerDelete(source, ['c1', 'c2']);
  assert.deepEqual(order(plan.frame), ['bg', 'base', 'c3']);
  assert.equal(layer(plan.frame, 'c3').clippingTo, 'base');
  assert.deepEqual(plan.repointed.map((item) => item.id), ['c3']);
  assert.deepEqual(plan.released, []);
});

test('delete removes emptied folders and cleans artboard membership', () => {
  const source = frame(['a', { id: 'g1', groupId: 'G' }, 'b'], {
    groups: [folder('G')],
    artboards: [{ id: 'ab', name: 'Board', x: 0, y: 0, w: 10, h: 10, layerIds: ['a', 'g1'] }],
  });
  const plan = planLayerDelete(source, ['g1']);
  assert.deepEqual(plan.frame.groups, []);
  assert.deepEqual(plan.frame.artboards[0].layerIds, ['a']);
});

test('stack descriptions and move announcements count from the top of the panel', () => {
  const source = frame(['bg', 'p1', 'p2', 'p3']);
  assert.equal(layerStackDescription(source, 'p3'), 'layer 1 of 4, above p2');
  assert.equal(layerStackDescription(source, 'p1'), 'layer 3 of 4, above bg');
  assert.equal(layerStackDescription(source, 'bg'), 'layer 4 of 4, bottom of the stack');
  assert.equal(layerStackDescription(source, 'zz'), '');
  assert.equal(describeLayerMove(source, ['p2']), 'p2 moved above p1, 2 of 4');
  assert.equal(describeLayerMove(source, ['bg']), 'bg moved to the bottom, 4 of 4');
  assert.equal(describeLayerMove(source, ['p2', 'p3']), '2 layers moved above p1, 1 of 4');
  assert.equal(describeLayerMove(source, []), '');
  const unnamed = { layers: [{ id: 'x', name: '' }, { id: 'y', name: 'Y' }] };
  assert.equal(layerStackDescription(unnamed, 'y'), 'layer 1 of 2, above Untitled layer');
});

test('placement centres an image at the drop point, clamps to the document and defaults to its centre', () => {
  assert.deepEqual(placementMatrixAt({ x: 50, y: 40 }, 20, 10, 100, 80), [1, 0, 0, 1, 40, 35]);
  assert.deepEqual(placementMatrixAt({ x: 10.4, y: 70.6 }, 21, 11, 100, 80), [1, 0, 0, 1, 0, 65]);
  assert.deepEqual(placementMatrixAt(undefined, 20, 10, 100, 80), [1, 0, 0, 1, 40, 35]);
  assert.deepEqual(placementMatrixAt({ x: -500, y: 900 }, 20, 10, 100, 80), [1, 0, 0, 1, -10, 75]);
  assert.deepEqual(placementMatrixAt({ x: Number.NaN, y: 0 }, 20, 10, 100, 80), [1, 0, 0, 1, 40, -5]);
  // Larger than the document: still centred (may extend past the edges).
  assert.deepEqual(placementMatrixAt(undefined, 300, 200, 100, 80), [1, 0, 0, 1, -100, -60]);
});

test('dropped files are classified as layers, documents, projects or unsupported', () => {
  assert.equal(classifyDroppedFile('photo.png', 'image/png', true, 'raster'), 'image');
  assert.equal(classifyDroppedFile('art.psd', '', true, 'psd'), 'document');
  assert.equal(classifyDroppedFile('work.pixelforge', '', false), 'project');
  assert.equal(classifyDroppedFile('draft.json', 'application/json', false), 'project');
  assert.equal(classifyDroppedFile('notes.txt', 'text/plain', false), 'unsupported');
});
