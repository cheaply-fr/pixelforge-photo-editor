import test from 'node:test';
import assert from 'node:assert/strict';
import { ByteLruCache, layerFilterCacheKey } from '../src/layerFilterCache.ts';
import { compositeCheckpoint, compositeLayerKeys, sharedPrefix } from '../src/compositeCache.ts';
import { neutral } from '../src/document.ts';

test('a render pass keeps a stable set of layers cached when they do not all fit', () => {
  // Eight 10-byte layers, a 50-byte budget, every render reads them in order.
  const cache = new ByteLruCache(50);
  const layers = Array.from({ length: 8 }, (_, index) => `layer-${index}`);
  const render = () => {
    cache.beginPass();
    let hits = 0;
    for (const key of layers) {
      if (cache.get(key) !== undefined) hits += 1;
      else cache.set(key, key, 10);
    }
    return hits;
  };
  assert.equal(render(), 0, 'cold');
  // Plain LRU would evict exactly the layers the next pass reads first and
  // never hit; with pass protection five layers stay resident.
  for (let pass = 0; pass < 4; pass += 1) assert.equal(render(), 5, `pass ${pass}`);
  assert.equal(cache.bytes, 50);
  assert.ok(cache.stats().rejected > 0);
});

test('outside a pass the cache is plain LRU and new passes may evict older passes', () => {
  const cache = new ByteLruCache(20);
  cache.set('a', 'A', 10);
  cache.set('b', 'B', 10);
  cache.set('c', 'C', 10);
  assert.equal(cache.has('a'), false, 'no pass: oldest evicted');
  cache.beginPass();
  cache.get('b');
  assert.equal(cache.set('d', 'D', 10), true, 'c (older pass) is evictable');
  assert.equal(cache.has('c'), false);
  assert.equal(cache.set('e', 'E', 10), false, 'b and d belong to this pass');
  cache.beginPass();
  assert.equal(cache.set('e', 'E', 10), true, 'a new pass may replace them');
});

test('styled layers get a cache key without a filter stage when asked', () => {
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const assets = { a: { url, w: 1, h: 1 } };
  const layer = { kind: 'raster', asset: 'a', adjustments: structuredClone(neutral) };
  assert.equal(layerFilterCacheKey(layer, assets), undefined);
  assert.equal(typeof layerFilterCacheKey(layer, assets, { always: true }), 'string');
});

test('editing a layer inside a folder snapshots the composite below the folder', () => {
  const layer = (n, groupId) => ({ id: `l${n}`, name: `L${n}`, kind: 'raster', asset: 'a', opacity: 1, ...(groupId ? { groupId } : {}) });
  const layers = [layer(0), layer(1), layer(2), layer(3, 'g'), layer(4, 'g'), layer(5, 'g'), layer(6), layer(7), layer(8)];
  const frame = { w: 10, h: 10, layers, groups: [{ id: 'g', visible: true, opacity: 1 }], active: 'l5' };
  // The folder is drawn at layer 3, so the reusable prefix ends at layer 2.
  assert.equal(compositeCheckpoint(frame), 2);
  assert.equal(compositeCheckpoint({ ...frame, active: 'l7' }), 6);
  // The prefix up to the checkpoint is unchanged by an edit to the member.
  const url = 'data:image/png;base64,AAAA';
  const assets = { a: { url, w: 10, h: 10 } };
  const before = compositeLayerKeys(frame, assets);
  const edited = { ...frame, layers: layers.map((item) => (item.id === 'l5' ? { ...item, opacity: 0.5 } : item)) };
  assert.ok(sharedPrefix(before, compositeLayerKeys(edited, assets)) >= compositeCheckpoint(frame) + 1);
  // A stroke override on a member also checkpoints below the folder.
  assert.equal(compositeCheckpoint({ ...frame, active: 'l8' }, { l4: {} }), 2);
});
