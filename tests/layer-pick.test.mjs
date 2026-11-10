import test from 'node:test';
import assert from 'node:assert/strict';
import { layerPickOrder, pickLayerAt, tileIndexAt } from '../src/layerPick.ts';

const layer = (id, extra = {}) => ({ id, kind: 'raster', visible: true, opacity: 1, ...extra });

test('candidates run top to bottom and skip layers that cannot show pixels', () => {
  const frame = {
    layers: [
      layer('bottom'),
      layer('hidden', { visible: false }),
      layer('clear', { opacity: 0 }),
      layer('curves', { kind: 'adjustment' }),
      layer('in-hidden-folder', { groupId: 'g1' }),
      layer('in-faded-folder', { groupId: 'g2' }),
      layer('in-folder', { groupId: 'g3' }),
      layer('text', { kind: 'text' }),
    ],
    groups: [
      { id: 'g1', visible: false, opacity: 1 },
      { id: 'g2', visible: true, opacity: 0 },
      { id: 'g3', visible: true, opacity: 1 },
    ],
  };
  assert.deepEqual(
    layerPickOrder(frame).map((item) => item.id),
    ['text', 'in-folder', 'bottom'],
  );
});

test('the topmost layer with a non-transparent pixel wins', async () => {
  const frame = { layers: [layer('a'), layer('b'), layer('c')] };
  const alpha = { a: 255, b: 12, c: 0 };
  const sampled = [];
  const id = await pickLayerAt(frame, async (item) => {
    sampled.push(item.id);
    return alpha[item.id];
  });
  assert.equal(id, 'b');
  assert.deepEqual(sampled, ['c', 'b'], 'stops at the first hit');
});

test('nothing is picked over fully transparent pixels', async () => {
  const frame = { layers: [layer('a'), layer('b')] };
  assert.equal(await pickLayerAt(frame, async () => 0), undefined);
});

test('a sampling failure counts as transparent instead of aborting the pick', async () => {
  const frame = { layers: [layer('a'), layer('b')] };
  const id = await pickLayerAt(frame, async (item) => {
    if (item.id === 'b') throw new Error('decode failed');
    return 200;
  });
  assert.equal(id, 'a');
});

test('a clipped layer is picked only where its base has visible pixels', async () => {
  const base = layer('base');
  const clipped = layer('clipped', { clippingTo: 'base' });
  const frame = { layers: [layer('under'), base, clipped] };
  const clipBase = (item) => (item.clippingTo === 'base' ? base : undefined);
  // Clipped pixels over transparent base pixels are invisible: fall through.
  assert.equal(
    await pickLayerAt(frame, async (item) => ({ under: 255, base: 0, clipped: 255 })[item.id], clipBase),
    'under',
  );
  assert.equal(
    await pickLayerAt(frame, async (item) => ({ under: 255, base: 90, clipped: 255 })[item.id], clipBase),
    'clipped',
  );
  // A hidden base hides the clipped layer too.
  const hiddenBase = { ...base, visible: false };
  assert.equal(
    await pickLayerAt(
      { layers: [layer('under'), hiddenBase, clipped] },
      async () => 255,
      () => hiddenBase,
    ),
    'under',
  );
});

test('each layer is sampled at most once per pick', async () => {
  const base = layer('base');
  const frame = { layers: [base, layer('c1', { clippingTo: 'base' }), layer('c2', { clippingTo: 'base' })] };
  const counts = {};
  await pickLayerAt(
    frame,
    async (item) => {
      counts[item.id] = (counts[item.id] ?? 0) + 1;
      return item.id === 'base' ? 0 : 255;
    },
    () => base,
  );
  assert.deepEqual(counts, { c2: 1, base: 1, c1: 1 });
});

test('the tile under a pixel follows the row-major 256 px grid', () => {
  const asset = { w: 600, h: 300 }; // 3 columns x 2 rows
  assert.equal(tileIndexAt(asset, 0, 0), 0);
  assert.equal(tileIndexAt(asset, 255.9, 10), 0);
  assert.equal(tileIndexAt(asset, 256, 10), 1);
  assert.equal(tileIndexAt(asset, 599, 0), 2);
  assert.equal(tileIndexAt(asset, 0, 256), 3);
  assert.equal(tileIndexAt(asset, 599, 299), 5);
  assert.equal(tileIndexAt(asset, 600, 0), -1);
  assert.equal(tileIndexAt(asset, -0.5, 0), -1);
  assert.equal(tileIndexAt(asset, 0, 300), -1);
});
