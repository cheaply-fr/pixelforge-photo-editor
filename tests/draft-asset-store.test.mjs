import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_DRAFT_VERSION,
  LOCAL_CONFLICT,
  LOCAL_STORAGE_FULL,
  discardDraft,
  estimatedPendingDraftBytes,
  lastDraftSaveStats,
  readDraft,
  saveDraft,
  setDraftDatabaseForTesting,
  validateDraft,
} from '../src/drafts.ts';
import {
  DRAFT_MANIFEST_FORMAT,
  DRAFT_MANIFEST_KIND,
  createDraftManifest,
  decodeDraftManifest,
  draftAssetKey,
  draftAssetKeyBounds,
  hashDraftAsset,
  isDraftManifest,
  planDraftAssetWrites,
} from '../src/draftAssetStore.ts';
import { createDraftBundle } from '../src/draftBundle.ts';
import { neutral } from '../src/document.ts';

/* ------------------------------------------------------------------------ */
/* Minimal in-memory IndexedDB double: ordered async requests, buffered     */
/* writes that only become visible on commit, abort on any request failure. */
/* ------------------------------------------------------------------------ */

globalThis.IDBKeyRange ??= {
  bound: (lower, upper) => ({ lower, upper, includes: (key) => key >= lower && key <= upper }),
};

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const inRange = (range, key) =>
  range && typeof range === 'object' && 'lower' in range
    ? typeof key === 'string' && key >= range.lower && key <= range.upper
    : key === range;

class MemoryDatabase {
  constructor() {
    this.stores = { drafts: new Map(), draftBlobs: new Map() };
    /** Committed operations, in order: [op, store, key]. */
    this.log = [];
    /** Optional fault injector: (op, store, key, value) => Error | undefined. */
    this.fault = undefined;
  }
  transaction(_names, mode = 'readonly') {
    return new MemoryTransaction(this, mode);
  }
  committed(op, store) {
    return this.log.filter(([o, s]) => o === op && s === store);
  }
  assetKeys(draftId) {
    const [lower, upper] = draftAssetKeyBounds(draftId);
    return [...this.stores.draftBlobs.keys()].filter((key) => key >= lower && key <= upper).sort(byKey);
  }
}

class MemoryTransaction {
  constructor(db, mode) {
    this.db = db;
    this.mode = mode;
    this.staged = {
      drafts: new Map(db.stores.drafts),
      draftBlobs: new Map(db.stores.draftBlobs),
    };
    this.ops = [];
    this.queue = [];
    this.state = 'active';
    this.error = null;
    this.oncomplete = null;
    this.onabort = null;
    this.onerror = null;
    setImmediate(() => this.pump());
  }
  objectStore(name) {
    const tx = this;
    return {
      get: (key) => tx.request(() => structuredClone(tx.staged[name].get(key))),
      getAllKeys: (range) =>
        tx.request(() => [...tx.staged[name].keys()].filter((key) => inRange(range, key)).sort(byKey)),
      put(value, key) {
        if (tx.mode !== 'readwrite') throw new Error('ReadOnlyError');
        const copy = structuredClone(value);
        return tx.request(() => {
          const fault = tx.db.fault?.('put', name, key, copy);
          if (fault) throw fault;
          tx.staged[name].set(key, copy);
          tx.ops.push(['put', name, key]);
          return key;
        });
      },
      delete(key) {
        if (tx.mode !== 'readwrite') throw new Error('ReadOnlyError');
        return tx.request(() => {
          for (const existing of tx.staged[name].keys())
            if (inRange(key, existing)) {
              tx.staged[name].delete(existing);
              tx.ops.push(['delete', name, existing]);
            }
          return undefined;
        });
      },
    };
  }
  request(run) {
    if (this.state !== 'active') throw new Error('TransactionInactiveError');
    const request = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.queue.push([request, run]);
    return request;
  }
  abort() {
    if (this.state !== 'active') return;
    this.state = 'aborted';
    setImmediate(() => this.onabort?.({ target: this }));
  }
  pump() {
    while (this.state === 'active' && this.queue.length) {
      const [request, run] = this.queue.shift();
      try {
        request.result = run();
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
        this.onerror?.({ target: request });
        this.error = error;
        this.abort();
        return;
      }
      try {
        request.onsuccess?.({ target: request });
      } catch (error) {
        this.error = error;
        this.abort();
        return;
      }
    }
    if (this.state !== 'active') return;
    this.state = 'committed';
    this.db.stores = this.staged;
    this.db.log.push(...this.ops);
    setImmediate(() => this.oncomplete?.({ target: this }));
  }
}

