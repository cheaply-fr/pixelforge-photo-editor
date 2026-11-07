# Worker document-render contract

PixelForge can render an immutable document frame in a dedicated module worker
when the browser exposes `Worker`, `OffscreenCanvas`, `createImageBitmap` and a
usable 2D context. The worker still publishes a bounded full-frame result and
does not make the current 16 MP safety limit larger. A visible source-provider /
destination-sink adapter uses bounded tiles internally for the explicit local
effect allow-list (Blur More, Box, Gaussian, Lens, Motion, Shape, Smart,
Surface and Fragment, with effective radius 1–64); unsupported, global and
cell-phase-sensitive effects continue through the full-frame path.

## Request protocol

Committed renders send one structured-clone request through a persistent module
worker session. The session creates a worker on demand, processes requests
sequentially, keeps only the newest queued render, and tears the worker down
after an idle timeout or failure. Nonpersistent callers may still create a
fresh worker for an individual render.

```ts
{
  kind: 'render',
  id: number,
  frame: Frame,
  assets: Assets,
}
```

`assets` is reduced to the raster and mask assets referenced by the requested
frame. Undo history and unrelated project assets are not cloned. The worker
rejects malformed frames through the same `validateFrame` contract used by the
main-thread renderer and processes one request at a time.

The main thread may send `{ kind: 'cancel', id }` for the active request. The
worker checks cancellation between layer passes and before publishing output.
After each top-level layer pass, the worker may report bounded progress:

```ts
{ kind: 'progress', id, completed: number, total: number }
```

`total` is the number of layers in the requested frame. `completed` is a
monotonic one-based count; hidden layers still count as completed passes. Nested
renders used for decorated text and vector layers are intentionally excluded so
the client never receives duplicate or regressing totals. The editor exposes
the latest `completed/total` sample in its render-status output while keeping
the last sample available after completion for diagnostics and assistive
technology. Progress is advisory: cancellation, timeout and error paths remain
the authoritative result.

Eligible local-neighbourhood layers also emit an independent bounded tile
progress envelope before their final telemetry envelope:

```ts
{
  kind: 'tiled-progress',
  id: number,
  progress: {
    kind: 'tiled-neighborhood-progress',
    effect: 'blur-more' | 'box-blur' | 'gaussian-blur' | 'lens-blur' |
      'motion-blur' | 'shape-blur' | 'smart-blur' | 'surface-blur' | 'fragment',
    layerId?: string,
    width: number,
    height: number,
    tileSize: 256 | 512,
    tileCount: number,
    completed: number,
    total: number,
  },
}
```

`completed` is one-based and monotonic; `total` must equal the canonical tile
count rebuilt from the image dimensions and tile size. The envelope contains
no pixels, asset URLs or source content. Cancellation is checked before and
after every tile, and a superseded request cannot publish progress into a
newer render. The main-thread fallback uses the same callback and validation,
so the status contract remains consistent when workers are unavailable.
An invalid request or a worker-side exception produces a bounded error object:

```ts
{ kind: 'error', id, name: string, message: string }
```

Error names and messages are truncated before crossing the worker boundary so
an exception cannot become an unbounded response.

## Result protocol and validation

The preferred response transfers an `ImageBitmap`:

```ts
{ kind: 'result', id, image: ImageBitmap, width: number, height: number, layerCache?: LayerFilterCacheStats }
```

If `transferToImageBitmap()` is unavailable, the worker encodes a PNG and
transfers its `ArrayBuffer` instead:

```ts
{ kind: 'result-bytes', id, bytes: ArrayBuffer, width: number, height: number }
```

The client accepts only a response with the matching request id, exact frame
width and height, and either a closable image or a non-empty PNG buffer no
larger than 64 MiB. A byte response is decoded with `createImageBitmap`; a
decode failure rejects the render. Unknown messages, stale ids, malformed
responses and wrong dimensions are ignored or rejected without replacing the
last published canvas.

