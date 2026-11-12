import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSIST_DESKTOP_BYTES,
  PERSIST_LOW_MEMORY_BYTES,
  PERSIST_MIN_COMPUTE_MS,
  PERSIST_MIN_PIXELS,
  PERSIST_MOBILE_BYTES,
  PersistentLayerCache,
  persistedEvictions,
  persistentKeyId,
  persistentLayerCacheBudget,
  shouldPersistSurface,
} from '../src/persistentLayerCache.ts';

test('the on-device budget follows the device class', () => {
  assert.equal(persistentLayerCacheBudget(), PERSIST_DESKTOP_BYTES);
  assert.equal(persistentLayerCacheBudget({ deviceMemory: 8 }), PERSIST_DESKTOP_BYTES);
  assert.equal(persistentLayerCacheBudget({ mobile: true }), PERSIST_MOBILE_BYTES);
  assert.equal(persistentLayerCacheBudget({ deviceMemory: 4 }), PERSIST_MOBILE_BYTES);
  assert.equal(persistentLayerCacheBudget({ deviceMemory: 2 }), PERSIST_LOW_MEMORY_BYTES, 'low-memory devices keep nothing');
});

test('only large, slow-to-compute surfaces are persisted', () => {
  assert.equal(shouldPersistSurface(2646, 4096, 1400, PERSIST_DESKTOP_BYTES), true);
  assert.equal(shouldPersistSurface(2646, 4096, 200, PERSIST_DESKTOP_BYTES), false, 'faster than a decode of that size');
  assert.equal(shouldPersistSurface(2000, 1500, 70, PERSIST_DESKTOP_BYTES), true, 'the bar scales with size');
  assert.equal(shouldPersistSurface(2000, 1500, PERSIST_MIN_COMPUTE_MS - 1, PERSIST_DESKTOP_BYTES), false);
  assert.equal(shouldPersistSurface(800, 600, 5000, PERSIST_DESKTOP_BYTES), false, 'small layers recompute');
  assert.equal(shouldPersistSurface(PERSIST_MIN_PIXELS, 1, PERSIST_MIN_COMPUTE_MS, PERSIST_DESKTOP_BYTES), true);
  assert.equal(shouldPersistSurface(PERSIST_MIN_PIXELS, 1, PERSIST_MIN_COMPUTE_MS - 1, PERSIST_DESKTOP_BYTES), false);
  assert.equal(shouldPersistSurface(2646, 4096, 5000, 0), false, 'store off');
  assert.equal(shouldPersistSurface(20000, 20000, 5000, PERSIST_MOBILE_BYTES), false, 'never larger than the whole budget');
  assert.equal(shouldPersistSurface(Number.NaN, 4096, 5000, PERSIST_DESKTOP_BYTES), false);
});

test('eviction drops the least recently used entries until the new one fits', () => {
  const entries = [
    { id: 'old', bytes: 40, used: 1, w: 1, h: 1 },
    { id: 'recent', bytes: 40, used: 30, w: 1, h: 1 },
    { id: 'middle', bytes: 40, used: 10, w: 1, h: 1 },
  ];
  assert.deepEqual(persistedEvictions(entries, 10, 200), [], 'room left');
  assert.deepEqual(persistedEvictions(entries, 50, 150), ['old']);
  assert.deepEqual(persistedEvictions(entries, 100, 150), ['old', 'middle']);
  assert.deepEqual(persistedEvictions(entries, 200, 150), ['old', 'middle', 'recent'], 'everything goes before failing');
});

test('content keys hash to stable fixed-length ids', async () => {
  const a = await persistentKeyId('{"v":1,"filter":{"type":"clouds"}}');
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(await persistentKeyId('{"v":1,"filter":{"type":"clouds"}}'), a);
  assert.notEqual(await persistentKeyId('{"v":1,"filter":{"type":"lens-flare"}}'), a);
});

test('without IndexedDB the store is a silent miss and never throws', async () => {
  const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, () => { throw new Error('no canvas'); });
  assert.equal(await store.get('key'), undefined);
  store.put('key', {}, 1000, 1000);
  await store.flush();
  assert.equal(store.writes, 0);
  const off = new PersistentLayerCache(0, () => { throw new Error('no canvas'); });
  assert.equal(await off.get('key'), undefined);
});
