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
| Raster layers in one frame | Device-aware stored layer pixels: 1,024 MP desktop, 384 MP 4 GB, 256 MP phones, 128 MP ≤ 2 GB (1,024 MP format ceiling). Paint layers are stored at their content bounds automatically; see `layer-pixel-budget-contract.md` | Bound the amount of source data retained by an editable frame |
| Layers in one frame | 512 (128 groups) | Keep layer traversal and the inspector bounded |
| Undo/redo history (memory) | 240 frames (`HISTORY_MAX_STEPS`) | Bound retained references and redraw work |
| Referenced history PNG data (memory) | Device-aware: 320 MiB desktop, 128 MiB mobile or ≤ 4 GB `deviceMemory`, 96 MiB ≤ 2 GB (`src/historyBudget.ts`); oldest undo frames trimmed first, redo frames only after every undo frame, the current frame never. The current document's PNG data is bounded by the device budget in `src/projectLimits.ts` (1 GiB desktop, 384 MiB 4 GB, 256 MiB phones, 128 MiB ≤ 2 GB) | Let large documents keep many raster undo steps without unbounded memory on phones |
| Persisted history (draft / project / cloud) | Most recent window around the current frame within 24 frames (draft schema limit), 64 MiB of referenced assets and 4,096 assets (`DRAFT_HISTORY_MAX_*`); the current frame is always persisted, up to the 1 GiB draft ceiling; incremental format 3 saves write only new asset records | Local saves never fail because the in-memory history is larger; older frames are memory-only and the History panel says so |
| Portable `.pixelforge` project and local draft | 1 GiB archive / referenced PNG data and 4,096 assets (format ceiling) | Keep downloads and IndexedDB writes bounded while allowing large layered posters |
| Private cloud project | 16 MiB per document, 30 projects and 256 MiB per library | Preserve the existing Marketplace API quota |
| Tiled effect session cache | Device-aware 2–16 MiB process-local LRU (mobile capped at 4 MiB) | Reuse repeat renders without persisting pixels or allowing unbounded mobile memory |

These are protection limits, not a promise that every device can edit at the
maximum. A 16 MP RGBA surface is approximately 64 MiB before Canvas backing
store overhead; a stroke may temporarily require more than one surface. PNG
URL length is also an encoded representation and does not equal decoded memory.
History budgets count each distinct asset's data-URL length once: browsers keep
these ASCII strings at one byte per character, so the length is the retained
heap cost (the PNG itself is 3/4 of it). Decoded bitmaps are bounded separately
by the decoded-source cache.

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

## Large-document painting findings (2026-11-07)

Measured during a live 2646×4096 (10.8 MP) painting session and in PR
measurements; these are local/live observations, not CI budgets.

- #185 (merged `f5e4135`, deployed) caches per-layer filter output and decoded
  sources: an unrelated opacity edit with two Clouds layers fell from
  4.9–9.7 s to 2.0–3.1 s locally. The tiled blur path is not cached and about
  2 s of full-frame compositing remains.
- Stroke start waits ~2 s to decode the active layer at pointer-down; gesture
  code should reuse decoded layers first-class (P1).
- Every stroke commit re-encodes the full layer to PNG with `toDataURL`;
  dirty-rect commits or tiled layer storage are needed (P1).
- Every `pointermove` triggers a full-canvas preview render (a 12k-point
  stroke took ~5 min); per-animation-frame coalescing shipped in #190
  (`0f390b0`). Stroke-start decode was addressed by #195 (`bf11abd`, warm
  committed pixels; local pointer-down → first dab 678–752 ms → 110–204 ms).
  Per-stroke full-layer commit cost remains: 2.2–2.9 s pointer-up → committed
  and rendered on a full-canvas 2646×4096 photo layer (#207 harness,
  `scripts/measure-stroke-commit.mjs`, local). #213 (`c11b8cb`) stores
  layers of 1 MP or more as content-addressed, Blob-backed 256² tiles and
  encodes only new tiles per commit: the same harness measured 0.48–0.60 s
  against 2.0–3.4 s before (local, one Windows desktop; a new paint layer is
  unchanged within noise). Open: dirty-rect hints, decoded-tile cache,
  dirty-region previews and off-main-thread encoding; `.pixelforge` export
  of a tiled history flattens every version and is slower than before (fix
  wave 4 in the rubric; see
  [`tiled-layer-assets-contract.md`](./tiled-layer-assets-contract.md)).
