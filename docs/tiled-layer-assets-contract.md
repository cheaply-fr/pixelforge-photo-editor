# Tiled, Blob-backed layer assets

Status: first slice implemented (see "What this slice ships" and "Follow-ups").

## Why

Every raster edit stores a new immutable asset. Before this change an asset
was always one `data:image/png;base64,…` string for the whole layer, so a
brush stroke on a full-canvas 2646 × 4096 photo re-encoded the entire layer
(PNG deflate plus base64) on pointer-up: 2.2–2.9 s from pointer-up to the
committed render (`scripts/measure-stroke-commit.mjs`, #207). The same string
was then hashed for drafts, counted whole by the history budget and resent to
the render worker.

## Model

```ts
type PngAsset   = { url: string; w: number; h: number };            // unchanged
type AssetTile  = { key: string; blob: Blob };                        // immutable
type TiledAsset = { w: number; h: number; tileSize: 256;
                    tiles: (AssetTile | null)[] };                    // row-major
type Asset = PngAsset | TiledAsset;
```

- A tiled asset covers its `w × h` pixels with a row-major grid of
  `ceil(w / 256) × ceil(h / 256)` cells. Cell `(c, r)` holds the pixels
  `[c·256, min(w, c·256+256)) × [r·256, min(h, r·256+256))`; edge tiles are
  smaller. `null` is a fully transparent tile (every RGBA byte zero) and is
  never encoded or stored.
- `AssetTile.blob` is an `image/png` Blob of exactly the tile's pixels.
  Blobs, not data URLs, hold the bytes: no base64 inflation in memory, cheap
  structured clones to the render worker (the bytes are not copied) and
  native IndexedDB storage.
- `AssetTile.key` is a 128-bit content hash (32 lowercase hex characters) of
  the tile's straight-alpha RGBA pixels as read back by `getImageData`, plus
  its dimensions. Tiles are content addressed: equal pixels give equal keys,
  so unchanged tiles are shared, by object, between assets, layers and history
  steps. The hash is not cryptographic. Keys are only produced locally from
  pixels this tab encoded, or read back from this browser's own draft records
  whose bytes are SHA-256 verified; imported files never supply tile keys
  (see Interchange).
- Asset objects and tiles are immutable. History frames still reference
  assets by id; nothing about `Frame`, layers or masks changes.

## Which assets are tiled

`addAsset(assets, canvas)` keeps its synchronous signature. A canvas with at
least `TILED_ASSET_MIN_PIXELS` (1024 × 1024) pixels is stored tiled;
smaller canvases keep the single PNG data URL (they are cheap to encode and
most fixtures, thumbnails and masks of small documents stay byte-identical).
This covers imports, brush-family commits, filters, fills, masks and merges
behind one API, so the ~40 `decodeAsset` call sites and ~40 `addAsset` call
sites keep working.

## Commit: only new tiles are encoded

`addAsset` reads the canvas back in 256-row bands, hashes each tile and looks
the key up in a tab-wide tile index (`Map<key, WeakRef<AssetTile>>`, entries
removed by a `FinalizationRegistry` once no asset holds the tile). A hit
reuses the existing tile object; only misses are encoded (`toDataURL` of a
tile-sized scratch canvas drawn from the source, so the PNG decodes to exactly
the hashed pixels). A stroke on a full-canvas layer therefore encodes the few
tiles it touched, plus a readback and hash of the layer (about 0.1 s for
10.8 MP). Dirty-rectangle hints from the gesture (skip hashing untouched
tiles) are a follow-up; content addressing already gives the same output.

An asset whose tile list equals an existing asset's (same dimensions and
keys) reuses that asset id, as identical data URLs did before.

## Decode

`decodeAsset` keeps its contract (a promise of a drawable with
`naturalWidth`/`naturalHeight`, cached by content fingerprint within the
decoded-pixel budget). A tiled asset is assembled by decoding each tile Blob
with `createImageBitmap` (bounded concurrency) and drawing it at its offset;
each tile's decoded size must match its cell or the decode fails closed.
The main thread returns a canvas presented like an image; the render worker
returns an `ImageBitmap` from an `OffscreenCanvas`. Install-time verification
(`verifyAssetsDecode`, for history and hidden layers) decodes each distinct
tile once and checks its size instead of assembling every version. `primeDecodedAsset` and
the worker prime from #195 still seed both caches with the committed
buffer, so the commit render never decodes the tiles it just encoded.

The content fingerprint of a tiled asset is its dimensions, tile count and a
64-bit hash of the ordered tile keys (`assetFingerprint`). The composite,
filter and worker asset caches are keyed by it unchanged.

## Validation

`validateFrame` is unchanged (ids, dimensions). `validAsset` accepts either a
legacy PNG data URL (header checked as before) or a tiled asset whose
dimensions are within 16,000 px / 16 MP, `tileSize` is 256, the grid length
matches, and every cell is `null` or `{ key: /^[0-9a-f]{32}$/, blob: Blob }`
with a non-empty `image/png` Blob of at most 1 MiB (a 256² RGBA tile cannot
legitimately encode larger). Pixel-level checks happen at decode, as for
legacy assets.

## Budgets count unique tiles