/* ------------------------------------------------------------------------ */
/* Fixtures                                                                 */
/* ------------------------------------------------------------------------ */

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII';
/** Distinct, header-valid 1×1 PNG data URLs (payload bytes differ). */
const asset = (seed, padding = 0) => ({
  url: `data:image/png;base64,${png}${'A'.repeat(padding)}${seed.toString(36).replace(/[^A-Za-z0-9]/g, 'A')}AAA=`,
  w: 1,
  h: 1,
});
const ids = Array.from({ length: 30 }, (_, index) =>
  `${(index + 16).toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`,
);
const layerId = '22222222-2222-4222-8222-222222222222';
const draftA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const draftB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const settings = {
  tool: 'brush',
  zoom: 72,
  color: '#000000',
  size: 18,
  text: '',
  fontSize: 56,
  ...neutral,
};
const frame = (assetId) => ({
  w: 1,
  h: 1,
  active: layerId,
  layers: [
    {
      id: layerId,
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 1,
      blend: 'source-over',
      matrix: [1, 0, 0, 1, 0, 0],
      adjustments: { ...neutral },
      kind: 'raster',
      asset: assetId,
    },
  ],
});
/** A history of `steps` frames, step i referencing its own asset. */
const draftWithSteps = (steps, { name = 'Poster', padding = 0, seedOffset = 0 } = {}) => {
  const assets = {};
  const history = [];
  for (let step = 0; step < steps; step += 1) {
    assets[ids[step]] = asset(step + seedOffset, padding);
    history.push(frame(ids[step]));
  }
  return {
    version: CURRENT_DRAFT_VERSION,
    name,
    index: steps - 1,
    settings,
    assets,
    history,
  };
};
const normalized = (value, revision) => validateDraft({ ...value, localRevision: revision });

let db;
beforeEach(() => {
  db = new MemoryDatabase();
  setDraftDatabaseForTesting(db);
});

/* ------------------------------------------------------------------------ */
/* Storage behaviour                                                        */
/* ------------------------------------------------------------------------ */

test('a saved draft round-trips through a small manifest and content-addressed assets', async () => {
  const input = draftWithSteps(3, { padding: 200_000 });
  assert.equal(await saveDraft(draftA, input, 0), 1);
  const pointer = db.stores.drafts.get(draftA);
  assert.equal(pointer.kind, DRAFT_MANIFEST_KIND);
  assert.equal(pointer.format, DRAFT_MANIFEST_FORMAT);
  assert.equal(pointer.localRevision, 1);
  assert.equal(pointer.name, 'Poster');
  assert.ok(isDraftManifest(pointer));
  // The pointer carries no pixel data, only hashes.
  assert.ok(!JSON.stringify(pointer).includes('data:image'));
  assert.ok(JSON.stringify(pointer).length < 8 * 1024);
  assert.equal(db.assetKeys(draftA).length, 3);
  for (const [id, value] of Object.entries(input.assets))
    assert.ok(db.stores.draftBlobs.has(draftAssetKey(draftA, await hashDraftAsset(value.url))), id);
  // A fresh tab (empty verification cache) reads it back exactly.
  setDraftDatabaseForTesting(db);
  assert.deepEqual(await readDraft(draftA), normalized(input, 1));
});

