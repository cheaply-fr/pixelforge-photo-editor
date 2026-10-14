import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLinkLayers, applyUnlinkLayers, linkLayersReason, planLinkLayers, planUnlinkLayers } from '../src/layerLinks.ts';

const layer = (id, patch = {}) => ({ id, name: id, kind: 'raster', asset: `asset-${id}`, visible: true, locked: false, opacity: 1, blend: 'source-over', matrix: [1, 0, 0, 1, 0, 0], adjustments: {}, ...patch });
const frame = (patch = {}) => ({ w: 10, h: 10, layers: [layer('a'), layer('b'), layer('c')], active: 'a', selectedLayerIds: ['a', 'b'], ...patch });
const linkId = '12345678-1234-4234-8234-123456789abc';

test('links the selected ordinary layers immutably', () => {
  const source = frame();
  const plan = planLinkLayers(source, linkId);
  assert.deepEqual(plan, { ok: true, layerIds: ['a', 'b'], linkId });
  const linked = applyLinkLayers(source, plan);
  assert.equal(linked.layers[0].layerLinkId, linkId);
  assert.equal(linked.layers[1].layerLinkId, linkId);
  assert.equal(linked.layers[2].layerLinkId, undefined);
  assert.equal(source.layers[0].layerLinkId, undefined);
});

test('unlink clears only selected links and is safe for stale or locked selections', () => {
  const linked = applyLinkLayers(frame(), linkId);
  const partial = applyUnlinkLayers({ ...linked, selectedLayerIds: ['a'] });
  assert.equal(partial.layers[0].layerLinkId, undefined);
  assert.equal(partial.layers[1].layerLinkId, linkId);
  assert.deepEqual(planUnlinkLayers(frame({ selectedLayerIds: ['c'] })), { ok: false, reason: 'no-linked-selection', layerIds: ['c'] });
  assert.equal(planLinkLayers(frame({ layers: frame().layers.map((item) => item.id === 'b' ? { ...item, locked: true } : item) }), linkId).reason, 'locked-selection');
  assert.equal(linkLayersReason('insufficient-selection'), 'Select at least two layers to link');
});

test('guards invalid link identities and malformed selections', () => {
  assert.throws(() => planLinkLayers(frame(), 'bad'), /identity/);
  assert.deepEqual(planLinkLayers(frame({ selectedLayerIds: [] }), linkId), { ok: false, reason: 'no-selection', layerIds: [] });
  assert.deepEqual(planLinkLayers(frame({ selectedLayerIds: ['missing'] }), linkId), { ok: false, reason: 'missing-selection-layer', layerIds: ['missing'] });
});