- Gaussian Blur at radius 24 timed out the render worker at 10.8 MP;
  radius-independent (O(1) per pixel) blurs, faster median filters and a
  work-scaled render watchdog shipped in #191 (`2da6669`); the remaining
  heavy filters followed in #202, #205 and #206 (below).
- Undo history is bounded to 24 steps / 32 MB of data-URL text, which leaves
  one undo step at this size; a device-aware 240-step undo and redo budget
  (320 MiB desktop, 128 MiB mobile, 96 MiB low-memory) shipped in #189
  (merged and deployed `1c40122`).
- Autosave re-serialised tens of MB per edit and failed once the payload
  crossed 64 MB; #186 (merged `f95ec93`, deployed) stores content-addressed
  assets so each save writes only new assets (local benchmark: ~1.8 s vs
  ~0.1 s per save at 30 MB).
- Project limits (64 MP stored layer pixels, 64 MB asset/draft caps) force
  flattening on large posters; #193 (`92af070`) raised them to 512 layers
  and device-aware budgets (desktop 1,024 MP / 1 GiB) with content-bounds
  paint layers. #203 (`aed3fd8`) cut a 617 MB, 320-layer project's open from
  ≈ 230 s to ≈ 79 s and reload from 175 s to 53 s (local); `.pixelforge`
  export stayed at ~107 s. 600 MB+ projects remain slow (fix wave 3 in the
  rubric).
- Gaussian Blur radius ≥ 24 on the 10.8 MP layer hit the fixed 30 s worker
  watchdog ("Worker rendering timed out"): the separable kernel cost O(radius)
  per pixel. `perf/fast-large-radius-filters` keeps the exact kernel
  (bit-identical) for radius ≤ 8 and uses three cascaded box filters with
  matched variance and support ≤ radius above that, so cost no longer grows
  with radius, and scales the watchdog with pixels × layers (see
  [worker-render-contract.md](worker-render-contract.md)). Tolerance against
  the exact kernel, enforced by `tests/gaussian-blur.test.mjs`: opaque images
  within 3 levels (mean ≤ 1.5); since the blur also spreads alpha (see
  [blur-effects-contract.md](blur-effects-contract.md)), images with
  transparency are compared as composited premultiplied colour plus alpha,
  within 10 levels (mean ≤ 2.5). Integer running sums keep tiled
  and full-frame renders bit-identical. Median, Dust & Scratches and
  Reflection Removal now use sliding histograms, and Motion Blur precomputes
  its taps; all four are byte-identical to before.

