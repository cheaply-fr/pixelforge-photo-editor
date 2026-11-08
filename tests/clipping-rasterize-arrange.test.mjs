import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clippingGroupBase,
  preserveClippingAfterReorder,
  preserveClippingAfterReplace,
  sanitizeClippingRelations,
  validClippingRelationship,
} from '../src/layerClipping.ts';
import {
  applyLayerArrange,
  clippingGroupKeys,
  expandClippingGroupSelection,
  planLayerArrange,
  stepLayerRuns,
} from '../src/layerArrange.ts';
import { rasterizedLayer, rasterizeRenderSource } from '../src/layerRasterize.ts';
import { neutral } from '../src/document.ts';
import { neutralLayerStyles } from '../src/layerStyles.ts';

const id = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const layer = (n, kind = 'raster', patch = {}) => ({
  id: id(n),
  name: `L${n}`,
  kind,
  visible: true,
  locked: false,
  opacity: 1,
  blend: 'source-over',
  matrix: [1, 0, 0, 1, 0, 0],
  adjustments: { ...neutral },
  ...(kind === 'raster' || kind === 'smart-object' ? { asset: `asset-${n}` } : {}),
  ...patch,
});
const order = (frame) => frame.layers.map((item) => item.name);
const links = (frame) => frame.layers.map((item) => [item.name, item.clippingTo ? frame.layers.find((other) => other.id === item.clippingTo)?.name : undefined]);
const arrange = (frame, mode) => preserveClippingAfterReorder(frame, applyLayerArrange(frame, mode));

// --- Bug 1: Rasterize keeps the clipping relationship and layer properties ---

const styled = {
  ...neutralLayerStyles,
  dropShadow: { ...neutralLayerStyles.dropShadow, enabled: true },
};

test('rasterizedLayer keeps clippingTo, folder, name, visibility, lock, opacity, blend, styles and link', () => {
  const source = layer(2, 'raster', {
    name: 'Clouds texture',
    clippingTo: id(1),
    groupId: 'folder-a',
    visible: false,
    opacity: 0.4,
    blend: 'multiply',
    styles: styled,
    layerLinkId: 'link-1',
    smartFilters: [{ id: 'f1', type: 'clouds' }, { id: 'f2', type: 'emboss' }],
    mask: 'mask-asset',
    adjustments: { ...neutral, brightness: 30 },
  });
  const result = rasterizedLayer(source, 'new-asset');
  assert.equal(result.id, source.id);
  assert.equal(result.kind, 'raster');
  assert.equal(result.asset, 'new-asset');
  assert.equal(result.name, 'Clouds texture');
  assert.equal(result.clippingTo, id(1));
  assert.equal(result.groupId, 'folder-a');
  assert.equal(result.visible, false);
  assert.equal(result.locked, false);
  assert.equal(result.opacity, 0.4);
  assert.equal(result.blend, 'multiply');
  assert.equal(result.styles, styled);
  assert.equal(result.layerLinkId, 'link-1');
  // Baked into the pixels: filters, adjustments and the mask.
  assert.equal(result.smartFilters, undefined);
  assert.equal(result.mask, undefined);
  assert.deepEqual(result.adjustments, neutral);
  assert.deepEqual(result.matrix, [1, 0, 0, 1, 0, 0]);
  // The input is untouched.
  assert.equal(source.kind, 'raster');
  assert.equal(source.asset, 'asset-2');
});

test('every rasterizable kind keeps its clipping link and stays a valid clipping source', () => {
  const kinds = [
    ['raster', {}],
    ['raster', { fillColor: '#ff0000' }],
    ['raster', { smartFilters: [{ id: 'f', type: 'emboss' }] }],
    ['smart-object', { sourceName: 'photo.png' }],
    ['text', { text: 'Hi', color: '#fff', fontSize: 20 }],
    ['rectangle', { width: 4, height: 4, color: '#fff', stroke: 0, fill: true }],
    ['path', { path: { nodes: [], closed: true } }],
  ];
  for (const [kind, patch] of kinds) {
    // Only raster/smart-object sources can be clipped; other kinds may still
    // carry a link from imported data, which is kept and then validated.
    const source = layer(2, kind, { clippingTo: id(1), ...patch });
    const result = rasterizedLayer(source, 'pixels');
    assert.equal(result.kind, 'raster', kind);
    assert.equal(result.clippingTo, id(1), kind);
    assert.equal(result.fillColor, undefined, `${kind} fill colour is baked`);
    const frame = { w: 4, h: 4, active: id(2), layers: [layer(1, 'rectangle', { width: 4, height: 4, color: '#000', stroke: 0, fill: true }), result] };
    assert.equal(validClippingRelationship(frame, result.id, id(1)), true, kind);
    assert.equal(sanitizeClippingRelations(frame), frame, `${kind} link stays valid`);
    assert.equal(clippingGroupBase(frame, result)?.id, id(1));
  }
});

