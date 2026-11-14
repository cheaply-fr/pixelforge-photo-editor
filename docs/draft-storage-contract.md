# Durable local draft storage

PixelForge local drafts live in the `pixelforge-documents` IndexedDB database (schema version 2: object stores `drafts` and `draftBlobs`). Large editable projects remain recoverable when a session snapshot cannot fit in `sessionStorage`, and autosave cost scales with what changed, not with the size of the document.

## Storage formats

Four record layouts can appear under a draft ID in `drafts`. All of them load; format 3 is written for drafts without tiled assets and format 4 for drafts that reference any (see `tiled-layer-assets-contract.md`).

| Format | Pointer in `drafts` | Payload | Status |
| --- | --- | --- | --- |
| 1 | The complete `Draft` object | inline | read, migrated on next save |
| 2 | `kind: "pixelforge-draft-bundle"`, bundle version 1, SHA-256 checksum and ordered chunk keys | UTF-8 JSON split into ≤ 1 MiB chunks in `draftBlobs` (64 MiB / 256 chunk limit) | read, migrated on next save |
| 3 | `kind: "pixelforge-draft-manifest"`, `format: 3` — the draft's history, index, name, settings, metadata and cloud link, with `assets` replaced by `assetRefs` (asset ID → SHA-256, width, height) | one record per distinct asset content in `draftBlobs` | current (no tiled assets) |
| 4 | as format 3, plus tiled `assetRefs` (`{ w, h, tileSize: 256, tiles: [tileKey \| null] }`) and `tileRefs` (tile key → SHA-256 of the tile PNG) | one record per distinct data-URL asset and one `{ kind: "pixelforge-draft-tile", hash, blob }` record per distinct tile, both at `asset:<draftId>:<sha256>` | current (tiled assets) |

A format 3 asset record is stored at `asset:<draftId>:<sha256>` with value `{ kind: "pixelforge-draft-asset", hash, bytes }`, where `bytes` is the ASCII bytes of the PNG data URL. Records are addressed by content hash rather than asset ID, because transient preview assets may reuse an ID for different pixels; a hash can never alias older content. Records are namespaced per draft, so duplicating a draft writes its own copy and garbage collection never has to reason about other drafts. The pointer keeps `localRevision` and `name` at the top level, so older builds still detect revision conflicts against it, and an older build that cannot read format 3 fails closed ("Recovery unavailable") instead of adopting partial data.

No IndexedDB schema upgrade was needed for format 3: asset records share the version 2 `draftBlobs` store under the `asset:` prefix (format 2 chunk keys never start with it). Tabs still running an older build are therefore never blocked by a version change. Connections close on `versionchange`, and a failed or blocked open is not memoized, so a later save retries.

## On-device render cache

Rendering data derived from the user's own layers is kept in a separate `pixelforge-layer-cache` IndexedDB database (stores `blobs` and `meta`, see `src/persistentLayerCache.ts`): lossless PNGs of expensive filtered layers (the finished local stage), of slow frame-space results (a clipped layer, a masked or Levels/Curves layer, cropped to its visible pixels, with the crop offset in the entry's tag), keyed by a SHA-256 of their content key, and one slot holding the last presented composite of a large document as the reopen preview, tagged with its composite-equivalence key. The preview is written right after a draft opens and after 3 s of quiet while editing. When the page is hidden, reloaded or closed before that, the pending preview is written at once: the PNG is encoded synchronously and the IndexedDB transaction is issued and committed inside the `visibilitychange`/`pagehide` handler (the store is opened and the slot key hashed in advance), so a reload even a fraction of a second after an edit reopens from the matching picture. This urgent write skips eviction (the slot replaces itself; the next regular write evicts). Browsers do not promise to finish work started while a page unloads, so this is best effort: if the write is lost, the reopen renders the layers instead, with the same pixels. When a reopened draft's key matches the tag, that picture is the finished composite: the draft is installed with it and its layers render in the background so the first edit finds warm caches. It is a cache, never a source of truth: entries are bounded by bytes with least-recently-used eviction, any read or write failure is a miss (a failed or closed connection is reopened on next use), and a draft renders correctly without it. Nothing in it is uploaded. Clearing site data removes it with the drafts.

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

Each editor tab holds a shared Web Lock named `pixelforge:draft-open:<draftId>` for the draft it has open. Opening `/editor` without a `#draft=` bookmark normally reattaches to the browser-wide last draft; if another tab currently holds that draft's lock, the new tab starts a new draft instead ("Your last draft is open in another tab, so this tab started a new draft."), because two tabs saving one revision chain would make the other tab report a conflict. Explicit bookmarks still open the same draft in several tabs and use the existing revision-conflict flow (`Duplicate draft` / `Reload newer draft`). Locks are advisory: without Web Locks support the previous behaviour applies.

## Save draft and Duplicate draft

Every change autosaves through the queued local save above; the footer reads "Saved on this device". The doc bar's **Save draft** button re-runs that same local save immediately and, once it settles, shows "Saved on this device · HH:MM" plus a notice ("Draft saved on this device at HH:MM."), or the conflict/quota/failure status if the save could not complete. It writes only to this browser's IndexedDB: it never downloads a file and never uploads to the cloud (cloud saves stay behind the explicit account actions). It has no keyboard shortcut because Ctrl/Cmd+S is already **Export as PNG** (a download) and Ctrl/Cmd+Shift+S downloads the project file.

**Duplicate draft** (formerly "Save local copy") forks the open document into a new `#draft=` bookmark and clears its cloud-update link; the original draft stays stored on this device unchanged. Its tooltip/accessible description says so. Labels live in `src/draftSaveStatus.ts`.

## Tests

`tests/draft-asset-store.test.mjs` runs the real `saveDraft`/`readDraft`/`discardDraft` against an in-memory IndexedDB double with buffered commits: round trip, only new assets written and hashed on later saves, settings-only saves writing just the pointer, garbage collection that keeps referenced and other drafts' records, revision conflicts, a failure between asset writes and the pointer commit, quota errors, format 1 and format 2 loading and migration, corrupt/forged/missing records, ID reuse with new content, and discard. `tests/draft-bundle.test.mjs` keeps format 2 integrity coverage. Browser suites (`incremental-draft-save`, `durable-draft-bundle`, `rapid-draft-save`, `layers`, `resize-image`) cover a 2646 × 4096 poster with several strokes (one new record per stroke, identical pixels, history and records after reload), format 2 migration, corrupt-asset recovery, the bookmark-less second tab, and the stale-tab conflict flows on desktop and mobile.

`tests/draft-save-status.test.mjs` covers the Save draft / Duplicate draft wording and the timestamped status; `tests/browser/save-draft.spec.ts` (desktop and Pixel 7) checks that Save draft fires no download or non-GET request, reports the saved time, survives reload, that Duplicate draft switches to a new draft id while the original stays in IndexedDB and reopens from its bookmark, and that the doc bar does not overflow.