test('a subsequent save writes only the new asset and hashes only new content', async () => {
  await saveDraft(draftA, draftWithSteps(5), 0);
  assert.equal(db.committed('put', 'draftBlobs').length, 5);
  assert.equal(lastDraftSaveStats().hashedAssets, 5);
  const before = db.log.length;
  // One more brush stroke: history grows by a frame with one new asset.
  await saveDraft(draftA, draftWithSteps(6), 1);
  const writes = db.log.slice(before);
  assert.deepEqual(
    writes.filter(([op, store]) => op === 'put' && store === 'draftBlobs').length,
    1,
  );
  assert.deepEqual(
    writes.filter(([, store]) => store === 'drafts').map(([op]) => op),
    ['put'],
  );
  const stats = lastDraftSaveStats();
  assert.equal(stats.assetWrites, 1);
  assert.equal(stats.hashedAssets, 1);
  assert.equal(stats.assetDeletes, 0);
  assert.equal(stats.assets, 6);
  // A settings-only change rewrites the manifest and nothing else.
  const after = db.log.length;
  await saveDraft(draftA, { ...draftWithSteps(6), name: 'Renamed' }, 2);
  assert.deepEqual(db.log.slice(after), [['put', 'drafts', draftA]]);
  assert.equal((await readDraft(draftA)).name, 'Renamed');
});

test('unreferenced assets are collected while referenced and other drafts’ assets survive', async () => {
  await saveDraft(draftA, draftWithSteps(4), 0);
  // Draft B shares identical content; its records are namespaced separately.
  await saveDraft(draftB, draftWithSteps(4), 0);
  const bKeys = db.assetKeys(draftB);
  // History trimmed to the last two steps: steps 0 and 1 are unreferenced.
  const trimmed = draftWithSteps(4);
  trimmed.history = trimmed.history.slice(2);
  trimmed.index = 1;
  await saveDraft(draftA, trimmed, 1);
  assert.equal(lastDraftSaveStats().assetDeletes, 2);
  assert.equal(db.assetKeys(draftA).length, 2);
  const expected = await Promise.all([2, 3].map((step) => hashDraftAsset(asset(step).url)));
  assert.deepEqual(
    db.assetKeys(draftA),
    expected.map((hash) => draftAssetKey(draftA, hash)).sort(),
  );
  assert.deepEqual(db.assetKeys(draftB), bKeys);
  assert.deepEqual(await readDraft(draftA), normalized(trimmed, 2));
  assert.equal(Object.keys((await readDraft(draftB)).assets).length, 4);
});

test('a revision conflict is still detected and leaves storage untouched', async () => {
  await saveDraft(draftA, draftWithSteps(2), 0);
  await saveDraft(draftA, draftWithSteps(3), 1);
  const snapshot = new Map(db.stores.draftBlobs);
  await assert.rejects(() => saveDraft(draftA, draftWithSteps(4), 1), {
    message: LOCAL_CONFLICT,
  });
  assert.deepEqual(db.stores.draftBlobs, snapshot);
  assert.equal(db.stores.drafts.get(draftA).localRevision, 2);
  assert.equal((await readDraft(draftA)).history.length, 3);
});

test('a failure between asset writes and the manifest commit keeps the previous draft readable', async () => {
  await saveDraft(draftA, draftWithSteps(2), 0);
  const blobs = new Map(db.stores.draftBlobs);
  let assetPutsAttempted = 0;
  db.fault = (op, store) => {
    if (op === 'put' && store === 'draftBlobs') assetPutsAttempted += 1;
    if (op === 'put' && store === 'drafts') return new Error('Simulated crash before pointer commit');
  };
  await assert.rejects(() => saveDraft(draftA, draftWithSteps(4), 1), /Simulated crash/);
  assert.equal(assetPutsAttempted, 2);
  db.fault = undefined;
  // The new asset writes were rolled back with the transaction.
  assert.deepEqual(db.stores.draftBlobs, blobs);
  setDraftDatabaseForTesting(db);
  const recovered = await readDraft(draftA);
  assert.equal(recovered.localRevision, 1);
  assert.deepEqual(recovered, normalized(draftWithSteps(2), 1));
  // And the next save of the same revision succeeds normally.
  assert.equal(await saveDraft(draftA, draftWithSteps(4), 1), 2);
});