test('rasterizedLayer omits clippingTo, neutral styles and links when the source has none', () => {
  const result = rasterizedLayer(layer(3, 'text', { text: 'x' }), 'pixels');
  assert.equal('clippingTo' in result, false);
  assert.equal('layerLinkId' in result, false);
  assert.deepEqual(result.styles.dropShadow, neutralLayerStyles.dropShadow);
});

test('rasterizing a clipping base keeps the clipped layers above it valid', () => {
  const base = layer(1, 'text', { text: 'A', color: '#fff', fontSize: 20 });
  const frame = { w: 4, h: 4, active: id(1), layers: [base, layer(2, 'raster', { clippingTo: id(1) }), layer(3, 'raster', { clippingTo: id(2) })] };
  const next = { ...frame, layers: frame.layers.map((item) => (item.id === id(1) ? rasterizedLayer(item, 'p') : item)) };
  assert.equal(sanitizeClippingRelations(next), next);
  assert.equal(clippingGroupBase(next, next.layers[2]).id, id(1));
});

test('rasterizeRenderSource renders opaque, unblended, unstyled and unclipped', () => {
  const source = layer(2, 'raster', { clippingTo: id(1), opacity: 0.3, blend: 'screen', visible: false, styles: styled, smartFilters: [{ id: 'f' }] });
  const render = rasterizeRenderSource(source);
  assert.equal('clippingTo' in render, false);
  assert.equal(render.opacity, 1);
  assert.equal(render.blend, 'source-over');
  assert.equal(render.visible, true);
  assert.equal(render.styles, undefined);
  assert.deepEqual(render.smartFilters, [{ id: 'f' }], 'smart filters are baked by the renderer');
  assert.equal(source.clippingTo, id(1));
});

// --- Bug 3: arrange moves outside layers past whole clipping groups ---

// Bottom to top: Figure, Figure shade (clipped to Figure), X.
const figure = () => ({
  w: 4,
  h: 4,
  active: id(3),
  selectedLayerIds: [id(3)],
  layers: [
    layer(1, 'raster', { name: 'Figure' }),
    layer(2, 'raster', { name: 'Figure shade', clippingTo: id(1) }),
    layer(3, 'raster', { name: 'X' }),
  ],
});

test('Send Backward moves an outside layer past the whole clipping group without releasing it', () => {
  const frame = figure();
  const { frame: next, released } = arrange(frame, 'backward');
  assert.deepEqual(released, []);
  assert.deepEqual(order(next), ['X', 'Figure', 'Figure shade']);
  assert.deepEqual(links(next), [['X', undefined], ['Figure', undefined], ['Figure shade', 'Figure']]);
  // Bring Forward jumps back past the whole group in one step.
  const back = arrange(next, 'forward');
  assert.deepEqual(back.released, []);
  assert.deepEqual(order(back.frame), ['Figure', 'Figure shade', 'X']);
  assert.deepEqual(links(back.frame), links(frame));
});

test('an outside layer jumps a multi-layer clipping group (base and every clipped layer)', () => {
  const frame = {
    ...figure(),
    active: id(5),
    selectedLayerIds: [id(5)],
    layers: [
      layer(9, 'raster', { name: 'Bottom' }),
      layer(1, 'raster', { name: 'Base' }),
      layer(2, 'raster', { name: 'C1', clippingTo: id(1) }),
      layer(3, 'raster', { name: 'C2', clippingTo: id(2) }),
      layer(4, 'raster', { name: 'C3', clippingTo: id(3) }),
      layer(5, 'raster', { name: 'X' }),
    ],
  };
  const down = arrange(frame, 'backward');
  assert.deepEqual(down.released, []);
  assert.deepEqual(order(down.frame), ['Bottom', 'X', 'Base', 'C1', 'C2', 'C3']);
  assert.deepEqual(down.frame.layers.slice(2).map((item) => item.clippingTo), [undefined, id(1), id(2), id(3)]);
  const further = arrange({ ...down.frame }, 'backward');
  assert.deepEqual(order(further.frame), ['X', 'Bottom', 'Base', 'C1', 'C2', 'C3']);
  const up = arrange(down.frame, 'forward');
  assert.deepEqual(order(up.frame), order(frame));
  assert.deepEqual(up.released, []);
});

test('Bring Forward from below a clipping group lands above the whole group', () => {
  const frame = {
    ...figure(),
    active: id(0),
    selectedLayerIds: [id(0)],
    layers: [layer(0, 'raster', { name: 'Y' }), ...figure().layers],
  };
  const result = arrange(frame, 'forward');
  assert.deepEqual(result.released, []);
  assert.deepEqual(order(result.frame), ['Figure', 'Figure shade', 'Y', 'X']);
  assert.equal(result.frame.layers[1].clippingTo, id(1));
});

