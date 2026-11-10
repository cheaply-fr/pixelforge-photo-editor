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
  stagePendingDraft,
  validateDraft,
} from '../src/drafts.ts';
import {
  DRAFT_MANIFEST_FORMAT,
  DRAFT_MANIFEST_KIND,
  DRAFT_TILED_MANIFEST_FORMAT,
  DRAFT_TILE_KIND,
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
import { clearTileIndexForTesting, knownTile, tileAssetFromBands, validTiledAsset } from '../src/tiledAssets.ts';
import { assetFingerprint } from '../src/layerFilterCache.ts';

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

/* ------------------------------------------------------------------------ */
/* Tiled assets (format 4, tiled-layer-assets-contract.md)                   */
/* ------------------------------------------------------------------------ */

/** Pixels of a 600x300 layer; strokes change tile 0 a little more. */
const tiledPixels = (() => {
  const data = new Uint8ClampedArray(600 * 300 * 4);
  let state = 99;
  for (let i = 0; i < data.length; i += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    data.set([state & 255, (state >>> 8) & 255, (state >>> 16) & 255, 255], i);
  }
  return data;
})();
let tileSerial = 0;
/** A tiled asset (fake PNG Blobs) after `strokes` edits confined to tile 0. */
function tiledVersion(strokes, base) {
  const data = tiledPixels.slice();
  for (let n = 1; n <= strokes; n += 1) data[(n * 600 + 5) * 4] ^= 0x3c;
  return tileAssetFromBands(
    600,
    300,
    (y, rows) => data.subarray(y * 2400, (y + rows) * 2400),
    () => {
      tileSerial += 1;
      return new Blob([new Uint8Array([137, 80, 78, 71, tileSerial & 255, tileSerial >> 8])], { type: 'image/png' });
    },
    base,
  ).asset;
}
/** History of `steps` strokes on one tiled layer, plus one legacy data-URL layer. */
function tiledDraft(steps) {
  const assets = {};
  const history = [];
  let previous;
  for (let step = 0; step < steps; step += 1) {
    previous = tiledVersion(step, previous);
    assets[ids[step]] = previous;
    const f = frame(ids[step]);
    history.push({
      ...f,
      w: 600,
      h: 300,
      layers: [...f.layers, { ...f.layers[0], id: ids[29], name: 'Legacy', asset: ids[28] }],
    });
  }
  assets[ids[28]] = asset(1234);
  return { version: CURRENT_DRAFT_VERSION, name: 'Tiled', index: steps - 1, settings, assets, history };
}

test('tiled drafts save as format 4 with one record per distinct tile and reload with shared tiles', async () => {
  clearTileIndexForTesting();
  const input = tiledDraft(3);
  await saveDraft(draftA, input, 0);
  const pointer = db.stores.drafts.get(draftA);
  assert.equal(pointer.format, DRAFT_TILED_MANIFEST_FORMAT);
  assert.ok(isDraftManifest(pointer));
  // 6 tiles, plus one new tile per later stroke, plus the legacy asset.
  assert.equal(Object.keys(pointer.tileRefs).length, 8);
  assert.equal(db.assetKeys(draftA).length, 9);
  const tileRecords = db
    .assetKeys(draftA)
    .map((key) => db.stores.draftBlobs.get(key))
    .filter((value) => value.kind === DRAFT_TILE_KIND);
  assert.equal(tileRecords.length, 8);
  assert.ok(tileRecords.every((record) => record.blob instanceof Blob));
  assert.ok(!JSON.stringify(pointer).includes('data:image'));

  clearTileIndexForTesting();
  setDraftDatabaseForTesting(db);
  const read = await readDraft(draftA);
  assert.equal(read.localRevision, 1);
  assert.deepEqual(read.history, normalized(input, 1).history);
  assert.deepEqual(read.assets[ids[28]], input.assets[ids[28]], 'legacy data URL asset is unchanged');
  for (const id of ids.slice(0, 3)) {
    assert.ok(validTiledAsset(read.assets[id]));
    assert.equal(assetFingerprint(read.assets[id]), assetFingerprint(input.assets[id]));
  }
  // Unchanged tiles are one object across all history steps after reload,
  assert.equal(read.assets[ids[0]].tiles[3], read.assets[ids[2]].tiles[3]);
  assert.notEqual(read.assets[ids[0]].tiles[0], read.assets[ids[2]].tiles[0]);
  // and register in the tab-wide index, so the next commit reuses them.
  assert.equal(knownTile(read.assets[ids[2]].tiles[5].key), read.assets[ids[2]].tiles[5]);
  for (const [index, tile] of read.assets[ids[2]].tiles.entries())
    assert.deepEqual(
      new Uint8Array(await tile.blob.arrayBuffer()),
      new Uint8Array(await input.assets[ids[2]].tiles[index].blob.arrayBuffer()),
    );
});

test('a stroke on a tiled layer writes only its new tile record', async () => {
  clearTileIndexForTesting();
  await saveDraft(draftA, tiledDraft(3), 0);
  const before = db.log.length;
  await saveDraft(draftA, tiledDraft(4), 1);
  const puts = db.log.slice(before).filter(([op, store]) => op === 'put' && store === 'draftBlobs');
  assert.equal(puts.length, 1, 'one new tile, nothing else rewritten');
  assert.equal(db.stores.draftBlobs.get(puts[0][2]).kind, DRAFT_TILE_KIND);
  assert.equal(lastDraftSaveStats().assetWrites, 1);
  assert.ok(lastDraftSaveStats().bytesWritten < 64);
  // Dropping old steps collects only the tiles no remaining step references.
  const latest = tiledDraft(4);
  const trimmed = { ...latest, history: latest.history.slice(2), index: 1 };
  await saveDraft(draftA, trimmed, 2);
  const pointer = db.stores.drafts.get(draftA);
  assert.equal(Object.keys(pointer.tileRefs).length, 7);
  assert.equal(db.assetKeys(draftA).length, 8);
  const read = await readDraft(draftA);
  assert.equal(read.history.length, 2);
});

test('format 4 manifests and tile records fail closed when forged or damaged', async () => {
  clearTileIndexForTesting();
  await saveDraft(draftA, tiledDraft(2), 0);
  const pointer = db.stores.drafts.get(draftA);
  const tileKey = Object.keys(pointer.tileRefs)[0];
  const refId = Object.keys(pointer.assetRefs).find((id) => pointer.assetRefs[id].tiles);
  const ref = pointer.assetRefs[refId];
  const withRef = (next) => ({ ...pointer, assetRefs: { ...pointer.assetRefs, [refId]: next } });
  // Structural forgeries.
  assert.equal(isDraftManifest({ ...pointer, format: 3 }), false, 'tiled refs need format 4');
  assert.equal(isDraftManifest({ ...pointer, tileRefs: undefined }), false);
  assert.equal(isDraftManifest({ ...pointer, tileRefs: { ...pointer.tileRefs, BAD: 'x' } }), false);
  assert.equal(isDraftManifest(withRef({ ...ref, tiles: ref.tiles.slice(1) })), false);
  assert.equal(
    isDraftManifest(withRef({ ...ref, tiles: ['f'.repeat(32), ...ref.tiles.slice(1)] })),
    false,
    'every tile key must be in tileRefs',
  );
  assert.equal(isDraftManifest(withRef({ ...ref, tileSize: 128 })), false);
  assert.equal(isDraftManifest(withRef({ ...ref, w: 0 })), false);
  // Damaged tile bytes fail the checksum; a missing or mistyped record fails the read.
  const records = new Map(
    db.assetKeys(draftA).map((key) => {
      const value = db.stores.draftBlobs.get(key);
      return [value.hash, value];
    }),
  );
  const target = pointer.tileRefs[tileKey];
  const damaged = new Map(records);
  damaged.set(target, { ...records.get(target), blob: new Blob([new Uint8Array([1, 2, 3])]) });
  await assert.rejects(decodeDraftManifest(pointer, damaged), /checksum/);
  const missing = new Map(records);
  missing.delete(target);
  await assert.rejects(decodeDraftManifest(pointer, missing), /missing/);
  const swapped = new Map(records);
  swapped.set(target, { kind: 'pixelforge-draft-asset', hash: target, bytes: new Uint8Array([1]).buffer });
  await assert.rejects(decodeDraftManifest(pointer, swapped), /invalid/);
  // The stored draft is still readable.
  assert.equal((await readDraft(draftA)).history.length, 2);
});

test('drafts without tiled assets keep format 3 for older builds, and legacy drafts move to tiles on save', async () => {
  clearTileIndexForTesting();
  await saveDraft(draftA, draftWithSteps(2), 0);
  assert.equal(db.stores.drafts.get(draftA).format, DRAFT_MANIFEST_FORMAT);
  const legacy = await readDraft(draftA);
  // The next edit stores the layer tiled; the draft moves to format 4 and the
  // old data-URL assets stay loadable from history.
  const tiled = tiledVersion(0);
  const next = {
    ...legacy,
    assets: { ...legacy.assets, [ids[5]]: tiled },
    history: [...legacy.history, { ...frame(ids[5]), w: 600, h: 300 }],
    index: 2,
  };
  await saveDraft(draftA, next, 1);
  assert.equal(db.stores.drafts.get(draftA).format, DRAFT_TILED_MANIFEST_FORMAT);
  const read = await readDraft(draftA);
  assert.deepEqual(read.assets[ids[0]], legacy.assets[ids[0]]);
  assert.equal(assetFingerprint(read.assets[ids[5]]), assetFingerprint(tiled));
});

test('tiled drafts skip the JSON write-ahead snapshot and plan Blob tile records', () => {
  clearTileIndexForTesting();
  assert.equal(estimatedPendingDraftBytes(tiledDraft(1)), Number.POSITIVE_INFINITY);
  const planned = planDraftAssetWrites(draftA, new Map([['a'.repeat(64), new Blob([new Uint8Array(4)])]]), []);
  assert.equal(planned.puts[0][1].kind, DRAFT_TILE_KIND);
  assert.ok(planned.puts[0][1].blob instanceof Blob);
});

test('a tiled write-ahead snapshot stores tile keys only and recovers from the stored tiles', async () => {
  const items = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
  try {
    clearTileIndexForTesting();
    await saveDraft(draftA, tiledDraft(2), 0);
    // Unsaved tiles (a fresh stroke) are never staged: IndexedDB is authoritative.
    assert.equal(stagePendingDraft(draftA, { ...tiledDraft(3), localRevision: 1 }, 2), undefined);
    // A rename of the stored pixels is staged as small JSON with tile keys.
    const renamed = { ...tiledDraft(2), name: 'Renamed before reload', localRevision: 1 };
    const token = stagePendingDraft(draftA, renamed, 2);
    assert.equal(typeof token, 'string');
    const [encoded] = [...items.values()];
    assert.ok(encoded.length < 64 * 1024);
    assert.ok(!encoded.includes('"blob"'));
    const read = await readDraft(draftA);
    assert.equal(read.name, 'Renamed before reload');
    assert.equal(read.localRevision, 1, 'rebased onto the stored revision');
    assert.equal(read.assets[ids[1]].tiles[4], renamed.assets[ids[1]].tiles[4]);
    assert.equal(assetFingerprint(read.assets[ids[1]]), assetFingerprint(renamed.assets[ids[1]]));
    // A snapshot whose tiles cannot be found is discarded, not half-adopted.
    const parsed = JSON.parse(encoded);
    const tiledId = Object.keys(parsed.draft.assets).find((assetId) => parsed.draft.assets[assetId].tiles);
    parsed.draft.assets[tiledId].tiles[0] = 'f'.repeat(32);
    items.set([...items.keys()][0], JSON.stringify(parsed));
    const fallback = await readDraft(draftA);
    assert.equal(fallback.name, 'Tiled');
    assert.equal(items.size, 0);
  } finally {
    delete globalThis.sessionStorage;
  }
});

test('audio annotation clips are stored once as content-addressed records and survive reload', async () => {
  const bytes = new Uint8Array(3000).map((_, index) => (index * 7) & 255);
  const url = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
  const clip = { url, mime: 'audio/wav', bytes: bytes.byteLength, durationMs: 1500 };
  const marker = (id) => ({ id, kind: 'audio', x: 0, y: 0, clip: 'a-voice', durationMs: 1500, label: 'Voice memo' });
  const base = draftWithSteps(2);
  const input = {
    ...base,
    audio: { 'a-voice': clip },
    history: [
      { ...base.history[0], measurements: [marker('m-1')] },
      { ...base.history[1], measurements: [marker('m-1'), marker('m-2')] },
    ],
  };
  await saveDraft(draftA, input, 0);
  const pointer = db.stores.drafts.get(draftA);
  assert.ok(!JSON.stringify(pointer).includes('data:audio'), 'the manifest holds only the clip hash');
  const hash = await hashDraftAsset(url);
  assert.deepEqual(pointer.audioRefs, { 'a-voice': { hash, mime: 'audio/wav', bytes: 3000, durationMs: 1500 } });
  assert.ok(db.stores.draftBlobs.has(draftAssetKey(draftA, hash)));
  assert.equal(db.assetKeys(draftA).length, 3, 'two images + one shared clip');
  setDraftDatabaseForTesting(db);
  const reloaded = await readDraft(draftA);
  assert.deepEqual(reloaded.audio, { 'a-voice': clip });
  assert.equal(reloaded.history[1].measurements.length, 2);
  // Deleting the markers lets the next save collect the clip record.
  await saveDraft(draftA, { ...input, history: input.history.map((frame) => ({ ...frame, measurements: [] })) }, 1);
  assert.ok(!db.stores.draftBlobs.has(draftAssetKey(draftA, hash)));
  assert.equal((await readDraft(draftA)).audio, undefined);
});