Each request has a work-scaled watchdog (`renderWatchdogBudget` in
`src/workerRender.ts`). The no-progress window is 30 s plus 6 s per frame
megapixel (at most 120 s) and restarts on every valid layer or tile progress
message; the total ceiling is 30 s plus 15 s per megapixel × layer, never below
the no-progress window and never above 600 s. A 10.8 MP single-layer poster
therefore gets ~95 s without progress and ~190 s in total instead of the
former fixed 30 s, which had stopped a legitimate radius-24 Gaussian render. A timeout rejects with
`RenderTimeoutError` (`code: 'PIXELFORGE_RENDER_TIMEOUT'`), whose message says
the canvas keeps the last finished render and editing still works. A timeout,
worker error, message error, abort signal or invalid response terminates that
worker and rejects the request. Tests may set
`globalThis.__PIXELFORGE_RENDER_TIMEOUT_MS__` (a number or
`{ stallMs, totalMs }`) to shorten the budget. A newer render invalidates an older render in `useDocument`; only the
newest completed result can be published. Published image sources are closed
after they are drawn or discarded.

## Bounded tile schedule seed

The shared [`tilePlan.ts`](../src/tilePlan.ts) module now exposes a deterministic
`planTiles` plus `scheduleTiles` contract. `scheduleTiles` validates every inner
and expanded read rectangle, preserves row-major order, and groups work under a
16 MiB expanded-RGBA batch budget (with a hard 64 MiB ceiling). The bounded
image-encode worker consumes these batches and releases each temporary tile
buffer before advancing. This protects worker operations from accidentally
turning a neighbourhood read into an unbounded queue.

The schedule is a reusable planning boundary for document rendering. The
visible adapter consumes it for the allow-listed local effects above; cell
aligned and coordinate-dependent effects still require origin-aware edge and
compositing tests. The schedule does not change the full-frame document result
protocol, stream partial pixels, or increase the 16 MP safety limit. Overlap
remains explicit so additional effects can adopt the same plan only after their
rules are tested.

## Tiled render planning protocol

The first document-render planning slice is now implemented in
[`tiledRender.ts`](../src/tiledRender.ts). The visible document renderer still
publishes the full-frame result protocol above, while the bounded blur adapter
uses the tile plan internally.
The module provides a versioned, pixel-free request envelope:

```ts
{
  kind: 'render-tiles',
  version: 1,
  id: 42,
  width: 2400,
  height: 1600,
  tileSize: 512,
  overlap: 16,
  maxBatchBytes: 16777216,
}
```

Only 256 px and 512 px tiles are accepted for document planning. Every request
is rebuilt from its dimensions and options at the worker boundary; caller
supplied rectangles are never trusted. The shared planner clips overlap at
image edges, emits inner write rectangles in row-major order, and validates
the existing 16 MP, 16,000 px edge, tile-count, 16 MiB batch and 64 MiB hard
limits. `runTiledRender` is a cancellable callback runner for pure effects and
future worker adapters. It checks the abort signal before every tile and emits
monotonic completed-tile progress only after a callback resolves.

The planning module now feeds a bounded visible adapter for the allow-listed
local effects (effective radius 1–64) when a render revision is supplied. The
adapter reads each expanded region through a source provider and writes only
the inner rectangle through a destination sink, so it does not create a
full-frame RGBA source readback. Unsupported, global or cell-phase-sensitive
effects continue to use the existing full-frame renderer. A working-byte
exhaustion raises `TiledMemoryBudgetError`; callers preserve the current draft
and can offer export/retry rather than immediately attempting another
full-canvas allocation. Other canvas allocation failures retain the existing
safe fallback. An isolated [`tiledCompositor.ts`](../src/tiledCompositor.ts) slice now assembles
RGBA pixels serially from expanded tiles: a callback receives the overlap read
rectangle, and only its inner write rectangle is copied into the destination.
Its `maxWorkingBytes` guard accounts for the retained input/output pair, and
its `compareTiledWithFullFrame` oracle reports exact byte parity, first mismatch
coordinates and maximum channel delta. The visible adapter uses the same
expanded-read/inner-write ownership and passes representative full-frame
parity fixtures before promotion. The byte-bounded `TileCache` now exposes
cumulative hit/miss, rejection, eviction and peak-byte counters, plus an
explicit `delete` operation for releasing a tile before the whole cache is
cleared. `runTiledRender` accepts that cache as an opt-in callback cache: its
default key includes the canonical request and tile rectangles, and callers
can provide a key and retained-byte estimator for processed pixels. Cache
hits still emit the same monotonic progress event, while outputs that have no
safe byte estimate are simply left uncached. These counters make a future
device benchmark observable without widening the bounded blur adapter to other
effects or selecting a device cache policy; measured eviction thresholds remain
a release gate.

