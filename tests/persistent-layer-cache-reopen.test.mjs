// Reopen path of the on-device layer store (src/persistentLayerCache.ts):
// read-ahead, write results, diagnostics counters, and recovery from a failed
// or closed IndexedDB connection, against a small in-memory IndexedDB double.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSIST_DESKTOP_BYTES,
  PERSIST_MIN_COMPUTE_MS,
  PERSIST_MOBILE_BYTES,
  PERSIST_PREFETCH_DESKTOP,
  PERSIST_PREFETCH_MOBILE,
  PersistentLayerCache,
  persistentLayerCacheDelta,
  persistentPrefetchLimit,
  shouldPersistPlaced,
  validPersistentLayerCacheStats,
} from '../src/persistentLayerCache.ts';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal IndexedDB: one database, `blobs` (out-of-line keys) and `meta` (keyPath id). */
function fakeIndexedDB({ failOpens = 0 } = {}) {
  const stores = { blobs: new Map(), meta: new Map() };
  let created = false;
  let opens = 0;
  const connections = [];
  const request = (produce) => {
    const value = { result: undefined, onsuccess: null, onerror: null };
    setTimeout(() => {
      value.result = produce();
      value.onsuccess?.({ target: value });
    });
    return value;
  };
  const connection = () => {
    const database = {
      closed: false,
      version: 1,
      onversionchange: null,
      onclose: null,
      objectStoreNames: { contains: (name) => created && name in stores },
      createObjectStore() {
        created = true;
      },
      close() {
        database.closed = true;
      },
      transaction(names, mode = 'readonly') {
        if (database.closed) throw new DOMException('The database connection is closing.', 'InvalidStateError');
        const transaction = { mode, oncomplete: null, onerror: null, onabort: null };
        transaction.objectStore = (name) => {
          const store = stores[name];
          return {
            get: (id) => request(() => store.get(id)),
            getAll: () => request(() => [...store.values()]),
            put: (value, key) => request(() => void store.set(key ?? value.id, value)),
            delete: (id) => request(() => void store.delete(id)),
          };
        };
        setTimeout(() => transaction.oncomplete?.(), 5);
        return transaction;
      },
    };
    connections.push(database);
    return database;
  };
  return {
    stores,
    connections,
    get opens() {
      return opens;
    },
    open() {
      opens += 1;
      const opening = { result: undefined, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setTimeout(() => {
        if (failOpens > 0) {
          failOpens -= 1;
          opening.onerror?.();
          return;
        }
        opening.result = connection();
        if (!created) opening.onupgradeneeded?.();
        opening.onsuccess?.();
      });
      return opening;
    },
  };
}

/** A fake surface whose "PNG" records its size and a pixel label. */
const source = (w, h, label) => ({
  width: w,
  height: h,
  label,
  toBlob: (done) => done(new Blob([JSON.stringify({ w, h, label })], { type: 'image/png' })),
});
const createSurface = (w, h) => {
  const target = { width: w, height: h, label: undefined };
  target.getContext = () => ({ drawImage: (bitmap) => (target.label = bitmap.label) });
  return target;
};

async function withFakes(options, run) {
  const saved = { indexedDB: globalThis.indexedDB, createImageBitmap: globalThis.createImageBitmap };
  const database = fakeIndexedDB(options);
  globalThis.indexedDB = database;
  globalThis.createImageBitmap = async (blob) => {
    const { w, h, label } = JSON.parse(await blob.text());
    return { width: w, height: h, label, close() {} };
  };
  try {
    await run(database);
  } finally {
    if (saved.indexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = saved.indexedDB;
    if (saved.createImageBitmap === undefined) delete globalThis.createImageBitmap;
    else globalThis.createImageBitmap = saved.createImageBitmap;
  }
}

test('stored surfaces read back with their pixels, and counters say what happened', async () => {
  await withFakes({}, async () => {
    const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, createSurface);
    assert.equal(await store.put('clouds', source(2646, 4096, 'clouds'), 2646, 4096), true);
    const read = await store.get('clouds');
    assert.equal(read.label, 'clouds');
    assert.equal(read.width, 2646);
    assert.equal(await store.get('emboss'), undefined);
    const stats = store.stats();
    assert.deepEqual(
      { hits: stats.hits, misses: stats.misses, queued: stats.queued, writes: stats.writes, failed: stats.failed },
      { hits: 1, misses: 1, queued: 1, writes: 1, failed: 0 },
    );
    assert.ok(validPersistentLayerCacheStats(stats));
  });
});

test('a second write of the same key while one is in flight reports false', async () => {
  await withFakes({}, async () => {
    const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, createSurface);
    const first = store.put('preview', source(10, 10, 'a'), 10, 10, 'key-a');
    const second = store.put('preview', source(10, 10, 'b'), 10, 10, 'key-b');
    assert.deepEqual(await Promise.all([first, second]), [true, false]);
    assert.equal((await store.getTagged('preview', 'key-a'))?.surface.label, 'a');
    assert.equal(await store.getTagged('preview', 'key-b'), undefined, 'another tag is a miss');
  });
});