test('a quota failure reports a clear message and loses nothing', async () => {
  await saveDraft(draftA, draftWithSteps(2), 0);
  db.fault = (op, store) => {
    if (op === 'put' && store === 'draftBlobs') {
      const error = new Error('quota');
      error.name = 'QuotaExceededError';
      return error;
    }
  };
  await assert.rejects(() => saveDraft(draftA, draftWithSteps(3), 1), {
    message: LOCAL_STORAGE_FULL,
  });
  db.fault = undefined;
  assert.deepEqual(await readDraft(draftA), normalized(draftWithSteps(2), 1));
});

test('legacy v1 records and v2 chunk bundles still load and migrate on the next save', async () => {
  // v1: a complete Draft object stored directly in `drafts`.
  const legacy = { ...draftWithSteps(2, { name: 'Legacy record' }), localRevision: 7 };
  db.stores.drafts.set(draftA, structuredClone(legacy));
  assert.deepEqual(await readDraft(draftA), validateDraft(legacy));
  assert.equal(await saveDraft(draftA, draftWithSteps(2, { name: 'Legacy record' }), 7), 8);
  assert.equal(db.stores.drafts.get(draftA).kind, DRAFT_MANIFEST_KIND);
  assert.equal((await readDraft(draftA)).name, 'Legacy record');

  // v2: a checksummed chunk bundle in `draftBlobs`.
  const chunked = { ...draftWithSteps(3, { name: 'Chunked bundle', padding: 50_000 }), localRevision: 12 };
  const bundle = await createDraftBundle(draftB, 12, chunked, { chunkSize: 16 * 1024 });
  assert.ok(bundle.chunks.length > 4);
  db.stores.drafts.set(draftB, structuredClone(bundle.manifest));
  for (const chunk of bundle.chunks) db.stores.draftBlobs.set(chunk.id, structuredClone(chunk));
  const unrelatedChunk = '33333333-3333-4333-8333-333333333333:0';
  db.stores.draftBlobs.set(unrelatedChunk, { keep: true });
  setDraftDatabaseForTesting(db);
  const loaded = await readDraft(draftB);
  assert.deepEqual(loaded, validateDraft(chunked));
  assert.equal(await saveDraft(draftB, loaded, 12), 13);
  const pointer = db.stores.drafts.get(draftB);
  assert.equal(pointer.kind, DRAFT_MANIFEST_KIND);
  for (const chunk of bundle.chunks) assert.equal(db.stores.draftBlobs.has(chunk.id), false);
  assert.ok(db.stores.draftBlobs.has(unrelatedChunk));
  assert.deepEqual(await readDraft(draftB), normalized(chunked, 13));
});

test('corrupt, forged or missing asset records fail closed on read', async () => {
  await saveDraft(draftA, draftWithSteps(2), 0);
  const [firstKey] = db.assetKeys(draftA);
  const original = db.stores.draftBlobs.get(firstKey);

  const flipped = new Uint8Array(original.bytes.slice(0));
  flipped[flipped.length - 2] = 'B'.charCodeAt(0); // ...AAA= → ...AAB=
  db.stores.draftBlobs.set(firstKey, { ...original, bytes: flipped.buffer });
  setDraftDatabaseForTesting(db);
  await assert.rejects(() => readDraft(draftA), /checksum mismatch/);

  db.stores.draftBlobs.set(firstKey, { ...original, kind: 'something-else' });
  await assert.rejects(() => readDraft(draftA), /record is invalid/);

  db.stores.draftBlobs.delete(firstKey);
  await assert.rejects(() => readDraft(draftA), /missing/);

  // The next save of the in-memory document rewrites the lost record instead
  // of assuming it is still present.
  assert.equal(await saveDraft(draftA, draftWithSteps(2), 1), 2);
  assert.equal(lastDraftSaveStats().assetWrites, 1);
  assert.deepEqual(await readDraft(draftA), normalized(draftWithSteps(2), 2));
});

test('a reused asset ID with new pixels is stored under its new content hash', async () => {
  await saveDraft(draftA, draftWithSteps(1), 0);
  const changed = draftWithSteps(1, { seedOffset: 9 });
  assert.equal(Object.keys(changed.assets)[0], ids[0]);
  await saveDraft(draftA, changed, 1);
  assert.equal(lastDraftSaveStats().assetWrites, 1);
  assert.equal(lastDraftSaveStats().assetDeletes, 1);
  setDraftDatabaseForTesting(db);
  assert.equal((await readDraft(draftA)).assets[ids[0]].url, changed.assets[ids[0]].url);
});