The compositor's pure contract covers edge-clipped overlap, inner-rectangle
ownership, source immutability, exact parity for a neighbourhood blur,
intentional seam detection when overlap is too small, callback shape/error
validation, cancellation before and after callbacks, and retained tile-byte
limits. Desktop/mobile browser acceptance covers the visible blur adapter and
the full-frame fallback. Its memory ledger reports the destination surface and
bounded tile working set; it does not raise the 16 MP safety limit.

The document path now carries one validated `tiled-telemetry` message for each
eligible local-effect layer. It reports only effect kind, layer-local dimensions,
tile count/size, destination bytes, peak tile working bytes, cache bytes and
bounded cache counters; it never includes pixels, asset URLs or user content.
The editor now keeps a device-aware 2–16 MiB byte-bounded cache for the active
in-memory document session, capped at 4 MiB on mobile. Cache keys include the
document revision and effect, so edits cannot reuse stale pixels; older entries
are evicted by the LRU policy. The cache is process-local, contains no URLs or
cloud data, and is discarded with the editor session. Sizing uses only coarse
local browser hints; those hints are not retained or transmitted.
The worker validates this envelope before invoking the UI callback, drops
telemetry from superseded request IDs, and publishes it before the owned image
result. The editor exposes the latest values as render-status data attributes
for local diagnostics and acceptance tests. A cancelled or failed render does
not publish telemetry as a completed frame, and unsupported/global effects keep
the full-frame fallback with `data-tiled-effect="none"`.

## Fallback and interactive edits

The renderer uses the existing main-thread `renderFrame` path when worker
capability probing fails, worker construction fails, an abort is already
requested, or a caller supplies a live per-layer canvas override (for example,
an in-progress brush gesture). The fallback keeps local editing functional on
browsers without OffscreenCanvas and preserves the previous canvas on a failed
or cancelled render. Main-thread rendering yields between layers and observes
the same cancellation predicate, so fallback work is bounded even though it is
not isolated from input handling.

## Current limitations

This contract deliberately does not claim Photoshop-class or industrial-scale
rendering:

* The worker allocates a full output surface and may allocate additional
  full-frame surfaces for masks, levels, curves and other effects. Peak memory
  therefore remains bounded by the existing document limits, not by tiles.
* The committed editor path reuses one module worker between sequential renders,
  queues only the newest request, posts cooperative cancellation for the active
  request and tears the worker down after a five-minute idle timeout. The
  worker releases its output surface between requests but keeps the bounded,
  content-keyed decoded-source and layer-filter caches described below. A
  multi-worker pool and prioritisation remain future work.
* Progress currently counts full-frame layer passes. It is not a pixel or tile
  percentage and does not imply that the worker is streaming a partial canvas.
* Interactive override canvases stay on the main-thread fallback. A full
  worker-aware brush/adjustment command model is still planned.
* Canvas font availability, CSS filter implementations and browser colour
  management can differ between the worker and the visible document canvas.
  PixelForge must keep representative pixel/alpha fixtures and disclose any
  browser-specific variance before widening the worker path.
* Physical desktop/mobile p50/p95 measurements and 16 MP memory traces remain
  release gates. Pure 16 MP tile-ledger tests, explicit working-byte failures,
  and desktop/mobile local-effect acceptance now verify the deterministic
  budget boundary; they do not substitute for physical low-memory traces.

The visible tiled document adapter, persistent worker reuse and
neighborhood-effect parity gates cover the explicit local-effect allow-list.
Other effects, full-frame adjustments, device-specific cache policy and
low-memory physical traces remain separate Phase 6 gates. Until those gates
pass, large-image work remains opt-in and the 16 MP,
16,000-pixel-edge and layer/history limits stay in force.

## Layer-filter and decoded-source caches