`assetBytes`/`historyAssetBytes`/the history window
(`src/historyBudget.ts`) and the project ceilings (`src/projectLimits.ts`)
count storage units: one per legacy asset (its data-URL length, as before)
and one per distinct tile key. A tile's cost is the base64 length of its PNG
(`ceil(size / 3) · 4`), so budgets keep the meaning they had for data URLs
and a document that fits the budget still fits the flattened PNGs written by
interchange. A history of 20 strokes on a 10.8 MP photo now costs the layer
once plus the touched tiles per step instead of 20 whole layers, so the
desktop/mobile budgets retain far more undo steps.

## Drafts (IndexedDB)

Draft manifests stay content addressed and incremental (#186):

- Format 3 is still written for documents without tiled assets, so a tab on
  an older build keeps reading them.
- Format 4 is written when any referenced asset is tiled. `assetRefs[id]` is
  either the format 3 `{ hash, w, h }` or `{ w, h, tileSize: 256, tiles }`
  where `tiles` lists tile keys (or `null`). `tileRefs` maps each tile key to
  the SHA-256 of its PNG bytes.
- Each distinct tile PNG is one record at `asset:<draftId>:<sha256>` with
  value `{ kind: "pixelforge-draft-tile", hash, blob }`. A save writes only
  records the draft does not hold (a stroke writes its new tiles), and
  garbage-collects this draft's unreferenced records in the same transaction.
- Reading verifies every record's SHA-256 before adopting it, rebuilds shared
  `AssetTile` objects (one per key) and runs the normal draft validation. An
  older build sees `format: 4`, rejects the manifest and fails closed
  ("Recovery unavailable"), as the draft-storage contract specifies.
- The sessionStorage write-ahead snapshot writes a tiled asset as its tile
  keys, and only when every tile is already stored in this draft's last
  committed manifest (tracked per tab). Recovery reads the stored draft first
  and rebuilds the snapshot's assets from its tiles; a missing tile discards
  the snapshot and IndexedDB stays authoritative. So a rename or setting
  change just before a reload survives as before, while a fresh stroke whose
  tiles are not stored yet relies on IndexedDB, exactly as documents too
  large for the snapshot always did.
- The SHA-256 of a tile is computed once per tile object per tab.

## Interchange and export

- `.pixelforge` (portable bundle v3) and cloud saves flatten every tiled asset
  to one PNG data URL before writing (`flattenTiledAssets`), so files written
  by this build open in every build that reads v3, and readers keep never
  trusting tile keys from files. Flattened data URLs are not memoized (a long
  history would pin hundreds of megabytes), and the history window written
  is chosen by each asset's full flattened size (`persistableHistoryDraft`
  with `flattened: true`), so a file stays within the same 64 MB history
  budget as before. Imported projects start with PNG assets; the next edit of
  a large layer stores a tiled asset.
- PNG/JPEG/WebP/PSD/PDF/ORA and batch exports render through `decodeAsset`
  and are unchanged.
- The reference overlay and other `<img>` consumers only ever see small
  (untiled) assets or go through `decodeAsset`.

## Migration

Nothing is rewritten in place. Old data-URL assets in history, drafts and
project files keep loading and rendering as before. A layer becomes tiled the
next time an edit stores it (`addAsset`), and from then on its history shares
tiles. A format 3 draft becomes format 4 on the first save that references a
tiled asset.

## Measurements (local, not CI)

`node scripts/measure-stroke-commit.mjs <url>` on one Windows desktop,
headless Chromium, 2646 × 4096 noisy photo, pointer-up → committed and
rendered stroke, two runs of three strokes each:

| Layer | Before (`main` 257e744) | After |
| --- | --- | --- |
| Full-canvas noisy photo layer | 2.0–3.4 s | 0.48–0.60 s |
| New paint layer (stored at content bounds) | 0.42–0.79 s | 0.51–0.74 s |

The paint-layer case is unchanged within noise: its commit was already
small; the full-canvas readback and hash it now adds is about 0.1 s.

## Tests

- `tests/tiled-assets.test.mjs` (pure): hashing and empty-tile detection,
  dirty-tile commits that encode only changed tiles and share the rest by
  object, global dedupe across assets, dimension edge tiles, structural
  validation (malformed grids, keys, blobs, oversize), fingerprints, history
  budget counting shared tiles once, project byte counting, format 4 draft
  manifests, record planning and SHA-256 verified decoding with shared tile
  objects, legacy data-URL migration and the format 3 path.
- `tests/browser/tiled-layer-assets.spec.ts` (desktop + mobile): paint on a
  large layer encodes only touched tiles, undo/redo pixels, draft reload with
  identical pixels and tiled records, `.pixelforge` export/import round trip
  with PNG assets, and legacy data-URL documents that still load and convert
  on the next stroke.

## Follow-ups

1. Dirty-rectangle hints from paint gestures, so a commit hashes only touched
   tiles instead of reading back the whole layer.
2. Portable bundle v4 storing tiles (`tiles/<sha256>.png`) so exporting a
   long history of tiled assets does not flatten each version; cloud payloads
   would follow.
3. Decoded-tile cache, so undo to a version that shares most tiles assembles
   from decoded tiles instead of decoding every tile Blob again.
4. Dirty-region previews and worker-side partial composites.
5. Encode new tiles off the main thread (`OffscreenCanvas.convertToBlob`) when
   a commit can become asynchronous.