test('read-ahead overlaps reads, is taken over once, and is bounded', async () => {
  await withFakes({}, async (database) => {
    const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, createSurface, 2);
    for (const key of ['a', 'b', 'c']) await store.put(key, source(4, 4, key), 4, 4);
    assert.equal(store.prefetch('a'), true);
    assert.equal(store.prefetch('a'), false, 'already reading');
    assert.equal(store.prefetch('b'), true);
    assert.equal(store.prefetch('c'), false, 'limit reached');
    assert.equal(store.prefetching, 2);
    const reads = database.opens;
    assert.equal((await store.get('a')).label, 'a', 'taken over');
    assert.equal(store.prefetching, 1);
    assert.equal((await store.get('b')).label, 'b');
    assert.equal(database.opens, reads, 'one connection serves every read');
    assert.equal(store.stats().prefetches, 2);
    assert.equal(store.stats().hits, 2, 'a prefetched read counts once');
    // Prefetched reads nobody uses are dropped (a cancelled render).
    store.prefetch('c');
    store.releasePrefetched();
    assert.equal(store.prefetching, 0);
    // A prefetched miss stays a miss.
    store.prefetch('missing');
    assert.equal(await store.get('missing'), undefined);
    // A prefetched entry under another tag is not returned for a tagged read.
    await store.put('slot', source(4, 4, 'x'), 4, 4, 'one');
    store.prefetch('slot');
    assert.equal(await store.getTagged('slot', 'two'), undefined);
  });
});

test('a failed open is retried later instead of disabling the store for the session', async () => {
  await withFakes({ failOpens: 1 }, async () => {
    const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, createSurface);
    assert.equal(await store.get('a'), undefined, 'first open fails: a miss');
    assert.equal(await store.put('a', source(4, 4, 'a'), 4, 4), true, 'the next call opens again');
    assert.equal((await store.get('a')).label, 'a');
  });
});

test('a connection closed by another context is reopened on next use', async () => {
  await withFakes({}, async (database) => {
    const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, createSurface);
    assert.equal(await store.put('a', source(4, 4, 'a'), 4, 4), true);
    const [first] = database.connections;
    first.onversionchange();
    assert.equal(first.closed, true);
    assert.equal((await store.get('a'))?.label, 'a', 'read through a new connection');
    assert.equal(database.connections.length, 2);
    database.connections[1].close();
    database.connections[1].onclose();
    assert.equal(await store.put('b', source(4, 4, 'b'), 4, 4), true);
  });
});

test('recency updates are batched after reads go quiet', async () => {
  await withFakes({}, async (database) => {
    const store = new PersistentLayerCache(PERSIST_DESKTOP_BYTES, createSurface);
    await store.put('a', source(4, 4, 'a'), 4, 4);
    const before = [...database.stores.meta.values()][0].used;
    await tick(5);
    await store.get('a');
    await store.get('a');
    assert.equal([...database.stores.meta.values()][0].used, before, 'not written per hit');
    await tick(1100);
    assert.ok([...database.stores.meta.values()][0].used > before);
  });
});

test('frame-space results persist when slow, even when small or empty', () => {
  assert.equal(shouldPersistPlaced(1, 1, PERSIST_MIN_COMPUTE_MS, PERSIST_DESKTOP_BYTES), true, 'empty placeholder');
  assert.equal(shouldPersistPlaced(400, 300, 900, PERSIST_DESKTOP_BYTES), true, 'a small crop of full-frame work');
  assert.equal(shouldPersistPlaced(400, 300, PERSIST_MIN_COMPUTE_MS - 1, PERSIST_DESKTOP_BYTES), false);
  assert.equal(shouldPersistPlaced(2646, 4096, 150, PERSIST_DESKTOP_BYTES), false, 'faster than decoding the crop');
  assert.equal(shouldPersistPlaced(2646, 4096, 900, 0), false, 'store off');
});

test('read-ahead depth follows the device budget', () => {
  assert.equal(persistentPrefetchLimit(PERSIST_DESKTOP_BYTES), PERSIST_PREFETCH_DESKTOP);
  assert.equal(persistentPrefetchLimit(PERSIST_MOBILE_BYTES), PERSIST_PREFETCH_MOBILE);
  assert.equal(persistentPrefetchLimit(0), 0);
  assert.equal(new PersistentLayerCache(PERSIST_MOBILE_BYTES, createSurface).prefetchLimit, PERSIST_PREFETCH_MOBILE);
});

test('per-render counters are deltas and validate', () => {
  const before = { hits: 2, misses: 5, queued: 3, writes: 1, failed: 0, skipped: 1, readMs: 100, prefetches: 2, budget: 10 };
  const after = { hits: 9, misses: 5, queued: 3, writes: 3, failed: 1, skipped: 1, readMs: 250, prefetches: 8, budget: 10 };
  assert.deepEqual(persistentLayerCacheDelta(before, after), {
    hits: 7, misses: 0, queued: 0, writes: 2, failed: 1, skipped: 0, readMs: 150, prefetches: 6, budget: 10,
  });
  assert.equal(validPersistentLayerCacheStats(after), true);
  assert.equal(validPersistentLayerCacheStats({ ...after, hits: -1 }), false);
  assert.equal(validPersistentLayerCacheStats({ ...after, readMs: 1.5 }), false);
  assert.equal(validPersistentLayerCacheStats(null), false);
});