- Dodge, Burn, Sponge, Smudge, Blur, Sharpen, Mixer/History brushes, Color
  Replacement and Background Eraser strokes stayed slow after #217 although
  their previews already went through the render worker: every pointer move
  ran the tool kernel on the whole layer (full-layer `getImageData` of source
  and buffer, per-byte validation, a full copy, a full-frame stamp mask and a
  full `putImageData`). That blocked the main thread for 0.17–0.5 s per move,
  and each blocked move was followed by its own preview, which looked like a
  full-stack re-render per move ("Rendering… 0/51 → 50/51" every ~0.5 s).
  `perf/retouch-tool-worker-previews` runs each segment on its brush window
  only (`src/strokeWindow.ts`, byte-identical to the full-layer kernels in
  `tests/stroke-window.test.mjs`). Local probe, release build, desktop Chrome,
  2646×4096 photo, 47 layers (23 with live Clouds at 20 % opacity), the edited
  photo copy at index 23, 25 moves paced at one per animation frame, size 80:

  | Tool | Moves dispatched, before → after | Until settled, before → after |
  | --- | --- | --- |
  | Brush (reference) | 0.47 → 0.50 s | 1.6 → 1.5 s |
  | Dodge / Burn / Sponge | 11.3 / 11.9 / 12.4 → 0.48 / 0.57 / 0.60 s | 12.2 / 13.0 / 13.4 → 1.5 / 1.7 / 1.8 s |
  | Smudge | 8.8 → 0.52 s | 10.0 → 1.5 s |
  | Blur / Sharpen | 5.9 / 6.4 → 1.2 / 0.85 s | 6.9 / 7.4 → 2.4 / 1.8 s |
  | Mixer Brush / History Brush | 4.2 / 4.3 → 1.4 / 0.90 s | 5.2 / 5.5 → 2.2 / 1.8 s |

  After the change every preview rendered in the worker and (after the first,
  which builds the snapshot) started from the cached composite of the 23
  layers below. Each preview still costs 0.4–0.9 s here because the 23 layers
  above the edited one are composited per preview (their filter outputs come
  from the cache); previews coalesce, so a 25-move stroke shows 2–4 of them. A
  suffix cache or dirty-rect recompositing (roadmap W3-8/W4-8) is the next
  step. One machine, one run each; live builds are not verified.

### Radius-heavy filter timings (local, Node 24, 1 MP unless noted)

These are single-run local measurements on a shared development machine
(timings varied by up to ~2× between runs), not CI budgets.

| Filter (radius 64 or its cap) | Before | After |
| --- | --- | --- |
| Gaussian Blur, 2646×4096, r 12 / 24 / 64 | 17.0 / 31.0 / 75.1 s | 2.3–3.5 s (any radius) |
| Gaussian Blur, browser 2646×4096 r 12 / 24 / 64 (render span) | 19.5 s / timeout / timeout | 4.9 / 7.1 / 7.1 s |
| Gaussian Blur, Unsharp Mask, High Pass, Sharpen More/Edges | 5.9–13.8 s | 0.3–0.7 s |
| Median, Dust & Scratches (cap 8) | 171–175 s | 0.8–1.0 s |
| Motion Blur | 3.4 s | 1.7 s |

### Remaining neighbourhood filters (`perf/fast-remaining-filters`)

Smart Blur, Smart Sharpen, Surface Blur, Shape Blur, Reduce Noise, Lens,
Radial (spin and zoom), Spin and Path Blur now run through
`src/fastNeighborhoodFilters.ts`. `tests/fast-remaining-filters.test.mjs`
keeps the previous per-pixel kernels as oracles:

* **Byte-identical:** Surface Blur, Reduce Noise, Lens Blur, zoom Radial Blur,
  authored and legacy Path Blur.
* **≤ 1 level:** Smart Blur (range weight `exp(-|ΔL|/s)` factored into
  per-pixel `exp(±L/s)`, no `exp` per sample) and Shape Blur (exact integer
  double prefix sums: each diamond-kernel row is a 1-D tent, O(radius) per
  pixel instead of O(radius²)); only .5 rounding ties can move, asserted on
  < 0.2 % of channels. Smart Sharpen inherits Smart Blur's reference, so a
  rare channel can move a few levels (asserted ≤ 12, mean < 0.05).
* **Rounding ties only:** spin Radial Blur and Spin Blur rotate the centre
  offset with a cosine/sine table instead of `cos`/`sin` of the summed angle;
  a sample within ~1e-12 px of a pixel-rounding boundary may pick its
  neighbour (asserted mean < 0.05 levels, < 0.2 % of channels).

Other changes: per-row kernel functions (V8 optimises them normally instead of
repeatedly entering on-stack-replaced loops), padded per-band planar float
copies so the bilateral-style windows have fixed bounds and no bounds checks,
branch-free weights where the data makes branches unpredictable, tabulated
spatial/similarity weights, merged duplicate Lens taps with interior offsets,
and allocation-free bilinear sampling for Path Blur. Tiled and full-frame
renders stay identical (pure seam tests), and cancellation/progress semantics
are unchanged.