Each rendering context (the main thread and the persistent worker) keeps two
bounded in-memory caches in [`layerFilterCache.ts`](../src/layerFilterCache.ts)
and [`document.ts`](../src/document.ts). Neither is persisted, uploaded or
shared between tabs.

* **Layer-local filtered surfaces.** A raster or asset-backed Smart Object layer
  is built in local coordinates in a fixed order: source (asset or solid fill),
  Spot Healing, Patch, Content-Aware Fill/Move/Scale, Matting, Smart Filters,
  Layer Styles, Filter Effect. When that stage contains a non-neutral Filter
  Effect or Smart Filters, its completed surface is cached under a canonical
  key: key version, kind, local dimensions, the source's content fingerprint
  (or the fill colour), every local-stage metadata field, the fingerprints of
  referenced patch/content-aware masks, normalized Matting, normalized Smart
  Filters (`effectiveSmartFilters`), Layer Styles and the normalized Filter
  Effect (`effectiveFilterEffects`, so equivalent parameters share a key).
  Matrix, CSS/tonal adjustments, layer masks, vector masks, clipping, opacity,
  blend mode, visibility and grouping are applied afterwards in frame space and
  are deliberately not part of the key. Layers with a live override canvas,
  nested Smart Object contents, or a filter routed through the tiled
  neighbourhood adapter (which owns its telemetry contract) bypass the cache.
  The LRU is bounded by RGBA bytes: 256 MiB by default, 96 MiB on mobile user
  agents or `navigator.deviceMemory <= 4`, 32 MiB when `deviceMemory <= 2`. A
  surface larger than the budget is rendered but not retained. Only a completed
  local stage is stored; cancellation and failures throw before the store.
  Cached surfaces are read only with `drawImage`.
* **Decoded sources.** `decodeAsset` keys decoded images by content
  fingerprint (dimensions, encoded length and a 64-bit hash of the data URL)
  instead of object identity, because the worker receives structured clones of
  the same immutable assets on every request and an imported project may reuse
  an asset id for different pixels. It is bounded by decoded pixels (64 MP,
  32 MP on the mobile tier, 16 MP on the low-memory tier). Evicted or cleared
  `ImageBitmap`s are closed only after the render that could still be reading
  them finishes. Failed decodes are not retained.

The main thread sends its memoized fingerprints with each request as
`assetKeys`; the worker accepts a value only when its dimensions and encoded
length match the cloned asset and otherwise hashes locally. Installing a draft
or a replacing commit (a new document) posts `{ kind: 'clear-layer-cache' }` to
the persistent worker and clears the main-thread filter cache. Because keys
describe content, clearing bounds memory; it is not needed for correctness.
Each worker result carries per-render counters (`layerCache: { hits, misses,
stores, evictions, rejected, entries, bytes, maxBytes }`) which the client
validates and publishes as a `pixelforge.layer-filter-cache` performance mark.
The main-thread decode cache uses the same content keys, so repeated tool
gestures on an unchanged layer reuse its decoded source.

## Cancellation and decoded bitmap ownership

Abort signals and callback cancellation now share the same guard on worker,
unsupported-browser fallback and live-override paths. An already cancelled
request fails before any canvas/worker allocation. A fallback checks cancellation
again before returning its completed surface. PNG worker results validate the
actual decoded bitmap dimensions, rather than trusting response metadata alone.
An image decoded after cancellation/timeout is closed immediately and never
returned; malformed decoded dimensions also close the bitmap before rejection.
Unit regressions cover pre-aborted fallback/overrides, late decode cleanup,
forged decoded dimensions and callback cancellation during decode.
Transferred bitmap results also validate their actual dimensions. Rejected,
unrelated and already-settled bitmap responses are closed; an accepted bitmap
remains owned by its caller until the caller finishes drawing and closes it.
Focused regressions verify rejected/unrelated cleanup and accepted ownership.

Project installation also checks its abort signal and render generation before
and after each retained asset decode and immediately before replacing document
history, assets or canvas pixels. A superseded import preserves the winning
draft. The desktop/mobile acceptance fixture pauses an older image decode,
installs a newer blue-pixel project, resumes the older import, and checks that
the newer pixels, bookmark and reload remain intact. This acceptance coverage
must pass the protected browser gate before release.