test('a clipped layer inside its group keeps the single-step behaviour', () => {
  const frame = {
    ...figure(),
    active: id(3),
    selectedLayerIds: [id(3)],
    layers: [
      layer(1, 'raster', { name: 'Base' }),
      layer(2, 'raster', { name: 'C1', clippingTo: id(1) }),
      layer(3, 'raster', { name: 'C2', clippingTo: id(2) }),
    ],
  };
  const within = arrange(frame, 'backward');
  assert.deepEqual(order(within.frame), ['Base', 'C2', 'C1']);
  assert.deepEqual(within.released, []);
  // Leaving the group (below its base) releases only the moving layer.
  const leave = arrange({ ...within.frame, active: id(3), selectedLayerIds: [id(3)] }, 'backward');
  assert.deepEqual(order(leave.frame), ['C2', 'Base', 'C1']);
  assert.deepEqual(leave.released.map((item) => item.name), ['C2']);
  assert.equal(leave.frame.layers[2].clippingTo, id(1), 'C1 stays clipped to the base');
});

test('the top clipped layer leaving upward jumps a neighbouring clipping group instead of splitting it', () => {
  // Bottom to top: A, A1 (clipped to A), B, B1 (clipped to B).
  const frame = {
    w: 4,
    h: 4,
    active: id(2),
    selectedLayerIds: [id(2)],
    layers: [
      layer(1, 'raster', { name: 'A' }),
      layer(2, 'raster', { name: 'A1', clippingTo: id(1) }),
      layer(3, 'raster', { name: 'B' }),
      layer(4, 'raster', { name: 'B1', clippingTo: id(3) }),
    ],
  };
  const result = arrange(frame, 'forward');
  assert.deepEqual(order(result.frame), ['A', 'B', 'B1', 'A1']);
  assert.deepEqual(result.released.map((item) => item.name), ['A1']);
  assert.equal(result.frame.layers[2].clippingTo, id(3), 'B1 stays clipped to B');
});

test('selecting a clipping base moves the whole group with every arrange command', () => {
  const frame = {
    w: 4,
    h: 4,
    active: id(1),
    selectedLayerIds: [id(1)],
    layers: [
      layer(0, 'raster', { name: 'Y' }),
      layer(1, 'raster', { name: 'Base' }),
      layer(2, 'raster', { name: 'C1', clippingTo: id(1) }),
      layer(3, 'raster', { name: 'Z' }),
    ],
  };
  const plan = planLayerArrange(frame, 'forward');
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.selectedLayerIds, [id(1), id(2)]);
  const expected = {
    forward: ['Y', 'Z', 'Base', 'C1'],
    backward: ['Base', 'C1', 'Y', 'Z'],
    front: ['Y', 'Z', 'Base', 'C1'],
    back: ['Base', 'C1', 'Y', 'Z'],
  };
  for (const [mode, names] of Object.entries(expected)) {
    const result = arrange(frame, mode);
    assert.deepEqual(order(result.frame), names, mode);
    assert.deepEqual(result.released, [], mode);
    assert.equal(result.frame.layers.find((item) => item.id === id(2)).clippingTo, id(1), mode);
  }
});

test('Bring to Front / Send to Back of an outside layer never release other layers', () => {
  const frame = {
    ...figure(),
    active: id(0),
    selectedLayerIds: [id(0)],
    layers: [layer(0, 'raster', { name: 'Y' }), ...figure().layers],
  };
  const front = arrange(frame, 'front');
  assert.deepEqual(order(front.frame), ['Figure', 'Figure shade', 'X', 'Y']);
  assert.deepEqual(front.released, []);
  const back = arrange({ ...frame, active: id(3), selectedLayerIds: [id(3)] }, 'back');
  assert.deepEqual(order(back.frame), ['X', 'Y', 'Figure', 'Figure shade']);
  assert.deepEqual(back.released, []);
  // A clipped layer sent to the back releases only itself.
  const shade = arrange({ ...frame, active: id(2), selectedLayerIds: [id(2)] }, 'back');
  assert.deepEqual(shade.released.map((item) => item.name), ['Figure shade']);
});

test('a locked clipped layer blocks moving its base (fail-closed)', () => {
  const frame = {
    ...figure(),
    active: id(1),
    selectedLayerIds: [id(1)],
    layers: [layer(1, 'raster', { name: 'Figure' }), layer(2, 'raster', { name: 'Figure shade', clippingTo: id(1), locked: true }), layer(3, 'raster', { name: 'X' })],
  };
  const plan = planLayerArrange(frame, 'forward');
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'locked-selection');
});

