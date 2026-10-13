# Performance budgets and current limits

PixelForge renders the editable document locally with Canvas 2D. A render is
asynchronous from React's point of view, and stale renders are dropped. The
current increment adds a bounded module-worker path for immutable full-frame
document renders through OffscreenCanvas, with cancellation, exact-dimension
validation and a safe Canvas2D fallback. Interactive per-layer overrides (for
example an in-progress brush buffer) still render on the main thread, and both
paths can touch full-canvas buffers. Batch export also uses bounded
OffscreenCanvas work when available. These measurements and limits describe
the current safety envelope; they do not establish Photoshop-class or
industrial-scale performance. See [`worker-render-contract.md`](./worker-render-contract.md)
for the protocol and its remaining limits.

## Current hard limits

The limits below are enforced by the document/import code or by the private
project API:

| Resource | Current limit | Why it exists |
| --- | ---: | --- |
| Imported canvas or image asset | 16 megapixels and 16,000 px per edge | Avoid unbounded decoded Canvas2D allocations |
| Raster layers in one frame | 64 megapixels | Bound the amount of source data retained by an editable frame |
| Layers in one frame | 32 | Keep layer traversal and the inspector bounded |
| Undo history | 24 frames | Bound retained references and redraw work |
| Referenced history PNG data | approximately 32 MiB before old frames are trimmed; 64 MiB current-frame ceiling | Keep local history from growing without limit |
| Portable `.pixelforge` project | 64 MiB of encoded assets | Keep downloads and IndexedDB writes manageable |
| Private cloud project | 16 MiB per document, 30 projects and 256 MiB per library | Preserve the existing Marketplace API quota |

These are protection limits, not a promise that every device can edit at the
maximum. A 16 MP RGBA surface is approximately 64 MiB before Canvas backing
store overhead; a stroke may temporarily require more than one surface. PNG
URL length is also an encoded representation and does not equal decoded memory.

## Chromium baseline captured in CI

The browser test `tests/browser/performance.spec.ts` records three local
operations against the standard 1,440 × 960 starter document:

* **editor ready**: from the page's early init script until the application is
  no longer busy and the first canvas render is complete;
* **raster stroke**: ten pointer moves on a paint layer until the next render
  is complete (this includes Playwright input dispatch and is not a frame-time
  measurement);
* **PNG export**: one `HTMLCanvasElement.toDataURL('image/png')` call.

One run on 2026-10-02 used `CI=1`, one worker and Chromium 153. It used
Playwright's emulated devices, so the mobile row is **not a physical Pixel 7**
and neither row represents a network or CPU throttle:

| Playwright project | Viewport / DPR | Ready | Stroke | PNG encode |
| --- | --- | ---: | ---: | ---: |
| desktop (`Desktop Chrome`) | 1,280 × 720 / 1 | 185.1 ms | 429.9 ms | 4.0 ms |
| mobile (`Pixel 7`) | 412 × 839 / 2.625 | 90.7 ms | 423.8 ms | 3.7 ms |

The values are an observed single sample, retained as a test attachment in the
Playwright report. They are useful for detecting a regression or a hang, not a
distributional guarantee. A later release should collect repeated p50/p95
samples on representative physical desktop and mobile devices before turning
the candidate targets below into blocking assertions.

### Latest local browser sample

On 2026-10-13, the same test passed on the current Chromium 153 profiles with
one worker. The observed values were:

| Playwright project | Ready | Stroke | PNG encode |
| --- | ---: | ---: | ---: |
| desktop (`Desktop Chrome`) | 374.4 ms | 1,100.3 ms | 8.2 ms |
| mobile (`Pixel 7` emulation) | 375.8 ms | 1,124.4 ms | 8.1 ms |

This sample is still emulated mobile hardware and includes Playwright input
dispatch in the stroke measurement. It proves completion under the watchdog,
not physical-device acceptance or a support guarantee. The stroke values exceed
the candidate 250/500 ms targets, so those targets remain unmet until the
interaction path is measured and improved on representative devices.

The test currently uses a 30-second watchdog for each operation. That is
deliberately much looser than a user-facing budget: it catches a stalled
render without making hosted CI hardware look like a supported performance
profile. It does not claim that a 30-second interaction is acceptable.

## Candidate release targets

These are proposed gates for the current starter-document path, not achieved
claims. They should be measured as p95 over at least 20 cold and warm runs on
each supported device class:

| Operation | Desktop target | Mobile target | Gate status |
| --- | ---: | ---: | --- |
| Editor ready, 1,440 × 960 | ≤ 1.5 s | ≤ 2.5 s | Candidate; instrumentation above is ready, repeated device runs are pending |
| One 10-point paint stroke commit | ≤ 250 ms | ≤ 500 ms | Candidate; current CI sample is ~430 ms including Playwright dispatch |
| PNG export, 1,440 × 960 | ≤ 250 ms | ≤ 500 ms | Candidate; current CI sample is ~4 ms, but physical-device data is pending |
| 16 MP first render/import | ≤ 2 s | ≤ 4 s | Future worker/tile benchmark; no current evidence |