Local, Node 24, single-threaded on a shared 2.4 GHz Xeon E5-2699A v4 at
~40 % background load; best of 2 interleaved old/new runs at 1 MP, one run
at 10.8 MP. Timings varied by up to ~1.5× between runs; these are not CI
budgets.

| Filter (radius) | 1 MP before → after (s/MP) | Speed-up | 2646×4096 before → after (s) |
| --- | --- | ---: | --- |
| Smart Blur (8) | 11.7 → 2.6 | 4.5× | 139.4 → 36.0 |
| Smart Sharpen (8) | 11.8 → 2.9 | 4.1× | 139.7 → 36.4 |
| Reduce Noise (8) | 13.7 → 3.0–3.6 | 4.5× | 148.0 → 46.7 |
| Surface Blur (8) | 4.6 → 2.3 | 2.0× | 53.1 → 30.4 |
| Shape Blur (12) | 5.0 → 0.55 | 9.2× | 59.3 → 7.6 |
| Radial Blur, spin (32) | 1.5 → 0.68 | 2.2× | 21.4 → 10.5 |
| Radial Blur, zoom (32) | 0.80 → 0.61 | 1.3× | 8.4 → 8.5 |
| Spin Blur, ellipse (32) | 1.75 → 0.64 | 2.8× | 24.8 → 11.3 |
| Path Blur, authored (32) | 0.47 → 0.37 | 1.3× | 3.0 → 2.2 |
| Path Blur, legacy (32) | 2.0 → 2.0 | 1.0× | 26.2 → 22.9 |
| Lens Blur (32) | 0.91 → 0.52 | 1.8× | 10.0 → 6.6 |

In the browser (Playwright, 2000×2000 opaque noisy image, render worker,
local run) Smart Blur, Smart Sharpen and Reduce Noise at radius 8 settled in
12–21 s and Shape Blur at radius 12 in ~4 s, all with no watchdog notice;
`tests/browser/fast-remaining-filters.spec.ts` asserts this under 40 s / 12 s
watchdogs that the previous kernels (~45–60 s / ~20 s at 4 MP) would exceed.

Still not under 1 s/MP, and why:

* Smart Blur, Smart Sharpen, Surface Blur and Reduce Noise evaluate a
  data-dependent, non-separable weight for every one of the (2r + 1)² = 289
  samples at radius 8. A single-threaded JavaScript loop costs ~8–10 ns per
  sample on this machine, so ~2.3–3.6 s/MP is close to the floor for an
  exact (or ≤ 1 level) result. A bilateral grid or quantised-range histogram
  would change the spatial kernel or the threshold decisions and move pixels
  by several levels, so it was not adopted. Further gains need parallelism
  (splitting a layer into row bands across nested workers) or Wasm SIMD.
* Legacy Path Blur (records without authored points, the state of a freshly
  applied Path Blur) keeps its per-sample rounded premultiplied bilinear
  sample for byte-exact output; dropping that rounding measured only ~1.6×
  faster and would change output, so it was left exact.

On a 10.8 MP layer the bilateral family still needs ~30–47 s. That is now
inside the scaled watchdog's ~95 s no-progress window for one layer (30 s +
6 s/MP); before, the ~140–150 s Smart Blur, Smart Sharpen and Reduce Noise
renders exceeded it. Tiled Smart/Surface renders report per-tile progress,
but full-frame Reduce Noise and Smart Sharpen report progress only per layer.
(Superseded by the filter worker pool below.)

### Parallel filter workers (`perf/parallel-neighborhood-filters`)

