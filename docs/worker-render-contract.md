# Worker document-render contract

PixelForge can render an immutable document frame in a dedicated module worker
when the browser exposes `Worker`, `OffscreenCanvas`, `createImageBitmap` and a
usable 2D context. This is a bounded full-frame isolation slice. It keeps the
main thread available while a committed frame is painted, but it is not a
tiled renderer and it does not make the current 16 MP safety limit larger.

## Request protocol

The main thread creates a fresh module worker for a render and sends one
structured-clone request:

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

The schedule is a reusable planning boundary for the future document renderer;
it does not change the current full-frame document result protocol, stream
partial pixels, or increase the 16 MP safety limit. Overlap remains explicit so
blur, healing and other neighbourhood effects can adopt the same plan only
after their edge and compositing rules are tested.

## Tiled render planning protocol

The first document-render planning slice is now implemented in
[`tiledRender.ts`](../src/tiledRender.ts). It is deliberately self-contained:
the visible document renderer still uses the full-frame result protocol above.
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

This slice does not allocate pixel buffers, composite partial results, or
change the editor's current render path. A future document adapter must use
the expanded read rectangle for neighbourhood effects, write only the inner
rectangle, and compare tiled output against the existing full-frame renderer
before enabling a visible path. The existing byte-bounded `TileCache` remains
the cache primitive; cache policy and eviction telemetry need device-level
measurements before they become a rendering release gate.

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
* The worker is created per render. A persistent worker pool and prioritisation
  are future work. Tile overlap scheduling, the byte-bounded cache primitive,
  and cancellable planning runner now have pure coverage, but document
  compositing and device-level memory-pressure eviction measurements remain
  pending.
* Progress currently counts full-frame layer passes. It is not a pixel or tile
  percentage and does not imply that the worker is streaming a partial canvas.
* Interactive override canvases stay on the main-thread fallback. A full
  worker-aware brush/adjustment command model is still planned.
* Canvas font availability, CSS filter implementations and browser colour
  management can differ between the worker and the visible document canvas.
  PixelForge must keep representative pixel/alpha fixtures and disclose any
  browser-specific variance before widening the worker path.
* Physical desktop/mobile p50/p95 measurements, 16 MP memory traces and
  low-memory recovery are release gates still pending. Current CI timings are
  diagnostic and do not define a supported device profile.

The tiled document compositor and neighborhood-effect parity rules remain a
separate Phase 6 scale milestone. Until those gates pass, large-image work
remains opt-in and the 16 MP, 16,000-pixel-edge and layer/history limits stay
in force.
