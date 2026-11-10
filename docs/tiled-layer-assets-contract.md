# Tiled, Blob-backed layer assets

Status: first slice implemented (#213); dirty-rectangle hints (W4-5) and the
decoded-tile cache (W4-7) added. See "Follow-ups" for what remains.

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
tiles it touched. Without a hint (below) the whole layer is still read back
and hashed (about 0.1 s for 10.8 MP).

### Dirty-rectangle hints

`addAsset(assets, canvas, { hint: { base, dirty } })` (and
`tileCanvas(canvas, undefined, hint)`) states that `canvas` equals the asset
`base` everywhere outside the rectangle `dirty` (`null`: nothing changed).
Tile cells wholly outside the rectangle take `base`'s tile objects without
any `getImageData` or hash; only the cells the rectangle touches are read
(one `getImageData` per tile row, limited to the touched columns), hashed and,
if new, encoded. Because tiles are content addressed, the result is the same
asset, tile for tile and by object, as the full scan whenever the hint is
true. The hint is ignored, and the commit scans the whole canvas, when:

- `base` is not a tiled asset (a legacy data URL, a missing id), so there are
  no previous tile keys (`fallback: 'no-base'`);
- `base` has other dimensions than the canvas: the layer was expanded,
  trimmed or cropped since the buffer was drawn (`'base-size'`);
- `base` fails the structural tile checks (`'base-invalid'`), or the
  rectangle is not finite and non-negative (`'dirty-invalid'`).

Hints are only passed where every write is known. `src/canvasDirty.ts`
tracks a gesture buffer (`trackCanvasWrites`) right after the layer's stored
pixels are drawn into it; the shared stamp (`stampCanvas`, which covers the
brush tip, size/angle/scatter/colour dynamics, texture, dual brush, bristles,
wet edges, build-up and each Paint Symmetry copy) and the selection
confinement (`confineStrokeRect`) report the exact rectangle of every
`putImageData`. Writes to an untracked canvas are ignored, a non-finite
rectangle marks the buffer unknown, and an unknown buffer commits with a full
scan. Current users:

- Brush, Pencil and Eraser strokes (with or without a selection or Paint
  Symmetry): base = the layer asset the stroke buffer was drawn from.
- Layer → Stroke Path with Brush (Brush, Pencil, Eraser) without a
  selection; with a selection (whole-buffer confinement) or Smudge it scans.
- The paint-time expansion of a layer stored at its content bounds: the new
  canvas-size buffer is transparent except where the old asset was drawn, so
  the hint is an all-empty base (`emptyTiledAsset`) and the drawn rectangle.

Every other tool (gradients, fills, filters, clone/heal, retouch tools,
masks, merges) commits with a full scan, exactly as before.

The automatic content-bounds storage after a paint commit
(`storeAtContentBounds`) also uses the tile layout: pixels outside the
non-empty tiles are transparent, so it reads back only the rectangle of the
non-empty tiles (`tiledContentRegion`) and plans the trim from it
(`planLayerTrim(…, region)`, identical to the whole-layer plan).

Each tiled commit publishes its counters as the performance mark
`pixelforge.tile-commit` (detail: `tiles`, `hashed`, `skipped`, `encoded`,
`reused`, `empty`, `hinted`, `fallback`). With
`window.__PIXELFORGE_VERIFY_TILE_HINTS__ = true` (tests and diagnostics
only) every hinted commit also runs the full scan and records
`fullScanMatch` (same tile objects in every cell).

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

### Decoded-tile cache

Assembling a tiled asset (main thread and render worker) first draws every
tile found in a per-context decoded-tile cache, synchronously, and decodes
only the others (equal tiles within one asset decode once). Decoded tiles are
then retained, so undo, redo or the next stroke's start on a version that
shares most tiles with one already assembled decodes only the tiles it does
not share.

- Keys are the tile key plus the encoded byte size, so the worker's structured
  clones of a tile hit the same entry. Values are `ImageBitmap`s.
- The cache is an LRU bounded by RGBA bytes with the same device tiers as the
  layer filter cache: 96 MiB desktop, 192 MiB with `deviceMemory` ≥ 8,
  32 MiB on phones or ≤ 4 GB, 12 MiB on ≤ 2 GB (a 2646 × 4096 layer is
  about 43 MiB of tiles). Evicted bitmaps are closed at once; that is safe
  because a cached bitmap is drawn in the same task that reads it.
- A committed tiled asset's tiles are seeded from the pixels the commit
  already holds (the private snapshot `primeDecodedAsset` keeps on the main
  thread, the primed pixels in the worker) at idle time, so even the first
  assembly after a commit decodes nothing it shares with it. Seeding is
  skipped when the asset's missing tiles would need more than half the
  budget.
- `clearDecodedAssetCache` (a different document in the worker) also clears
  the decoded tiles.
- Counters are published as `pixelforge.decoded-tile-cache` marks (detail:
  `hits`, `misses`, `stores`, `seeded`, `evictions`, `rejected`, `entries`,
  `bytes`, `maxBytes` and `context: 'main' | 'worker'`); the worker sends its
  per-render delta with the result, as the layer filter cache does.

Install-time verification (`verifyAssetsDecode`) still decodes each distinct
tile only to check its size and does not fill the cache.

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

### W4-5 / W4-7

`node scripts/measure-stroke-commit.mjs <url>` (now also times keyboard undo
and redo through eight photo strokes and reports the tile counters) on the
same Windows desktop, headless Chromium, 2646 × 4096 noisy photo, two runs
per build, `main` `05a0b65` against this change:

| Operation | Before (`05a0b65`) | After |
| --- | --- | --- |
| Stroke commit, full-canvas noisy photo layer (8 strokes × 2 runs) | 343–568 ms | 263–382 ms |
| Stroke commit, new paint layer (3 strokes × 2 runs) | 504–716 ms | 268–349 ms |
| Undo, versions still in the whole-asset decoded cache (steps 1–4) | 123–204 ms | 140–188 ms |
| Undo, versions assembled from tiles (steps 5–8) | 343–398 ms | 167–269 ms |
| Redo, versions assembled from tiles (steps 5–8) | 295–430 ms | 175–235 ms |

Times are key press / pointer-up to the settled render. Counters from the
same runs: the eight photo commits hashed 18 of 1,408 tiles (the rest were
reused from the hint's base unread); the three paint-layer strokes (and their
three paint-time expansions) hashed 25 of 1,056; undo/redo assembled every
older version in the render worker from cached tiles (1,408 hits, 0
misses). The remaining commit cost is mostly the commit render and the worker
prime readback (follow-up 6), not tiling.

### #213

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
- `tests/tile-dirty-rect-and-decode-cache.test.mjs` (pure): hint validation
  and fallbacks, dirty tile ranges, randomized hinted commits equal to the
  full scan (same keys and tile objects) while reading only the dirty tile
  rows and columns, transparent and erased tiles, the empty-base expansion
  hint, the trusted-hint contract, canvas write tracking, trim planning from
  the non-empty tile region, the decoded-tile LRU (budget, eviction closes,
  clone keys, device tiers, counters), assembly that decodes only unshared
  tiles, duplicate tiles decoded once, failed tiles never cached, and
  seeding.
- `tests/browser/tile-dirty-rect-and-decode-cache.spec.ts` (desktop +
  mobile): hard and soft Brush, Pencil, Eraser, vertical symmetry and a
  selection-confined stroke on a photo layer, and soft strokes on a new paint
  layer (expansion + trim), each committing only its tiles with
  `fullScanMatch`, then exact undo, redo and reload; undo/redo after a reload
  assembling older versions from the decoded-tile cache on the main thread
  and in the render worker.

## Follow-ups

1. ~~Dirty-rectangle hints~~ (W4-5): done for Brush, Pencil, Eraser, Stroke
   Path with Brush and the paint-time expansion. Other pixel tools still scan
   the whole layer; they can opt in by tracking their writes.
2. Portable bundle v4 storing tiles (`tiles/<sha256>.png`) so exporting a
   long history of tiled assets does not flatten each version; cloud payloads
   would follow.
3. ~~Decoded-tile cache~~ (W4-7): done.
4. Dirty-region previews and worker-side partial composites.
5. Encode new tiles off the main thread (`OffscreenCanvas.convertToBlob`) when
   a commit can become asynchronous.
6. The worker prime still reads back the whole committed buffer
   (`primeWorkerDecodedAsset`: one `getImageData` and a 43 MB transfer at
   10.8 MP). With the decoded-tile cache the worker could receive only the
   new tiles' pixels.