Heavy neighbourhood filters on layers of at least 0.5 MP now run in a pool of
filter workers separate from the render worker (see
[worker-render-contract.md](worker-render-contract.md#filter-worker-pool-parallel-bands-and-tiles)).
Full-frame filters run as row bands with halo rows, and tiled filters keep
several tiles in flight. Output is byte-identical to the serial kernels, and
each completed band restarts the no-progress watchdog. Pool size is
`hardwareConcurrency − 1`, capped at 8 on desktop and 2 on phones or
devices reporting `deviceMemory ≤ 4`. WebAssembly SIMD was not needed for
the desktop target and was not added.

Local measurements: Node 24 `worker_threads` running the same pool code, on
the shared 2.4 GHz Xeon at ~40 % background load. "Serial" is the single-thread
kernel from #202. The 1 MP pool times include each worker's JIT warm-up.

| Filter (radius 8; legacy Path 32) | 1 MP serial → 8 workers (s/MP) | 2646×4096 serial → 8 workers (s) | 2646×4096, 2 workers (phone cap) (s) |
| --- | --- | --- | --- |
| Smart Blur | 3.0 → 0.85 | 36.0 → 5.3 (0.49 s/MP) | 17.6 |
| Smart Sharpen | 4.2 → 0.79 | 36.4 → 4.9 (0.45 s/MP) | 18.2 |
| Reduce Noise | 3.8 → 1.09 | 46.7 → 5.8 (0.54 s/MP) | 20.7 |
| Surface Blur | 2.6 → 0.56 | 30.4 → 4.1 (0.38 s/MP) | 15.5 |
| Path Blur, legacy | 2.0 → 0.38 | 22.9 → 2.9 (0.26 s/MP) | 10.9 |

Browser, local Playwright on a 44-thread host, 2000×2000 at radius 8,
measured as render settle time including import overhead:

| Filter | Desktop project (8 workers) | Mobile project (Pixel 7 emulation, 2 workers) |
| --- | ---: | ---: |
| Smart Blur | 3.4 s | 7.0 s |
| Reduce Noise | 2.4 s | 8.5–9.1 s |
| Smart Sharpen | 2.9 s | 7.0 s |

A 6.8 MP Reduce Noise run with 2 workers took ~14 s under an 8 s no-progress
window and completed, because each band restarts the window.

Limits:

* The speed-up scales with spare cores. Phones stay at about 1.5–1.9 s/MP by
  design, to bound memory and heat.
* Layers under 0.5 MP and the remaining filters stay serial.

### Pool polish (`perf/filter-pool-polish`)

* **Halo rows are no longer rendered.** Band-safe kernels accept an output row
  range: halo rows are read as neighbours but not filtered. On small layers
  the halo was 16–37 % extra work. Output is unchanged
  (`tests/filter-pool-polish.test.mjs`).
* **Pre-warm.** Opening the Filter menu, or choosing a heavy filter, warms
  the pool at idle time. It starts every filter worker and runs each heavy
  kernel once on a 96×40 band so it is JIT-compiled. Warm-up targets the
  pool that will render: the render worker's nested pool for frames of at
  least 2 MP, otherwise the main thread's pool. It is skipped below 0.5 MP.
* **Cancellation interrupts work already in flight.** A cancelled tiled
  render terminates the filter workers running its tiles, as the band path
  already did; the pool refills lazily with fresh workers. Render-worker
  cancellation is a predicate, so busy jobs poll it every 50 ms.

Measurements: local Node 24 `worker_threads`, same shared Xeon at ~40 %
background load, Reduce Noise radius 8 at 1 MP, first filter on a fresh
pool:

| Workers | Cold pool (s/MP) | Pre-warmed (s/MP) |
| ---: | ---: | ---: |
| 8 | 0.93 | 0.79 |
| 3 (4-core configuration) | 1.73 | 1.63 |

4-core configuration (3 workers) at 2646×4096: Smart Blur 1.39, Smart
Sharpen 1.34, Reduce Noise 1.58, Surface Blur 1.22 and legacy Path Blur
0.92 s/MP. Serial on the same machine is 2.1–4.3 s/MP. So the ~1 s/MP
estimate for four cores was **not confirmed** on this loaded 2.4 GHz host:
three workers give ~2.6× over serial, not 3×+. A faster, unloaded 4-core
desktop may reach it, but that has not been measured.
