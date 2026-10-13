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
{ kind: 'result', id, image: ImageBitmap, width: number, height: number }
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

Each request has a 30-second watchdog. A timeout, worker error, message error,
abort signal or invalid response terminates that worker and rejects the
request. A newer render invalidates an older render in `useDocument`; only the
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
The committed editor currently uses the adapter without a retained `TileCache`,
The editor now keeps one 8 MiB byte-bounded cache for the active in-memory
document session. Cache keys include the document revision and effect, so edits
cannot reuse stale pixels; older entries are evicted by the LRU policy. The
cache is process-local, contains no URLs or cloud data, and is discarded with
the editor session. Device-specific cache sizing and physical-device memory
gates remain staged.
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
  request and tears the worker down after an idle timeout. The worker clears its
  decoded-asset cache and output surface between requests. A multi-worker pool
  and prioritisation remain future work.
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