The stroke target is intentionally separated from the current CI sample's
input-dispatch overhead. The app now exposes best-effort operation marks for
pointer-to-paint, render completion, export and IndexedDB save. Each operation
has a unique start/end pair and a stable `pixelforge.<operation>.latest` mark;
the browser acceptance suite verifies `performance.measure` entries named
`pixelforge.paint`, `pixelforge.render`, `pixelforge.export` and
`pixelforge.save` after a real edit. These marks remain local to the browser's
Performance Timeline; they do not include pixels, filenames or user data and
instrumentation failure never interrupts editing. They still cannot prove a
250 ms frame budget. Do not raise the limits or publish these targets as
support guarantees until physical device samples and memory traces exist.

## Worker-render milestone

The worker path is an isolation and responsiveness improvement for committed
frames, not a larger-document guarantee. It sends only the current frame's
referenced raster and mask assets, checks cancellation between layer passes,
reports monotonic completed-layer progress, transfers an `ImageBitmap` (or a
bounded PNG buffer), and reuses one worker between sequential committed
requests before an idle teardown. The browser
suite covers capability detection, cancellation, progress validation, malformed
or forged responses, exact output dimensions, pixel round trips and Canvas2D
fallback. A browser that lacks a usable worker/OffscreenCanvas pair continues to
use the main-thread renderer with the same bounded progress and cancellation
state.

The path remains provisional until repeated physical-device measurements show
that worker scheduling improves responsiveness without unacceptable memory
pressure. Worker image encoding now consumes a shared row-major tile schedule
with a 16 MiB expanded-RGBA batch budget and a 64 MiB hard ceiling. The
isolated `src/tiledCompositor.ts` module now
assembles one expanded tile at a time, writes only inner rectangles, enforces a
retained input/output byte budget, and compares its result with a full-frame
oracle. The visible document path now consumes a source-provider/destination-
sink adapter for the bounded local effect allow-list (Blur More, Box/Gaussian,
Lens, Motion, Shape, Smart, Surface and Fragment; effective radius 1–64);
unsupported, global and cell-phase-sensitive effects remain on the full-frame
fallback. Its pure tests cover exact
neighbourhood-effect parity, cache ownership and deliberate seam detection
when overlap is insufficient. The committed render path also reuses one
worker sequentially with latest-wins cancellation and idle teardown. The
shared tile planner
now has an opt-in byte-bounded LRU cache with cumulative hit/miss, peak-byte
and eviction counters, and the cancellable tile runner can reuse outputs when
a caller supplies a safe retained-byte estimate. This is instrumentation and a
reusable cache boundary; it does not claim that unsupported document effects
or the full-frame result path are tiled, and it does not select a cache size
for any device. Fonts,
CSS filters and colour management may also vary by browser, so representative
pixel/alpha fixtures remain required for each effect family.

## Required scale work before larger documents

The current full-canvas model should remain bounded while the roadmap adds
professional tools. Before increasing the 16 MP limit or calling the editor
industrial-scale, the implementation needs:

1. Harden the worker/`OffscreenCanvas` render path for document frames and
   adjustments. The first full-frame worker slice is now present with
   cancellation, bounded layer progress and a safe fallback; remaining gates
   include worker-aware interactive adjustments and measured responsiveness on
   representative physical desktop and mobile devices. Progress is a layer
   pass indicator, not a streaming or tiled-render claim. The main thread must
   stay responsive while a large frame or adjustment renders.
2. Extend the bounded tile plan (with explicit edge overlap for blur, healing
   and other neighborhood operations) into document rendering so one edit does
   not allocate several full-size surfaces. The serial compositor now validates
   expanded input/output bytes, writes each inner rectangle once and proves
   representative neighbourhood parity against a full-frame oracle. The
   visible adapter now covers the explicit local effect allow-list with exact
   full-frame parity fixtures; tile cache policy, eviction thresholds and
   measured desktop/mobile memory gates remain required before widening the
   effect family.
3. Repeat the operation-level marks for pointer-to-paint, render completion,
   export and IndexedDB save as p50/p95 reports on physical devices. The first
   local instrumentation slice is active and covered by the focused desktop
   and mobile acceptance test; a browser `toDataURL` benchmark alone remains
   insufficient.
4. Memory-pressure tests for 16 MP imports, multi-layer compositions and undo
   trimming. The tiled path now fails with a typed `TiledMemoryBudgetError`
   before committing a destination tile when its working-byte budget is
   exceeded; callers preserve the prior draft and can offer an export/retry
   path. Physical low-memory recovery remains a release gate.
5. Regression gates for offline/local drafts, cloud conflict recovery and
   representative pixel output after worker/tile scheduling changes.

Until those gates pass, large-image, batch and AI operations remain opt-in
roadmap work. Network streaming or realtime collaboration would be a separate
authenticated feature with its own privacy, quota and conflict contract; it is
not implied by local rendering.

## Re-running the baseline

Use the repository's Node 22 toolchain and run:

```sh
CI=1 npm run test:e2e -- tests/browser/performance.spec.ts \
  --project=desktop --project=mobile --workers=1
```

The test output prints a JSON sample and attaches
`performance-baseline.json` to the Playwright report. Keep the browser version,
project, viewport, DPR and commit alongside any comparison; otherwise a timing
number is not reproducible evidence.