test('clipping groups inside a folder move as a unit and keep the folder block intact', () => {
  const groups = [{ id: 'g', name: 'Folder', visible: true, locked: false, opacity: 1, blend: 'source-over' }];
  const frame = {
    w: 4,
    h: 4,
    groups,
    active: id(3),
    selectedLayerIds: [id(3)],
    layers: [
      layer(1, 'raster', { name: 'Base', groupId: 'g' }),
      layer(2, 'raster', { name: 'C1', clippingTo: id(1), groupId: 'g' }),
      layer(3, 'raster', { name: 'Outside' }),
    ],
  };
  // The outside layer passes the whole folder block (base and clipped layer).
  const result = arrange(frame, 'backward');
  assert.deepEqual(order(result.frame), ['Outside', 'Base', 'C1']);
  assert.deepEqual(result.released, []);
  // Selecting the folder member moves the folder as before.
  const folder = arrange({ ...frame, active: id(2), selectedLayerIds: [id(2)] }, 'forward');
  assert.deepEqual(order(folder.frame), ['Outside', 'Base', 'C1']);
  assert.deepEqual(folder.released, []);
});

test('stepLayerRuns never mutates its input and matches plain swaps without clipping', () => {
  const layers = [layer(1), layer(2), layer(3), layer(4)];
  const copy = [...layers];
  const down = stepLayerRuns(layers, new Set([id(3)]), -1, new Map());
  assert.deepEqual(down.map((item) => item.id), [id(1), id(3), id(2), id(4)]);
  const up = stepLayerRuns(layers, new Set([id(1), id(3)]), 1, new Map());
  assert.deepEqual(up.map((item) => item.id), [id(2), id(1), id(4), id(3)]);
  assert.deepEqual(layers, copy);
});

test('clippingGroupKeys and expandClippingGroupSelection describe whole groups', () => {
  const frame = figure();
  const keys = clippingGroupKeys(frame);
  assert.equal(keys.get(id(1)), id(1));
  assert.equal(keys.get(id(2)), id(1));
  assert.equal(keys.has(id(3)), false);
  assert.deepEqual([...expandClippingGroupSelection(frame, [id(1)])].sort(), [id(1), id(2)]);
  assert.deepEqual([...expandClippingGroupSelection(frame, [id(2)])], [id(2)], 'a clipped layer alone is not expanded');
  assert.deepEqual([...expandClippingGroupSelection(frame, [id(3)])], [id(3)]);
});

// --- Merge / Nest: replacement layers keep clipping groups ---

test('merging a base with its first clipped layer keeps the remaining clipped layers on the merged base', () => {
  const frame = {
    w: 4,
    h: 4,
    active: id(2),
    layers: [
      layer(1, 'raster', { name: 'Base' }),
      layer(2, 'raster', { name: 'C1', clippingTo: id(1) }),
      layer(3, 'raster', { name: 'C2', clippingTo: id(2) }),
    ],
  };
  const merged = layer(7, 'raster', { name: 'Merged' });
  const after = { ...frame, layers: [merged, frame.layers[2]] };
  const next = preserveClippingAfterReplace(frame, [id(1), id(2)], after, id(7));
  assert.equal(next.layers[1].clippingTo, id(7));
  assert.equal(next.layers[0].clippingTo, undefined);
  assert.equal(sanitizeClippingRelations(next), next);
});

test('merging clipped layers inside one group keeps the merged layer clipped', () => {
  const frame = {
    w: 4,
    h: 4,
    active: id(3),
    layers: [
      layer(1, 'raster', { name: 'Base' }),
      layer(2, 'raster', { name: 'C1', clippingTo: id(1) }),
      layer(3, 'raster', { name: 'C2', clippingTo: id(2) }),
      layer(4, 'raster', { name: 'C3', clippingTo: id(3) }),
    ],
  };
  const merged = layer(7, 'raster', { name: 'Merged' });
  const after = { ...frame, layers: [frame.layers[0], merged, frame.layers[3]] };
  const next = preserveClippingAfterReplace(frame, [id(2), id(3)], after, id(7));
  assert.deepEqual(next.layers.map((item) => item.clippingTo), [undefined, id(1), id(7)]);
  assert.equal(clippingGroupBase(next, next.layers[2]).id, id(1));
  assert.equal(frame.layers[1].clippingTo, id(1), 'input untouched');
});

test('a merge that does not touch clipped layers returns the frame unchanged', () => {
  const frame = figure();
  const after = { ...frame, layers: [...frame.layers.slice(0, 2), layer(7)] };
  assert.equal(preserveClippingAfterReplace(frame, [id(3)], after, id(7)), after);
});

test('a merge mixing a clipped layer and an unclipped layer above does not clip the result', () => {
  const frame = figure();
  const merged = layer(7, 'raster', { name: 'Merged' });
  const after = { ...frame, layers: [frame.layers[0], merged] };
  const next = preserveClippingAfterReplace(frame, [id(2), id(3)], after, id(7));
  assert.equal(next.layers[1].clippingTo, undefined);
});
