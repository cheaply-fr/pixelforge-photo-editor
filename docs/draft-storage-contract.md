# Durable local draft storage

PixelForge local drafts live in the `pixelforge-documents` IndexedDB database (schema version 2: object stores `drafts` and `draftBlobs`). Large editable projects remain recoverable when a session snapshot cannot fit in `sessionStorage`, and autosave cost scales with what changed, not with the size of the document.

## Storage formats

Three record layouts can appear under a draft ID in `drafts`. All of them load; only format 3 is written.

| Format | Pointer in `drafts` | Payload | Status |
| --- | --- | --- | --- |
| 1 | The complete `Draft` object | inline | read, migrated on next save |
| 2 | `kind: "pixelforge-draft-bundle"`, bundle version 1, SHA-256 checksum and ordered chunk keys | UTF-8 JSON split into ≤ 1 MiB chunks in `draftBlobs` (64 MiB / 256 chunk limit) | read, migrated on next save |
| 3 | `kind: "pixelforge-draft-manifest"`, `format: 3` — the draft's history, index, name, settings, metadata and cloud link, with `assets` replaced by `assetRefs` (asset ID → SHA-256, width, height) | one record per distinct asset content in `draftBlobs` | current |

A format 3 asset record is stored at `asset:<draftId>:<sha256>` with value `{ kind: "pixelforge-draft-asset", hash, bytes }`, where `bytes` is the ASCII bytes of the PNG data URL. Records are addressed by content hash rather than asset ID, because transient preview assets may reuse an ID for different pixels; a hash can never alias older content. Records are namespaced per draft, so duplicating a draft writes its own copy and garbage collection never has to reason about other drafts. The pointer keeps `localRevision` and `name` at the top level, so older builds still detect revision conflicts against it, and an older build that cannot read format 3 fails closed ("Recovery unavailable") instead of adopting partial data.

No IndexedDB schema upgrade was needed for format 3: asset records share the version 2 `draftBlobs` store under the `asset:` prefix (format 2 chunk keys never start with it). Tabs still running an older build are therefore never blocked by a version change. Connections close on `versionchange`, and a failed or blocked open is not memoized, so a later save retries.

## Size limits

A draft may reference up to 4,096 assets and 1 GiB of PNG data URLs (`MAX_PROJECT_ASSETS`, `PROJECT_ASSET_BYTES_CEILING` in `src/projectLimits.ts`), the same device-independent ceilings as portable projects; how far an edit may grow a document on a given device is bounded separately (see `layer-pixel-budget-contract.md`). Format 3 writes one record per new asset, so a large poster costs one asset record per stroke rather than a rewrite of the whole draft. When IndexedDB refuses the write, the storage-full message below applies and the previous revision stays intact; exporting a `.pixelforge` copy remains available.

## Atomic, incremental saves

`saveDraft` validates the draft (frames and settings always; an asset is re-scanned with `validAsset` unless this tab already verified the identical ID, URL and dimensions), hashes only asset content not already hashed in this tab, and then runs one read-write transaction that:

1. reads the pointer and rejects with `LOCAL_CONFLICT` unless its `localRevision` equals the expected revision;
2. lists this draft's existing asset keys (`getAllKeys` over its `asset:` range);
3. writes only records the new manifest needs that are not present (a record lost to an earlier fault is rewritten, not assumed present);
4. deletes this draft's records the new manifest no longer references, and the chunks of a migrated format 2 bundle;
5. writes the manifest pointer last.

The pointer is the atomic commit record. A crash, quota error or any request failure aborts the whole transaction, so the previous complete revision stays readable and no committed manifest ever references a missing record. Garbage collection is computed from the keys the transaction itself read, so it can never delete a record the committed manifest references. A `QuotaExceededError` surfaces as "Browser storage is full. Your last local save is kept; export a copy or free up space." and nothing stored changes.

On recovery, every referenced record must exist, be well formed and hash to its address; the rebuilt draft then passes the full `validateDraft` schema check (including `validAsset` on every asset). Missing, forged or modified records fail closed so a damaged draft never replaces the in-memory document; the editor keeps the original bookmark and starts a new draft. Successfully verified assets seed this tab's verification cache so the first save after a reload is incremental too.

Discard removes the pointer, this draft's asset records and any format 2 chunks in one transaction, subject to the same revision check.

## Write-ahead snapshots

`sessionStorage` write-ahead snapshots remain bounded at 4 MiB and keep their token and revision semantics. The size of the asset URLs a draft references is summed first (no serialization); drafts that cannot fit skip staging immediately and rely on the transactional IndexedDB save. The browser never uploads anonymous assets as part of local recovery.

## Drafts open in several tabs

Each editor tab holds a shared Web Lock named `pixelforge:draft-open:<draftId>` for the draft it has open. Opening `/editor` without a `#draft=` bookmark normally reattaches to the browser-wide last draft; if another tab currently holds that draft's lock, the new tab starts a new draft instead ("Your last draft is open in another tab, so this tab started a new draft."), because two tabs saving one revision chain would make the other tab report a conflict. Explicit bookmarks still open the same draft in several tabs and use the existing revision-conflict flow (`Save local copy` / `Reload newer draft`). Locks are advisory: without Web Locks support the previous behaviour applies.

## Tests

`tests/draft-asset-store.test.mjs` runs the real `saveDraft`/`readDraft`/`discardDraft` against an in-memory IndexedDB double with buffered commits: round trip, only new assets written and hashed on later saves, settings-only saves writing just the pointer, garbage collection that keeps referenced and other drafts' records, revision conflicts, a failure between asset writes and the pointer commit, quota errors, format 1 and format 2 loading and migration, corrupt/forged/missing records, ID reuse with new content, and discard. `tests/draft-bundle.test.mjs` keeps format 2 integrity coverage. Browser suites (`incremental-draft-save`, `durable-draft-bundle`, `rapid-draft-save`, `layers`, `resize-image`) cover a 2646 × 4096 poster with several strokes (one new record per stroke, identical pixels, history and records after reload), format 2 migration, corrupt-asset recovery, the bookmark-less second tab, and the stale-tab conflict flows on desktop and mobile.