test('discarding a draft removes its pointer and asset records only', async () => {
  await saveDraft(draftA, draftWithSteps(2), 0);
  await saveDraft(draftB, draftWithSteps(2), 0);
  await assert.rejects(() => discardDraft(draftA, 0), { message: LOCAL_CONFLICT });
  await discardDraft(draftA, 1);
  assert.equal(db.stores.drafts.has(draftA), false);
  assert.deepEqual(db.assetKeys(draftA), []);
  assert.equal(db.assetKeys(draftB).length, 2);
  assert.equal(await readDraft(draftA), undefined);
});

test('invalid drafts are rejected before anything is written', async () => {
  const broken = draftWithSteps(2);
  broken.assets[ids[1]] = { url: 'data:image/png;base64,AAAA', w: 1, h: 1 };
  await assert.rejects(() => saveDraft(draftA, broken, 0), /Invalid project assets/);
  assert.equal(db.log.length, 0);
  // A previously verified asset ID whose URL changes is validated again.
  await saveDraft(draftA, draftWithSteps(2), 0);
  const swapped = draftWithSteps(2);
  swapped.assets[ids[0]] = { ...swapped.assets[ids[0]], url: 'data:image/png;base64,AAAA' };
  await assert.rejects(() => saveDraft(draftA, swapped, 1), /Invalid project assets/);
});

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                             */
/* ------------------------------------------------------------------------ */

test('the write plan only touches this draft’s namespace and never deletes needed keys', () => {
  const needed = new Map([
    ['a'.repeat(64), 'data:a'],
    ['b'.repeat(64), 'data:b'],
  ]);
  const existing = [
    draftAssetKey(draftA, 'a'.repeat(64)),
    draftAssetKey(draftA, 'c'.repeat(64)),
    draftAssetKey(draftB, 'c'.repeat(64)),
    `${draftA}:0`,
    42,
  ];
  const plan = planDraftAssetWrites(draftA, needed, existing);
  assert.deepEqual(plan.puts.map(([key]) => key), [draftAssetKey(draftA, 'b'.repeat(64))]);
  assert.deepEqual(plan.deletes, [draftAssetKey(draftA, 'c'.repeat(64))]);
});

test('manifests reject forged references and decode only verified content', async () => {
  const draft = normalized(draftWithSteps(2), 3);
  const hashes = new Map(
    await Promise.all(Object.entries(draft.assets).map(async ([id, value]) => [id, await hashDraftAsset(value.url)])),
  );
  const manifest = createDraftManifest(draft, 3, hashes, '2026-11-07T00:00:00.000Z');
  assert.ok(isDraftManifest(manifest));
  assert.equal(isDraftManifest({ ...manifest, format: 2 }), false);
  assert.equal(isDraftManifest({ ...manifest, localRevision: -1 }), false);
  assert.equal(
    isDraftManifest({ ...manifest, assetRefs: { [ids[0]]: { hash: 'forged', w: 1, h: 1 } } }),
    false,
  );
  const records = new Map(
    [...hashes.values()].map((hash, index) => [
      hash,
      {
        kind: 'pixelforge-draft-asset',
        hash,
        bytes: new TextEncoder().encode(Object.values(draft.assets)[index].url).buffer,
      },
    ]),
  );
  assert.deepEqual(validateDraft(await decodeDraftManifest(manifest, records)), draft);
  assert.throws(() => createDraftManifest(draft, 3, new Map()), /not hashed/);
});

test('write-ahead size is estimated from referenced assets without serializing', () => {
  const small = draftWithSteps(2);
  assert.ok(estimatedPendingDraftBytes(small) < 1024);
  const large = draftWithSteps(2, { padding: 3 * 1024 * 1024 });
  assert.ok(estimatedPendingDraftBytes(large) > 4 * 1024 * 1024);
  // Unreferenced assets are not counted.
  large.history = [frame(ids[0])];
  large.index = 0;
  assert.ok(estimatedPendingDraftBytes(large) < 4 * 1024 * 1024);
});
