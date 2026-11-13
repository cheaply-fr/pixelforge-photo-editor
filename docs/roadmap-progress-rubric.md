# Roadmap progress rubric

## Current implementation audit — 2026-10-26

This audit is the authoritative separation between capabilities present in the
current source tree and capabilities still requiring implementation or release
evidence. Percentages are not completion claims; a capability is credited only
when its contract and tests exist, and release/live gates remain separate.

| Weighted stage | Implemented and evidenced locally | Remaining implementation or evidence |
| --- | --- | --- |
| Document model and persistence (18%) | Versioned raster, text, vector, folder, mask, adjustment, style, artboard, smart-object and link metadata; immutable source assets; migration, corruption rejection, undo/reload and portable-project tests. | Full Photoshop document graph, layered PSD/PSB/RAW/TIFF/PDF/SVG round trips, provider-backed/cloud-linked assets and complete colour-management parity. |
| Selection and precision geometry (14%) | Marquee variants, lasso family, magic wand, colour range, object-selection proxy, quick selection, selection brush, refinement/morphology, feather, quick mask, named selections, transforms and cancellation tests. | Semantic object recognition, hair/edge reconstruction and the remaining advanced non-contiguous/refinement semantics. |
| Painting and retouching (14%) | Brush, pencil, eraser, fill, gradient, colour replacement, clone, healing, patch, dodge, burn, sponge, smudge, blur/sharpen brushes, mask refinement, pattern stamp, pressure fallback and persisted bounded dynamics. | Full physical wet-media/bristle simulation, pressure curves, semantic cleanup and generative object removal. |
| Typography and vectors (10%) | Editable horizontal/vertical text, language/direction metadata, OpenType presentation flags, bounded variable `wght`/`wdth`/`opsz` axes, warp styles, find/replace, pen Bézier handles, direct selection, compound booleans, text-on-path, parametric shapes and SVG serialization. | Language-specific shaping, hyphenation layout, font embedding/provider fonts, full variable-axis interpolation and unsupported mixed/open boolean operands. |
| Adjustments and filters (14%) | Nondestructive light/colour controls, Camera Raw/local AI approximations, blur/gallery, distort, render, noise, pixelate, sharpen, stylize/video families, tiled deterministic rendering, metadata persistence and representative pixel tests. | Full Photoshop gallery family breadth, mesh/liquify parity, ICC/HDR/linear-light behaviour, physical material/wet-media effects and model-backed inference. |
| History, projects and exports (12%) | Immutable history/timeline, branch-safe undo, local drafts/recovery, project JSON, PNG/JPEG/WebP, bounded flattened PSD/PDF, batch export, artboards, privacy metadata and cancellation/error isolation. | Editable layered interchange, full colour/profile/metadata round trips, and independent live export-pixel acceptance for the deployed revision. |
| Accessibility, mobile and scale (10%) | Keyboard/focus/reduced-motion semantics, desktop/mobile Playwright coverage, touch targets, responsive packed toolbar, tiled rendering budgets, worker cancellation and offline/local-first boundaries. | Physical-device/assistive-technology certification, broader offline recovery and remaining performance budgets under production-scale documents. |
| Interoperability and optional intelligence (8%) | Explicit capability labels for HEIC/TIFF/SVG/PDF/PSD/RAW, safe local sanitization/rasterization, deterministic local Generate Image/Content-Aware/AI approximations and privacy disclosures. | Semantic object/background intelligence, provider-backed plugins, folder watchers, synchronized cloud recipes/links and full unsupported-format round trips. |

### Evidence status

The current source tree has local contracts and tests across all eight stages.
The latest local pure suite is **906/906**, and local lint, typecheck and build
pass. Protected workflow run **40252797399** completed successfully for
`dfde45d771c34fe209cf46b38837c6dcd73ab425`, including all four desktop/mobile
validation shards and the production deployment job. The public editor shell
returns HTTP 200 at `https://photoeditor.cheaply.fr` with the expected PixelForge
title. Independent live export-pixel verification remains blocked by
intermittent browser/network download behaviour, so the roadmap does not claim
full live acceptance or completion.

## Release evidence — 2026-11-04 (`1218cd5`)

Merged on 2026-11-03/04 from a dogfooding pass that recreates a dense
reference artwork in the live editor:

| PR | Change | Protected PR CI | Main run | Live |
| --- | --- | --- | --- | --- |
| #171 | Every palette tool has a distinct, canonical icon | green | 41737850466 cancelled (superseded) | icons verified distinct (27/27 visible slots) |
| #172 | Layer → Rasterize bakes live filter effects | green | 41738215678 cancelled (superseded) | Clouds → Rasterize → Gradient Map keeps the texture |
| #173 | Editor fits 681–1240 px windows (two-row header) | green | **41739009345 success, deployed** | 707 px window: no overflow, inspector reachable |

`/release.json`, `/health` and `/api/readyz.json` report
`1218cd5ef932cfa09f51056a13a06bd30b8a76f1`, built 2026-11-03T23:27:01Z,
`ready: true`. The earlier `main` run for `fdf819c` (docs only) failed on
`layer-styles.spec.ts:34`, which also fails locally; that test is an open
release risk because a failing shard skips deployment.

### Gaps logged from the artwork pass (not yet implemented)

1. **True pixel zoom** — implemented on `feat/pixel-zoom`
   (`docs/view-zoom-contract.md`). The shipped zoom is a stage-width
   percentage capped at 1200 CSS px, so large images cannot be viewed at 100%.
2. **Render Clouds** ignores foreground/background colours, does nothing on a
   transparent layer, and caps scale at 64 px (too small for 4096 px images).
   Implemented on `feat/clouds-colors` (`docs/clouds-effect-contract.md`).
3. **One live filter per layer**; there is no Smart Filter stack, and Filter →
   Convert for Smart Filters is disabled while Layer → Convert for Smart Filters
   is enabled. Raster-layer filter stacks (Add filter to stack, hide/show,
   reorder, remove) shipped in #199 and in-place editing in #204
   (2026-11-07).
4. **Tool options are buried** ~7,000 px down the inspector; an options bar
   near the canvas is needed.
5. **No sized File → New dialog**; new documents are fixed at 1200×800.
6. Add paint layer switches the active tool to Brush. This is deliberate
   (`addPaint` calls `setTool('brush')`) and several specs rely on it; it
   differs from Photoshop and is a product decision, not a defect.
7. `layer-styles.spec.ts:34` fails intermittently in CI and locally. Cause:
   the spec copies the full 1200×800 canvas (3.84M numbers) over the browser
   protocol four times and deep-compares the arrays, exceeding its 120 s
   budget under load. Fixed on `test/layer-styles-pixel-hash` by comparing an
   in-page fingerprint.
8. **Layer pixel budget was opaque**: at 2646×4096 the sixth full paint layer
   failed with `Invalid layer document` while the panel said `5 / 32`.
   Addressed on `feat/layer-pixel-budget` (`docs/layer-pixel-budget-contract.md`),
   merged as #183 (`8a82ad6`, see the 2026-11-07 section below):
   a specific budget notice, a Layers-panel usage hint, Layer → Trim Layer to
   Content, and paint-time expansion for the brush/eraser/fill/gradient/retouch
   tools. Remaining: automatic trimming of new layers, expansion for Spot
   Healing/Patch/Red Eye/History brushes and filters on trimmed layers.

## Large-document painting findings (2026-11-07)

Source: painting a 2646×4096 (10.8 MP) "cosmic eye" poster in the live
editor on 2026-11-07. This section adds evidence lines only; the weighted
percentages and the 2026-10-26 audit table are unchanged until a full
re-audit reconciles them. Nothing here claims Photoshop parity.

### Shipped

#181–#185 are merged to `main`. Protected `CI and deploy` run
**42326133241** succeeded for `f5e4135` (it contains #181–#183 and #185; the
run for `fab25db` was cancelled as superseded) and run **42330980594**
succeeded for `cba6253` (#184). On 2026-11-07 `/release.json` and
`/api/readyz.json` at `https://photoeditor.cheaply.fr` reported
`cba6253bc8763f05064c4a16a55ac31f2af2e7e4` (built 2026-11-07T02:48:42Z,
`ready: true`), which contains #181–#185. That is release-identity
evidence; per-feature live acceptance of each fix has not been independently
re-run for this record.

| PR | Change | Merge SHA | Deployed in | Remaining limitations |
| --- | --- | --- | --- | --- |
| #181 | Gradient "Transparent" end fades the adjacent colour to alpha 0 (it previously faded to transparent white, leaving a grey fringe) | `8def856` | `f5e4135`, `cba6253` | — |
| #182 | Lasso, Polygonal Lasso and Magnetic Lasso selections that leave the canvas are clipped to it instead of rejected with "Invalid layer document"; an off-canvas Elliptical Marquee keeps its true shape; Rectangular Marquee off-edge overshoot fixed | `fab25db` | `f5e4135`, `cba6253` | — |
| #183 | Layer pixel budget (64 MP total) explained with a specific message and a Layers-panel readout; Layer → Trim Layer to Content; paint tools grow trimmed layers on demand | `8a82ad6` | `f5e4135`, `cba6253` | No automatic trim; Spot Healing, Patch, Red Eye, History and Art History brushes do not grow trimmed layers; painting a trimmed layer costs two undo steps (expansion + stroke). **All three addressed by #193** (automatic content-bounds storage for stored-bounds layers, all paint tools grow in place, one undo step) |
| #185 | Per-layer filter-result cache and decoded-asset cache (≈2.5–3× faster unrelated edits on large documents, local measurement) | `f5e4135` | `f5e4135`, `cba6253` | Tiled blur path not cached; ~2 s compositing remains at 10.8 MP; pointer-down decode wait unchanged |
| #184 | Brush, Pencil, Eraser, Mask Brush/Eraser and Adjustment Brush confined to the active selection with feathered edges | `cba6253` | `cba6253` | Clone/Heal stamping still ignores the selection; "Mask from selection" leaves the selection active (Photoshop consumes it). **Both addressed by #196** (Spot Healing/Patch by #201) |
| #186 | Incremental local draft saves: content-addressed IndexedDB asset records (`asset:<draftId>:<sha256>`) so autosave writes only new assets instead of re-serialising tens of MB per edit; one read-write transaction per save, fail-closed reads | `f95ec93` | `f95ec93` | Assets remain base64 PNG data URLs (Blob-backed assets: fix wave 3, W3-1); benchmark is local only |
| #187 | Painting Size 1–5000 px (was 1–100), perceptual slider, proportional `[` / `]` steps, fast large dabs | `6a42943` | `6a42943` | — |
| #189 | 10× device-aware undo **and** redo: 240 steps, image budget 320 MiB desktop / 128 MiB mobile or ≤4 GB / 96 MiB ≤2 GB (was 24 steps / 32 MB, one undo step on a 2646×4096 document); History panel states capacity and marks memory-only states | `1c40122` | `1c40122` | Only the persisted window (≤24 states, ~48 MiB) survives reload; assets remain base64 PNG data URLs (W3-1) |

Later releases: `CI and deploy` run **42331771754** succeeded for `f95ec93`
(#186) and `/release.json` reported
`f95ec93e3fdc5039df972e1e37b06231509a426d` (built 2026-11-07T02:59:08Z).
Run **42332588876** succeeded for `6a42943` (#187) and `/release.json` then
reported `6a429436acc6595468f808961eb1c053cbdae97f` (built
2026-11-07T03:09:13Z). Release identity only; per-feature live acceptance
was not re-run.

**"This draft changed in another tab" root cause (fixed in #186).** The
spurious conflict seen with a single visible tab was cross-tab, not an
in-tab race: New document writes `localStorage['pixelforge:last-draft']`,
and any `/editor` tab opened without a `#draft=` hash in the same browser
profile attached to that draft and saved on load, bumping its revision, so
the original tab's next save reported a conflict. Each editor tab now holds a
shared Web Lock `pixelforge:draft-open:<id>`; a hashless open that would fall
back to `last-draft` checks `navigator.locks.query()` and starts a new draft
(with a notice) if that draft is open elsewhere. Explicit `#draft=` bookmarks
keep the conflict flow. Locks are advisory; browsers without Web Locks behave
as before.


`CI and deploy` run **42334414490** succeeded for `1c40122` (#189) and
`/release.json` reported `1c40122cc42a9295ddf586827c15912cf2aeda74` (built
2026-11-07T03:32:54Z). This docs record merged as #188 (`40b0e30`).

### Fix wave 2 — merged and deployed (2026-11-07)

Following the user's request to document and roadmap every finding, each
remaining item got a workstream (table below). All of them are now merged
to `main`. Status was rechecked for this record with
`gh pr view <n> --repo cheaply-fr/pixelforge-photo-editor`,
`gh run list --branch main --workflow "CI and deploy"` and
`/release.json`.

Release evidence: each PR's first protected `CI and deploy` run that
succeeded on `main` is listed. Runs for some merge commits were cancelled
because a newer merge superseded them; those PRs were deployed by the next
successful run, which contains them. `/release.json` and `/api/readyz.json`
at `https://photoeditor.cheaply.fr` reported `257e744dea66609414d3859dde2c9404b04806bc` (built 2026-11-07T17:24:50Z, run **42396097704** succeeded)
(`ready: true`), which contains every PR below. That is release-identity
evidence only: per-feature live acceptance of each change was not re-run
for this record, and all measurements quoted are local (headless Chromium
or Node on one shared Windows/Xeon host), not CI budgets or production
timings. Nothing here claims Photoshop parity.

| PR | Change (bounded local approximations) | Merge SHA | First deployed in (run) | Remaining limitations (from the PR) |
| --- | --- | --- | --- | --- |
| #190 | Live stroke previews coalesced to at most one render per animation frame with one in flight (every pointer event is still stamped); identity canvas filters skipped. Local: 500 moves 201 s → 15.6 s | `0f390b0` | `0f390b0` (42365557583) | Each preview still composites the full frame (~90 ms at 10.8 MP headless); `getCoalescedEvents()` not read, so browser-coalesced points are dropped when the main thread is busy |
| #191 | Radius-independent Gaussian Blur above radius 8 (exact kernel ≤ 8), sliding-histogram Median / Dust & Scratches / Reflection Removal, faster Motion Blur, work-scaled render watchdog with a recoverable timeout message | `2da6669` | `2da6669` (42370393394) | Gaussian above radius 8 is a three-box approximation (opaque ≤ 3 levels; partly transparent edge pixels up to ~10 %) |
| #192 | Docs: fix-wave-2 workstreams | `e841a25` | `e841a25` (42366375289) | — |
| #193 | Huge projects: 512 layers / 128 groups (was 32 / 32), 4,096 assets; device-aware stored-pixel and data budgets (desktop 1,024 MP / 1 GiB; 4 GB 384 MP / 384 MiB; mobile 256 MP / 256 MiB; ≤ 2 GB 128 MP / 128 MiB); new paint layers store one pixel and grow in place; committed paint layers stored at content bounds + 64 px; prefix composite cache for ≥ 8 layers; `.pixelforge` up to 1 GiB | `92af070` | `92af070` (42374575430) | Import/reload of projects with hundreds of MB of PNG data was too slow (partly addressed by #203); destructive filters, Apply Image and Calculations acted on stored bounds (Apply Image/Calculations fixed in #203, Perspective/Puppet Warp in #207). Limits are browser-safety budgets |
| #194 | Brush Spacing 1–1000 %, Scatter 0–1000 %, Scatter both axes, Count 1–16, Count/Size/Angle/Opacity jitter, pen lift at pressure 0; Gradient Replace, separable blend modes and opacity | `5b7bc63` | `137ef33` (42369674269) | No live gradient preview, one-sided Count jitter and first-dab scatter (all fixed in #201) |
| #195 | Warm stroke start: committed stroke pixels seed the decoded-asset cache and (≥ 2 MP) are transferred to the render worker. Local 2646×4096: pointer-down → first dab 678–752 ms → 110–204 ms; pointer-up → commit rendered 1.6–2.0 s → 0.6–1.05 s | `bf11abd` | `bf11abd` (42372064924) | First stroke after import unchanged (~600 ms); every commit still re-encodes the whole layer (`toDataURL` ~300 ms at 10.8 MP) — see tiled layer assets below |
| #196 | Clone Stamp, Healing Brush, Pattern Stamp, Red Eye, Color Replacement, Background Eraser and Magic Eraser confined to the active selection; Alt-click clone source kept while the previous stroke commits, on-canvas source crosshair, Healing accepts Alt-click; Layer → Mask from selection deselects in the same undo step | `137ef33` | `137ef33` (42369674269) | Spot Healing and Patch ignored vector selections (fixed in #201) |
| #197 | 26 layer/folder blend modes (shared catalogue, software modes rendered once through `renderFrame` for viewport, worker, export, merge, PSD/PDF); Outer Glow and Inner Glow; Drop/Inner Shadow blur up to 250 px, offsets ±1000 px; separable erosion | `f37a4f8` | `bf11abd` (42372064924) | Glow blend applied only against the layer's own pixels and shadows used a linear box falloff (both addressed by #204); Soft Light uses the W3C formula |
| #198 | OS clipboard image paste handled on `document` (focus on `<body>` no longer loses it), Edit → Paste Image from Clipboard, 300 ms async-Clipboard fallback; hardened downloads (`src/download.ts`: attached anchor, per-download URL revoked after 60 s, MIME from filename) and **Save with file picker…** / **Save project with file picker…** where File System Access exists | `bf93da1` | `bf93da1` (42373085044) | Whether the Claude desktop built-in browser now writes the PNG is unverified (cannot be reproduced in CI); the file picker is the workaround |
| #199 | Filter stacks on raster layers (Add filter to stack, up to 8; hide/show, reorder, remove; one undo step each); filter centres at 1e-6 precision with px fields and an on-canvas crosshair (keyboard nudges); Twirl and Polar Coordinates gain centres | `455cc3b` | `bf11abd` (42372064924) | In-place editing of stacked entries (added in #204); per-filter blend modes and masks; picking a filter from the menu still replaces the live one (stacking is explicit) |
| #200 | Reference / guide image: document-level overlay (File → Place reference image…, Reference image panel), never exported, flattened or merged, outside the layer count and pixel budget; opacity, fit, lock, eyedropper sampling option; persisted in drafts and projects | `51a7ba4` | `92af070` (42374575430) | Stored downscaled to a 2048 px longest edge; its PNG still counts toward the per-document asset byte limit |
| #201 | Spot Healing and Patch confined to any selection shape via a stored layer-space selection mask (survives Deselect, undo, reload); live gradient preview through the #190 scheduler (≤ 1.5 MP per frame on large layers); symmetric Count jitter; first dab scatters perpendicular when both axes are off; selection snapshots cached | `521188b` | `257e744` (42396097704) | Reduced gradient preview can differ from the commit by a few levels and previews Noise/Dither at that scale; the full-document composite per preview frame is unchanged; a never-seen selection costs one rasterization and PNG encode |
| #202 | Faster Smart Blur, Smart Sharpen, Reduce Noise (~4–4.5×), Surface Blur (2×), Shape Blur (9×), Spin/Radial/Lens (1.3–2.8×), byte-identical or ≤ 1 level against oracle tests | `02124b4` | `02124b4` (42378078818) | Serial bilateral family still ~2.3–3.6 s/MP; legacy Path Blur ~2 s/MP (both then parallelised by #205) |
| #203 | Large-project open/reload/re-render: worker keeps assets by content key and receives only new ones; native base64 decode/encode; install no longer pre-decodes what the first render decodes. Local 617 MB / 320-layer project: open ≈ 230 s → ≈ 79 s, reload 175 s → 53 s, re-render ~2 s → 0.3 s, draft save 2.6 s → 0.44 s. Apply Image / Calculations grow stored-bounds layers | `aed3fd8` | `cc3c465` (42382062711) | `.pixelforge` export unchanged (106 s → 107 s incl. harness download); data-URL asset model kept; tiled and Blob-backed assets left to a follow-up |
| #204 | Non-Normal Outer Glow / Drop Shadow composite onto the pixels beneath the layer; Drop Shadow blend mode; **Falloff: Gaussian / Linear (legacy)** (new layers Gaussian, stored shadows unchanged); **Edit stacked filter** in place | `4552ed6` | `cc3c465` (42382062711) | Folder members blend only against the folder's lower members; clipped layers' outer effects see no backdrop; each pass applies the layer's filter separately; no Knockout, Fill opacity, per-filter blend modes or masks; Gaussian shadow ≈ 20 % slower |
| #205 | Parallel filter worker pool (`hardwareConcurrency − 1`, ≤ 8 desktop, ≤ 2 phones / `deviceMemory ≤ 4`) for Smart Blur, Smart Sharpen, Surface Blur, Reduce Noise, Shape, Lens and legacy Path Blur; byte-identical bands/tiles, band progress restarts the watchdog, serial fallback. Local 10.8 MP, 8 workers: 0.26–0.54 s/MP (serial 2.1–4.3) | `cc3c465` | `cc3c465` (42382062711) | Speed-up scales with spare cores; the 4-core ~1 s/MP figure was an estimate; phones stay ~1.5–1.9 s/MP by design; layers < 0.5 MP stay serial |
| #206 | Filter pool polish: cancelled tiles terminate busy workers (50 ms polling), halo rows read but not filtered, Filter-menu / heavy-filter pre-warm. Local 1 MP Reduce Noise on 8 workers 1.09 → 0.79 s/MP pre-warmed | `32a2d37` | `32a2d37` (42384521974) | 4-core configuration (3 workers) measured 0.92–1.58 s/MP at 10.8 MP on the loaded host — ~1 s/MP not confirmed |
| #207 | Perspective Warp, Vanishing Point and Puppet Warp grow a stored-bounds paint layer to the canvas first (canvas-space handles) and re-store the result at content bounds, one undo step; `scripts/measure-stroke-commit.mjs` local harness | `257e744` | `257e744` (42396097704) | Baseline for tiled assets: full-layer stroke commit 2.2–2.9 s at 2646×4096 (new paint layer 0.48–0.58 s); tiled and Blob-backed assets not started in this PR |

Workstream mapping (original scope, now shipped):

| Workstream | Branch → PR | Original scope |
| --- | --- | --- |
| A | `feat/huge-projects` → #193 | "Don't flatten — handle huge projects": ~10× limits, automatic trim to content, lazy empty layers, render scaling. Shipped limits exceed the planned 320 layers / 640 MP / 640 MB (see #193 row) |
| B | `perf/coalesce-stroke-previews` → #190; `perf/stroke-start-and-commit` → #195 | Per-frame previews; stroke-start decode latency. Per-stroke full-layer commit cost remains (fix wave 3) |
| C | `perf/fast-large-radius-filters` → #191; `feat/filter-centers-and-stacks` → #199 | Radius-independent blurs and scaled watchdog; precise / on-canvas filter centres and raster filter stacks |
| C2 | `perf/fast-remaining-filters` → #202 | Remaining slow neighbourhood filters |
| C3 | `perf/parallel-neighborhood-filters` → #205 | Parallel filter worker pool |
| C4 | `perf/filter-pool-polish` → #206 | Tile cancellation, halo-free bands, pre-warm; 4-core measurement |
| D | `fix/retouch-selection-and-clone-source` → #196 | Retouch tools respect the selection; Alt-click source kept; Mask from selection deselects |
| E | `feat/glow-styles-and-blend-modes` → #197 | Blend modes; Outer/Inner Glow; larger shadow ranges |
| F | `feat/brush-gradient-options` → #194 | Sparse stamping, count/jitter, pen lift; gradient modes and opacity |
| G | `fix/os-paste-export-downloads` → #198; `feat/reference-layer-paste-export` → #200 | OS clipboard image paste, hardened downloads; non-exported reference image |
| Polish | `feat/retouch-brush-polish` → #201; `feat/effects-retouch-polish` → #204 | Follow-ups of #194/#196/#197/#199 limitations (sections below) |
| Large projects | `perf/blob-tiled-layer-assets` → #203; `perf/tiled-blob-layer-assets` → #207 | Open/reload/re-render speed; stored-bounds Apply Image, Calculations and warps |

### Backlog → workstream mapping

Priority as originally assigned: **P1** blocked or seriously slowed
large-document painting, **P2** a visible capability gap, **P3** polish or
investigation.

| # | Item | Priority | Status | Area / contract |
| --- | --- | --- | --- | --- |
| 1 | Stroke-start latency: ~2 s decode of the active 10.8 MP layer at pointer-down | P1 | **Shipped in #195** (warm committed pixels; first stroke after import still ~600 ms locally) | `performance-budgets.md` |
| 2 | Commit cost: every stroke re-encodes the full layer to PNG (`toDataURL`) | P1 | **Shipped in #213** (tiled layer assets; local full-layer commit ≈ 0.5 s vs 2–3.4 s at 2646×4096); new paint layers are cheap since #193 (stored at content bounds). Follow-ups W4-5 – W4-9 | `performance-budgets.md`, `layer-document-format.md` |
| 3 | Clone Stamp / Healing Brush respect the active selection (follow-up of #184) | P1 | **Shipped in #196**; Spot Healing / Patch in #201 | `brush-tool-contract.md` |
| 4 | Ctrl+V of an OS clipboard image did not reach the paste handler | P1 | **Shipped in #198** | `paste-special-contract.md` |
| 5 | Additional blend modes for glow and light painting | P2 | **Shipped in #197** (26 modes); backdrop-blended glows in #204 | `group-compositing-contract.md` |
| 6 | Larger Drop Shadow blur range; Outer Glow and Inner Glow | P2 | **Shipped in #197**; Gaussian falloff in #204 | `layer-styles-contract.md` |
| 7 | One live filter per raster layer; multi-filter stack without Rasterize | P2 | **Shipped in #199**; in-place editing in #204 | `smart-filters-contract.md` |
| 8 | Radial Blur integer-percent centres; fractional/pixel and on-canvas centres | P2 | **Shipped in #199** | `blur-effects-contract.md` |
| 9 | Reference/guide image with eyedropper, outside export and the layer budget | P2 | **Shipped in #200** | `reference-image-contract.md` |
| 10 | Pen lift at pressure 0; sparse stamping (spacing/scatter > 100%, count/jitter) | P2 | **Shipped in #194**; symmetric jitter in #201 | `brush-dynamics-contract.md`, `brush-pressure-contract.md` |
| 11 | "Mask from selection" consumes the selection | P3 | **Shipped in #196** | `layer-mask-contract.md` |
| 12 | Second gradient composites over existing pixels; Replace mode | P3 | **Shipped in #194**; live preview in #201 | `gradient-mode-contract.md` |
| 13 | History panel shows in-memory and persisted depth | P3 | **Shipped in #189** | `history-timeline-contract.md` |
| 14 | PNG export wrote no file in the Claude desktop built-in browser | P3 | **Hardened in #198**; host behaviour unverified (file picker workaround) | `export-contract.md` |
| 15 | Gaussian Blur radius 24 timed out the render worker at 10.8 MP | P1 | **Shipped in #191**; other heavy filters in #202, #205, #206 | `blur-effects-contract.md`, `worker-render-contract.md` |
| 16 | Alt-click clone source dropped while the previous stroke commits | P2 | **Shipped in #196** | `brush-tool-contract.md` |
| 17 | Project limits force flattening on large posters (layers, stored pixels, asset/draft caps) | P1 | **Shipped in #193**; open/reload speed in #203 (very large imports still slow — fix wave 3) | `layer-pixel-budget-contract.md`, `draft-storage-contract.md` |

### Fix wave 2 polish — retouch/brush (branch `feat/retouch-brush-polish`)

Follow-ups of limitations left by #194 and #196. Merged as #201
(`521188b`), deployed with `257e744` (see the table above). Companion of the
effects polish (#204).

| Item | Change | Contract / evidence |
| --- | --- | --- |
| Spot Healing / Patch ignore vector selections (#196) | The active selection of any shape is captured at pointer-down as a layer-space alpha asset referenced by the stroke (`selectionMask`); replay is confined and feathered; legacy strokes unchanged | `spot-healing-contract.md`, `patch-tool-contract.md`; `tests/retouch-selection-snapshot.test.mjs`, `tests/browser/retouch-brush-polish.spec.ts` |
| No live gradient preview (#194) | Dragging renders the gradient live through the #190 preview scheduler; release commits one undo step | `gradient-mode-contract.md`; `tests/browser/retouch-brush-polish.spec.ts` |
| Count jitter only lowers the count (#194) | Symmetric ±Count × jitter, clamped 1–16, deterministic | `brush-dynamics-contract.md`; `tests/brush-spacing-count.test.mjs`, browser spec |
| First dab with Scatter both axes off used both axes (#194) | The first dab waits for the next point and scatters perpendicular to it | `brush-dynamics-contract.md`; same tests |
| Gradient preview re-rendered the whole large layer per frame (#201 limitation) | Preview renders only the selection box or layer at ≤ 1.5 MP per frame and upscales it; commit stays full resolution | `gradient-mode-contract.md`; `tests/retouch-preview-cache.test.mjs`, browser spec (2400×1000) |
| Selection snapshot re-encoded on every selection change (#201 limitation) | Cache by selection value + placement, then by 64-bit mask digest; ids only, bounded to 16 | `spot-healing-contract.md`, `patch-tool-contract.md`; same tests |

Remaining: a reduced gradient preview can differ from the commit by a few
levels and previews Noise/Dither at that scale; the full-document composite
per preview frame is unchanged; a never-seen selection still costs one
rasterization and PNG encode.

### Fix wave 2 polish — effects (branch `feat/effects-retouch-polish`)

Follow-ups of limitations documented by #197 and #199. Merged as #204
(`4552ed6`), first deployed with `cc3c465` (run 42382062711). The companion
retouch/brush items (Spot Healing/Patch selections, live gradient preview,
Count jitter) merged as #201.

| Item | Change | Contract | Remaining limitations |
| --- | --- | --- | --- |
| Glow/shadow blend modes blended only against the layer's own pixels (#197) | A non-Normal Outer Glow or Drop Shadow composites onto the pixels beneath the layer in its own pass; Drop Shadow gains a blend mode (default Normal); same `renderFrame` path for viewport, worker, export and merge/flatten | `layer-styles-contract.md` | Folder members see only the folder's lower members; clipped layers' outer effects see no backdrop; no Knockout/Fill opacity |
| Drop/Inner shadow falloff linear at large radii (#197) | **Falloff: Gaussian / Linear (legacy)**; Gaussian (three matched box passes from #191, up to 250 px) is the default for new layers; stored shadows without the field keep the box pass and identical pixels | `layer-styles-contract.md` | ≈20% slower than the box pass at large radii (local measurement) |
| Stacked filters could not be edited in place (#199) | **Edit stacked filter** points the Filter effects controls at a stack entry; one undo step per change; position and hidden state kept; #185 key follows the normalised stack | `smart-filters-contract.md` | Per-filter blend modes and masks still staged |

Evidence: `tests/effects-polish.test.mjs` and
`tests/browser/effects-polish.spec.ts` (desktop and mobile). Local results
and CI are reported on the PR. Release identity is recorded in "Fix wave 2 —
merged and deployed" above; per-feature live acceptance is open (W3-16).

### Fix wave 3 — open items and limitations (2026-11-07)

Everything still open after recreating the "cosmic eye" poster, collected
from the user's findings and from the "Not in this PR" / "Limitations" /
"Remaining work" sections of #190–#207. Status: **In progress** has a
branch; **Open** has none yet. Measurements are local, not CI or production.

| # | Item | Priority | Status | Source / area |
| --- | --- | --- | --- | --- |
| W3-1 | **Tiled, content-addressed layer tiles + Blob-backed assets.** Commits re-encode only the 256² tiles a stroke touched; assets kept as Blobs instead of base64 data URLs (also removes base64 work in drafts and exports). Reaches `validateFrame`/`referencedAssets`, the #189 history budget, #186 drafts (tiles dedupe by hash), project/PSD/ORA export, worker transfer, ~40 `decodeAsset` call sites, and needs migration of existing documents. Baseline (#207 harness, 2646×4096): pointer-up → committed and rendered **2.2–2.9 s** on a full-canvas photo layer (0.48–0.58 s on a new paint layer) | P1 | **Done — #213** (`c11b8cb`; see "Fix wave 3 — merged" below). Follow-ups are W4-5 – W4-10 | #195, #203, #207, #213; `tiled-layer-assets-contract.md`, `performance-budgets.md`, `layer-document-format.md` |
| W3-2 | **Very large (600 MB+) projects still slow.** 617 MB / 822 MB-data, 320-layer poster: ≈ 79 s open (editor time), 53 s reload from the draft, 107 s `.pixelforge` export (incl. harness download); working set ~4.2 GB after open, peak ~5.2 GB. Remaining time is first-render PNG decode of the full layers and IndexedDB save | P1 | **Open** — expected to benefit from W3-1; lazy asset decode/streaming on install | #193, #203, #207 |
| W3-3 | **Export speed unchanged** by the large-project work (#203: 106 s → 107 s for the 617 MB project) | P2 | **Open** | #203; `export-contract.md` |
| W3-4 | **4-core filter speed-up unconfirmed on low-core devices.** 3 workers measured 0.92–1.58 s/MP at 10.8 MP on a loaded 2.4 GHz host (~2.6× over serial); ~1 s/MP not confirmed; no physical low-core desktop or phone measured. Phones capped at 2 workers (~1.5–1.9 s/MP by design); layers < 0.5 MP and other filters stay serial; at 1 MP JIT warm-up keeps a cold Reduce Noise above 1 s/MP | P2 | **Open** — measurement on real 4-core / phone hardware | #205, #206; `performance-budgets.md`, `worker-render-contract.md` |
| W3-5 | **Glow and shadow effects inside folders and on clipped layers.** Non-Normal Outer Glow / Drop Shadow on a folder member blend only against the folder's lower members (folders composite in isolation); a clipped layer's outer effects see no backdrop; each pass applies the layer's filter separately | P2 | **Open** | #204; `layer-styles-contract.md`, `group-compositing-contract.md` |
| W3-6 | **No Knockout and no Fill opacity** (layer opacity only) | P2 | **Open** | #204; `layer-styles-contract.md` |
| W3-7 | **Per-filter blend modes and masks** for filter stacks. (Picking a different filter from the menu now moves the live filter into the stack in `fix/filter-style-bugs`; blend modes and masks remain open) | P2 | **Open** | #199, #204; `smart-filters-contract.md` |
| W3-8 | **Live stroke preview composites the full frame** (~90 ms per preview at 10.8 MP headless); dirty-rect previews or a cached below/above composite per gesture need region support in `renderFrame`. The gradient preview (#201) also still composites the full document each frame | P2 | **Open** — related to W3-1 | #190, #201; `performance-budgets.md` |
| W3-9 | **`getCoalescedEvents()` not read**, so browser-coalesced pointer points are dropped while the main thread is busy | P3 | **Done** — Brush/Pencil/Eraser in #216, every stroke tool in #230 (`093a82a`) | #190; `brush-tool-contract.md` |
| W3-10 | **First stroke after importing an image** still waits ~600 ms locally for the decode (later strokes are warm since #195) | P3 | **Open** | #195 |
| W3-11 | **Reduced gradient preview** on layers > 1.5 MP can differ from the commit by a few levels and previews Noise/Dither at that scale; a never-seen selection costs one rasterization + PNG encode for Spot Healing/Patch | P3 | **Open** (documented limitation) | #201; `gradient-mode-contract.md`, `spot-healing-contract.md` |
| W3-12 | **PNG export in the Claude desktop built-in browser** not verified after #198's hardening (host behaviour cannot be reproduced in CI); **Save with file picker…** is the workaround. Host notes (popups close the pane, ZIPs saved as GUID `.tmp`) are not app bugs | P3 | **Open** — needs a manual check in that host | #198; `export-contract.md` |
| W3-13 | **Gaussian shadow falloff** is ≈ 20 % slower than the legacy box pass at large radii | P3 | **Open** (accepted cost) | #204 |
| W3-14 | **Reference image** stored downscaled to a 2048 px longest edge; its PNG counts toward the per-document asset byte limit | P3 | **Open** (documented limitation) | #200; `reference-image-contract.md` |
| W3-15 | **Remaining stored-bounds gaps:** other destructive operations that still act on a layer's stored bounds (Apply Image/Calculations fixed in #203, Perspective/Vanishing Point/Puppet Warp in #207) should be audited; layers carrying Spot Healing/Patch metadata are never trimmed or expanded | P3 | **Open** — audit | #193, #201, #203, #207; `layer-pixel-budget-contract.md` |
| W3-16 | **Per-feature live acceptance** of #190–#207 on `https://photoeditor.cheaply.fr` (release identity is verified; behaviour was verified only by local and CI tests) | P2 | **Open** | this record |

Earlier limitations still open: #183 has no automatic trim for *opened*
photos (by design since #193, only stored-bounds layers are trimmed); #185's
tiled blur path is not cached; #189's persisted history window is ≤ 24
states (~48 MiB) across reload.

### Fix wave 3 — merged (2026-11-07)

Painting features requested while recreating the "cosmic eye" poster, plus
W3-1. Scope, merge SHAs and limitations were read for this record with
`gh pr view <n> --repo cheaply-fr/pixelforge-photo-editor`; runs with
`gh run list --branch main --workflow "CI and deploy"`. All are bounded local
approximations; nothing here claims Photoshop parity.

Evidence is kept separate:

- **Local:** each PR reports `npm run lint`, `typecheck`, `build`, `npm test`
  and Playwright results from one Windows desktop (headless Chromium). The
  timings below are local only, not CI budgets or production timings.
- **CI:** each PR passed the protected PR workflow before merge. On `main`,
  the `CI and deploy` runs for #211 (`767e965`, run 42399925863), #210
  (`0ad0e69`, run 42400979401) and #212 (`513779d`, run 42403184976)
  and #213 (`c11b8cb`, run 42406170364) succeeded. The run for #209
  (`7516d33`, run 42399198576) was cancelled because #211 superseded it;
  `767e965` contains `7516d33`.
- **Deploy:** `https://photoeditor.cheaply.fr/release.json` reported
  `c11b8cbb91140fb20dc9cf32957e4d1f64c0a179` (built 2026-11-07T19:26:34Z)
  when this was written, which contains #209–#213. Earlier in the same
  session it reported `513779d` (#209–#212) while the #213 run was still in
  progress.
- **Live:** this is release identity only. Per-feature live acceptance of
  #209–#213 was not run (see W3-16).

| PR | Change (bounded local approximations) | Merge SHA | First deployed in (run) | Remaining limitations (from the PR) |
| --- | --- | --- | --- | --- |
| #209 | Brush **colour dynamics**: per-dab Hue, Saturation, Brightness and Foreground/Background jitter (0–100 %) for Brush and Pencil, seeded from the stroke so strokes replay identically; legacy strokes byte-identical. **Brush preset library**: four built-in space-art presets (Star field, Soft glow, Dust / nebula, Smoke wisp) plus saved presets with Save / Rename / Delete, stored on the device in `localStorage` (`pixelforge.brush-presets.v1`) and still carried in drafts and `.pixelforge` projects; presets now include opacity and colour dynamics | `7516d33` | `767e965` (42399925863) | Eraser ignores colour dynamics; no custom (sampled) brush tip shapes, so no 4-point "Glint" tip (W4-2); the brush has no blend mode, so presets store none (W4-3); no cloud sync of the device library. See `brush-dynamics-contract.md`, `custom-brush-presets-contract.md` |
| #210 | **Paint Symmetry** for Brush, Pencil and Eraser: Vertical, Horizontal, Dual axis, Diagonal, Radial (2–64 segments) and Mandala (2N copies); editable centre (on-canvas handle, keyboard nudges, fields) and rotation; copies share the source dab's seeded jitter; selection confinement per copy; one undo step; saved in drafts and projects | `0ad0e69` | `0ad0e69` (42400979401) | Not applied to Mixer Brush, History / Art History brushes, Clone Stamp or the healing tools (W4-4), nor to Stroke Path with Brush (W4-1). See `paint-symmetry-contract.md` |
| #211 | **Filter → Render → Light Rays…**: seeded radial rays, Starburst and bright-pixel streaks around an editable centre; count, length, width, taper, randomness, rotation, inner radius, falloff, colour, intensity, seed; Screen / Add / render on transparent; generated rays run in the parallel filter bands; works in filter stacks and the layer filter cache. Local 2646×4096: generate ≈ 0.2–1.2 s serial, source streaks ≈ 1.7–2.4 s | `767e965` | `767e965` (42399925863) | Not a physical light simulation (no occlusion or light transport); source-streak mode runs as one job on a ≤ 2 MP downsample. See `light-rays-filter-contract.md` |
| #212 | **Layer → Stroke Path with Brush…** (and a button in the Pen-family tool options): paints the current Brush, Pencil, Eraser or Smudge settings along a path layer's curves, sampled by arc length, with optional simulated pressure (start/end taper, minimum size, size and/or opacity); honours transformed path and paint layers and the active selection; one undo step | `513779d` | `513779d` (42403184976) | Simulated pressure only; at most 20,000 dabs per command (spacing widens beyond that, with a notice); paint symmetry is not applied (W4-1) |
| #213 | **Tiled, content-addressed layer assets** (W3-1): canvases of 1 MP or more are stored as 256² tiles keyed by a 128-bit hash of their pixels, each held as a PNG Blob; a commit encodes only tiles that are not already stored, and equal tiles are shared across layers and history. Drafts use format 4 (one IndexedDB record per distinct tile, SHA-256 verified, garbage-collected) only when tiles are present; `.pixelforge` stays v3 by flattening tiles to PNGs on write. Local 2646×4096 full-canvas photo layer, pointer-up → committed and rendered: **≈ 0.48–0.60 s vs 2.0–3.4 s** on `257e744`; a new paint layer is unchanged within noise | `c11b8cb` | `c11b8cb` (42406170364) | Follow-ups W4-5 – W4-10 below. See `tiled-layer-assets-contract.md` |

### Fix wave 4 — open follow-ups (2026-11-07)

From the limitations of #209–#213 and from local test runs. Updated
2026-11-09: W4-1, W4-3, W4-4, W4-5, W4-7 and W4-10 shipped in fix wave 5
(below); W4-2, W4-6, W4-8 and W4-9 remain open.

| # | Item | Priority | Status | Source / area |
| --- | --- | --- | --- | --- |
| W4-1 | **Paint symmetry is not applied to Stroke Path with Brush**; a stroked path paints one copy only | P2 | **Done — #220** (`e1ce828`) | #210, #212; `paint-symmetry-contract.md` |
| W4-2 | **No custom (sampled) brush tip shapes**, so the 4-point "Glint" tip is not available as a preset | P2 | **Open** | #209; `custom-brush-presets-contract.md` |
| W4-3 | **The brush has no blend mode**, so brush presets cannot store one | P3 | **Done — #218** (`06df4a7`) | #209; `brush-dynamics-contract.md` |
| W4-4 | **Symmetry is not applied to Mixer Brush, History / Art History brushes, Clone Stamp or the healing tools** | P3 | **Done — #220** (`e1ce828`); Spot Healing and Patch stay single-copy (documented) | #210; `paint-symmetry-contract.md` |
| W4-5 | **Dirty-rect hints for tiled commits**: a commit still reads back and hashes the whole layer (about 0.1 s on a new paint layer) instead of only the tiles a gesture touched | P2 | **Done — #221** (`1de2e3a`) | #213 follow-up 1; `tiled-layer-assets-contract.md` |
| W4-6 | **`.pixelforge` v4 storing tiles**: v3 export flattens every tiled version to a PNG, so exporting a long tiled history is slower than before #213; cloud payloads would follow | P2 | **Open** | #213 follow-up 2; `tiled-layer-assets-contract.md`, `export-contract.md` |
| W4-7 | **Decoded-tile cache**: undo to a version that shares most tiles still decodes every tile Blob | P2 | **Done — #221** (`1de2e3a`) | #213 follow-up 3 |
| W4-8 | **Dirty-region previews and partial worker composites** | P2 | **Open** — overlaps W3-8 | #213 follow-up 4; `performance-budgets.md` |
| W4-9 | **Off-main-thread tile encoding** (`OffscreenCanvas.convertToBlob`) once commits can be asynchronous | P3 | **Open** | #213 follow-up 5 |
| W4-10 | **Local e2e hazard**: `playwright.config` reuses any server already on port 4173 outside CI (`reuseExistingServer`), so a run can test a preview server started from another worktree; concurrent `npm run test:e2e` runs in one worktree delete each other's `test-results`. Run one suite per worktree and stop stray previews first | P3 | **Done — #219** (`a611065`): `PLAYWRIGHT_PORT`, opt-in `PLAYWRIGHT_REUSE_SERVER`, `PLAYWRIGHT_OUTPUT_DIR` | local runs for #209–#213 |

### Brush Silk strands (branch `feat/brush-silk-strands`)

A Brush mode that paints a twisting ribbon of fine, fading strands from one
ordinary drag (silky smoke, wisps), replacing the scripted point-by-point
workaround. Bounded local approximation, not a smoke simulation. Contract:
"Silk strands" in `docs/brush-dynamics-contract.md`.

| Item | Status | Evidence |
| --- | --- | --- |
| Pure strand geometry: settings validation, seeded per-strand parameters, Catmull-Rom smoothing with filtered normals, twist/taper/wobble offsets, staggered windows, pressure, batched drawing | **Implemented locally** | `src/brushStrands.ts`; `tests/brush-strands.test.mjs` |
| Brush options (Silk strands, Strands, Ribbon width, Twists, Wobble, Strand opacity jitter, Seed / New seed), built-in **Silk smoke** preset, draft / project / preset persistence | **Implemented locally** | `app/page.tsx`, `src/brushPresetLibrary.ts`, `src/customBrushPresets.ts`, `src/drafts.ts`; `tests/browser/brush-strands.spec.ts` (desktop + mobile) |
| Overlay-only preview while dragging (no layer-stack render per move), one commit on release with selection, blend mode and Paint Symmetry | **Implemented locally** | `tests/browser/brush-strands.spec.ts` |
| CI / deployment / live acceptance | Pending until the PR's protected `CI and deploy` run, merge and `/release.json` check | — |

### Properties sidebar auto-scroll (branch `feat/sidebar-autoscroll`)

The right-hand properties sidebar now scrolls to the exact section that owns
whatever the user just activated: toolbar tools and flyout subtools, tool
shortcuts, menu tool commands, Filter menu / Filter Gallery / Last Filter
picks, quick filters, adjustment commands, Layer Style / Rename Layer / Find
Layers, entering Quick Mask, a plain layer-row click (Layer properties) and
enabling a layer style (that style's block). Contract:
`docs/sidebar-autoscroll-contract.md`.

| Item | Status | Evidence |
| --- | --- | --- |
| Typed registry: every `Tool`, `FilterEffectType`, layer style and section-targeting command maps to a section (section-less tools carry a documented reason); Tool options / Text / Rotate View render from the same map | **Implemented locally** | `src/sidebarSections.ts`; `tests/sidebar-sections.test.mjs` |
| Pure scroll arithmetic (sticky / scroll-padding / off-screen insets, start vs nearest, clamping, keep-visible control) and a ports-based coordinator (last trigger wins, bounded retries, collapse → expand, deferral during strokes/drags, manual-scroll interruption, reduced-motion instant branch, focus rescue only for keyboard menus, polite announcement) | **Implemented locally** | `src/sidebarScrollMath.ts`, `src/sidebarAutoScroll.ts`; `tests/sidebar-scroll-math.test.mjs` (incl. 5 000-case property test), `tests/sidebar-autoscroll.test.mjs` |
| Collapsible page sections (disclosure headers, persisted per device), landing highlight, bounded mobile sidebar scroll region so reveals never move the canvas | **Implemented locally** | `src/SidebarSection.tsx`, `app/globals.css`; `tests/browser/sidebar-autoscroll.spec.ts` (desktop + mobile, every tool parameterised) |
| CI / deployment / live acceptance | Pending until the PR's protected `CI and deploy` run, merge and `/release.json` check | — |

Limits: Layers-panel sub-sections are not collapsible; the whole e2e suite
runs with `prefers-reduced-motion: reduce` so reveals are synchronous with
clicks (the dedicated spec covers the animated path).

### Photoshop 7 toolbox chart audit (2026-11-09)

Every tool on the classic Photoshop 7 toolbox chart (designfreebie tutorial,
`Untitled-11.png`) was checked against `main` at `1de2e3a`. All PixelForge
versions are bounded local implementations; none claims Photoshop parity.

| Chart item | Before | Now | PR / evidence |
| --- | --- | --- | --- |
| Rectangular, Elliptical, Single Row, Single Column Marquee | Implemented | Implemented | `src/toolPalette.ts` (`marquee` flyout) |
| Move | Implemented | Implemented | — |
| Lasso, Polygonal Lasso, Magnetic Lasso | Implemented | Implemented | — |
| Magic Wand (+ Quick Selection) | Implemented | Implemented | — |
| Crop, Slice, Slice Select | Implemented | Implemented | — |
| Healing Brush, Patch (+ Spot Healing, Red Eye) | Implemented | Implemented | — |
| Brush, Pencil (+ Color Replacement, Mixer) | Implemented | Implemented | — |
| Clone Stamp, Pattern Stamp | Implemented | Implemented | — |
| History Brush, Art History Brush | Implemented | Implemented | — |
| Eraser, Background Eraser, Magic Eraser | Implemented | Implemented | — |
| Gradient, Paint Bucket | Implemented | Implemented | — |
| Blur, Sharpen, Smudge | Implemented | Implemented | — |
| Dodge, Burn, Sponge | Implemented | Implemented | — |
| Path Selection | Missing | **Merged to main** | #232, `docs/path-edit-tools-contract.md` |
| Direct Selection | Implemented | Implemented (A now cycles Path → Direct) | #232 |
| Horizontal Type | Implemented | Implemented | — |
| Vertical Type | Partial (menu command only) | **Implemented in PR** | #244 (fixes session; #234 closed as duplicate), `docs/type-tool-contract.md` |
| Horizontal / Vertical Type Mask | Partial (menu commands only) | **Implemented in PR** (on-canvas entry) | #244 |
| Pen, Freeform Pen | Implemented | Implemented | — |
| Add Anchor Point, Delete Anchor Point, Convert Point | Partial (Pen modifier clicks only) | **Merged to main** (primary contour only) | #232 |
| Rectangle, Ellipse, Polygon, Line | Implemented | Implemented | — |
| Rounded Rectangle | Missing | **Merged to main** (editable corner radius) | #231, `docs/shape-tools-contract.md` |
| Custom Shape | Partial (user presets of basic kinds) | **Merged to main** (15-shape built-in library) | #231 |
| Notes | Implemented | Implemented | — |
| Audio Annotation | Missing | **Merged to main** (local only, never cloud-saved or exported) | #241, `docs/audio-annotation-contract.md` |
| Eyedropper, Color Sampler, Measure | Implemented | Implemented | — |
| Hand, Zoom | Implemented | Implemented | — |
| Foreground/background swatches, swap (X), default (D) | Implemented | Implemented | — |
| Standard / Quick Mask mode | Implemented | Implemented | — |
| Screen modes | Implemented | Implemented | — |
| Jump to ImageReady | Not applicable (separate Adobe application) | Not applicable | — |

Merge commits: #232 `cd8d0a6`, #231 `43e5e17`, #241 `4987e74`; #244 (Type family) is owned by the fixes session.

Known limits: no `.csh` shape-library import; anchor tools edit only the
primary contour of compound paths; Path Selection acts on the active layer
only; audio has no
Photoshop/PDF annotation interchange. Status moves to merged/deployed only
after each PR's protected `CI and deploy` run and a `/release.json` check.

### Fix wave 5 — merged and deployed (2026-11-08/09)

Wave 4 follow-ups plus the bugs and requests raised while painting the
62-layer 2646×4096 "cosmic eye" poster on the live editor. Every PR passed
the protected `CI and deploy` workflow on its branch before merge; merge
SHAs are from `gh pr list --state merged`. All behaviour is a bounded local
approximation; nothing here claims Photoshop parity.

Evidence is kept separate:

- **Local:** each PR reports lint, typecheck, build, `npm test` and the
  Playwright specs it ran (desktop + mobile, headless Chromium, one Windows
  machine that was heavily loaded by parallel runs, so some local runs needed
  reruns of timeouts). Combined integration branches of #218–#227 passed the
  full local suite (1649 passed, 0 failed); #245 synced with #244 passed the
  full suite (1858 passed, 0 failed, 24 skipped). Timings are local only.
- **CI:** green on every PR head that was merged. Branches were re-synced with
  `main` and re-run where later merges conflicted.
- **Deploy:** `CI and deploy` run 42563797660 succeeded for `e5220d0` (#245, contains every PR above); `/release.json` and `/api/readyz.json` reported commit `e5220d0434e8eb48c3003cff2084f7b2e2bb6e48`, version `0.1.1002` (#229 scheme), `ready: true`, built 2026-11-09T04:49Z.
- **Live:** release identity only; per-feature live acceptance is being run by
  the handoff session after this record.

| PR | Change | Merge SHA |
| --- | --- | --- |
| #218 | Brush/Pencil **Mode** (blend mode) on a separate stroke buffer, stored in brush presets (W4-3) | `06df4a7` |
| #219 | Local Playwright isolation per port/output dir; no reuse of foreign preview servers (W4-10) | `a611065` |
| #220 | Paint Symmetry for Stroke Path with Brush, Mixer, History/Art History, Clone Stamp and Healing (W4-1, W4-4) | `e1ce828` |
| #221 | Dirty-rect tiled commits and a decoded-tile cache (W4-5, W4-7); blend-mode strokes report their writes | `1de2e3a` |
| #222 | New layers and duplicates go **above the selection** (folder and clipping group aware); empty-layer add/delete reuse the finished composite; clipped-layer results cached so reorders stop recomputing clipping groups | `3888d45` |
| #223 | Rasterize/Merge/Nest keep clipping; clipped-row indicator; arrange moves past whole clipping groups | `9e5ac24` |
| #225 | Retouch tools (Dodge/Burn/Sponge/Smudge/Blur/Sharpen/Mixer/History…) process only the brush window per move (local 25-move Dodge 11.3 s → 0.48 s) | `20bcb4d` |
| #226 | Gaussian/Box/Motion/Lens Blur now blur alpha, so brush strokes over transparency soften | `1d4569c` |
| #227 | Difference Clouds uses the smooth Clouds noise (transparent = black); reversed Levels output (invert) | `e5bf5f8` |
| #228 | Editor no longer dims to 50 % on every render (canvas "flash"); canvas resized only on size change; delayed "Rendering…" status | `64fb9d2` |
| #229 | App version increments on every main deploy (`<major>.<minor>.<run number>`), shown in the app, `/release.json` and `/api/readyz.json` | `493ac59` |
| #230 | Every coalesced pointer sample applied for all stroke tools, so strokes are identical when the pane is hidden (W3-9) | `093a82a` |
| #233 | **Tool presets** for 40 tools: save, apply, update, rename, duplicate, reorder, import/export, Reset Tool / Reset All Tools | `ee68504` |
| #235 | Multi-point Curves (monotone interpolation, keyboard/touch) and decimal selection feather | `9f57eb1` |
| #236 | Incremental delete/reorder/visibility renders via several prefix snapshots (local 62-layer delete 22 s → 1.6 s) | `916698d` |
| #237 | Layers panel drag-and-drop reorder, per-row delete, row menu, keyboard reorder, file drops as layers | `320b903` |
| #238 | Self-hosted font library: 146 families incl. Material Symbols, Font Awesome Free, Noto symbol/math/emoji; picker and Glyphs panel | `38522d4` |
| #239 | Smudge: carried paint, Strength, Finger Painting, Sample All Layers, modes, tip/pressure/scatter, symmetry, presets | `6e4f341` |
| #243 | Type engine: versioned rich-text runs, paragraph layout, caret model | `8702634` |
| #244 | Type tool overhaul: on-canvas editing, Horizontal/Vertical Type and Type Mask tools, Character/Paragraph panels; Move tool after commit; Text section revealed when a text layer is selected | `7a43126` |
| #245 | Tool-contextual properties sidebar (only the active tool's options; "More panels" strip; phone sheet) and a layer action bar directly under the layers list | `e5220d0` |

Merged in the same period by other sessions (recorded for completeness):
#224 sidebar auto-scroll (`a35220a`), #231 Rounded Rectangle/Custom Shape
(`43e5e17`), #232 path selection and anchor tools (`cd8d0a6`), #240 Silk
strands brush (`754f0c5`), #241 Audio Annotation tool (`4987e74`), #242
toolbox chart audit docs (`07f2c9c`), #246 auto-hiding scrollbars
(`37ffe0f`), #247 page-scroll leak fix (`bd0bc37`).

Still open after this wave: W4-2 custom sampled brush tips, W4-6
`.pixelforge` v4 tiles, W4-8 dirty-region previews, W4-9 off-main-thread
tile encoding (large features, not started); the remaining W3 items; Tool
presets do not yet capture the new Smudge and Silk strands options; layers
above an edited layer are still composited per edit (W3-8/W4-8).

## Large-document painting fixes (#260, `fix/selection-fill-limits`)

Reported while painting a 3000 × 4000 illustration on the live editor:

| Issue | Change | Contract and tests |
| --- | --- | --- |
| A Lasso drawn entirely off the canvas (or an Intersect/Subtract that removed everything) left "no selection", so Fill painted the whole layer | Such gestures commit an explicit empty selection (Add/Subtract of nothing keep the current one); Fill…, the quick fills, Clear, Delete/Backspace and Stroke… change nothing and show "No pixels are selected" | `selection-composition-contract.md`; `tests/selection-empty.test.mjs`, `tests/browser/selection-fill-limits.spec.ts`, `tests/browser/lasso-offcanvas.spec.ts` |
| Gaussian Blur radius capped at 64 px | Up to 1000 px; the slider scales with the document (250–1000 px) and an exact number field accepts 1–1000; radii above 64 use a downsampled box cascade (12 MP radius 1000 ≈ 1.4 s in Node); radii ≤ 64 unchanged | `blur-effects-contract.md`; `tests/gaussian-blur-large-radius.test.mjs`, browser spec |
| Options-bar feather capped at 250 px | 0–1000 px, the same bound as Select > Modify > Feather | `selection-feather-contract.md`; pure and browser tests |
| Each fill needed the modal Edit > Fill… dialog | Alt/Option+Backspace (foreground) and Ctrl/Cmd+Backspace (background), also in the Edit menu and the Keyboard Shortcuts list | `keyboard-shortcuts.md`; pure and browser tests |

Limitations: large Gaussian radii render full-frame (not tiled) and are an
approximation (mean ≈ 0.35 levels, max ≤ 8 levels against an exact Gaussian
on a hard-edged scene); the quick fills always use 100 % Normal.

## Stroke Selection (painting-session follow-up)

Outlines in the same session were brushed by hand: the old Edit > Stroke…
asked only for a width in a browser prompt, always drew an inner border in the
foreground colour and replaced the layer's pixels (`putImageData`) instead
of compositing. Edit > Stroke Selection… now offers 1–250 px, colour,
Inside/Center/Outside, opacity and blend mode, measures an exact-distance band
along the selection's 50 % edge (Lasso, feathered and compound selections
alike) and composites it as one undo step. See
`stroke-selection-contract.md`; `tests/stroke-selection.test.mjs`,
`tests/browser/stroke-selection.spec.ts`. Pattern fill, faster feathered
selections and Save draft from the same session are in #264, #265 and #262.

## Latest protected release evidence

The protected workflow run for the current merged release completed
successfully for `0ad096772bfa33f67f8bae4874f0986ad9137f02` on 2026-10-25.
Both `Validate editor` and `Deploy production` completed with a successful
conclusion. The readiness marker independently reports the same revision:

- `https://photoeditor.cheaply.fr/health` returned HTTP 200 with
  application `pixelforge-photo-editor`, `ready: true`, and commit
  `0ad096772bfa33f67f8bae4874f0986ad9137f02`.
- The deployed editor shell has been checked for its application shell, canvas,
  and Export control. Independent live export-pixel verification remains
  pending because the browser probe is intermittently losing its network
  route; no export acceptance is claimed here.
- DNS resolved `photoeditor.cheaply.fr` through
  `photoeditor-cheaply.web.app` to `199.36.158.100`; TLS validation succeeded
  for the custom hostname.

This proves the release and endpoint identity gates for that SHA. It does not
claim Photoshop equivalence or complete the staged interoperability,
semantic-cleanup, wet-media, and physical-device acceptance work described
below.

The toolbar alignment increment is included in this release: every tool icon
uses a fixed visual slot, compact categories pack densely without placeholder
cells, labels remain aligned, and family subtools retain visible bottom-right
arrows. The protected browser suite includes desktop and mobile geometry,
duplicate-family, subtool-icon, touch-target and reload checks.

This rubric keeps implementation, verification, deployment, and live acceptance separate. A capability earns weighted credit only when its UI/data model and required tests are present; a release gate remains incomplete until protected CI, the deployed revision, and live behavior are independently verified.

## Weights

| Stage | Weight | Completion evidence |
| --- | ---: | --- |
| Document model and persistence | 18% | Editable raster/text/vector layers, groups, masks, versioned migration, corruption and round-trip tests |
| Selection and precision geometry | 14% | Rectangle/ellipse/row/column/lasso/color selection, alpha algebra, feather/refinement, transforms and cancellation tests |
| Painting and retouching | 14% | Brush/eraser/fill/gradient/clone/healing settings, source safety, pressure fallback, pixel fixtures and touch tests |
| Typography and vectors | 10% | Text layout and spacing, bounded editable Warp Text, parametric shapes, paths, transforms, editable export and mobile/desktop coverage |
| Adjustments and filters | 14% | Distinct nondestructive algorithms, representative pixels, metadata persistence, lock/undo and browser coverage |
| History, projects and exports | 12% | Recovery/migration/conflict handling, private authorization, PNG/JPEG/WebP quality/size/privacy and cancellable batch tests |
| Accessibility, mobile and scale | 10% | Keyboard and assistive semantics, physical mobile checks, offline recovery, worker/tile cancellation and measured budgets |
| Interoperability and optional intelligence | 8% | Explicit HEIC/PSD/RAW/TIFF/SVG/PDF labels, background/object cleanup contracts, privacy/resource/error gates |
| **Total** | **100%** | **All stage evidence is required for completion** |

## Status rules

- **Implemented locally** means source, data model, pure tests and relevant desktop/mobile tests exist. It does not imply CI, deployment or live acceptance.
- **CI verified** means the protected workflow completed successfully for the exact candidate SHA. Static analysis or a separate code-scanning workflow is not sufficient.
- **Deployed** means the production workflow published the tested artifact and its verification step passed for the exact SHA.
- **Live accepted** means `/release.json`, readiness, DNS/TLS, editor behavior, representative export pixels, and applicable account/project authorization all match the deployed SHA.
- A stage is **verified shipped** only when all applicable evidence is present. Approximation, aliases, disabled menu entries, and source-only changes remain partial.

## Latest local increments (`language-options` on top of `302dbf7`)

The current local candidate adds `Type → Language Options` as an accessible
local workflow for editable text. It persists bounded language, writing
direction and hyphenation intent metadata, applies browser-supported LTR/RTL
direction during Canvas 2D rendering, and keeps authored line breaks, source
text, undo history and portable project round trips intact. The dialog and
Layers panel share the normalized values, legacy drafts remain valid and
invalid values fail closed. Pure coverage passes **886/886**; the focused
language-options desktop/mobile suite passes **4/4**, and adjacent typography
plus editor acceptance passes **82/82**. Typecheck, lint and build pass
locally. Hyphenation layout, full language-specific shaping and font embedding
remain staged. This increment is included in the merged release `3e6e095…`;
protected CI and production deployment passed for the exact release SHA.
Independent live browser/export acceptance remains separate and is not claimed
from the deployment result alone.

The preceding local candidate is `893bf60`. It adds `Image → Adjustments` as an
accessible local family chooser for Levels, Curves, Hue/Saturation, Color
Balance, and Sharpen and Noise, routing each choice through the existing
nondestructive inspector controls. Its desktop/mobile acceptance passes
**2/2**. The preceding increment adds `Image → Analysis → Histogram` with
256-bin RGB/luminance statistics, transparency handling and channel controls;
its focused desktop/mobile acceptance passes **2/2** and its pure coverage is
included in the full suite. These menu-family surfaces do not claim full
Photoshop adjustment-dialog or profile-aware analysis parity.

Protected run `38963588498` passes for the exact candidate `a8eae77`, covering
lint, typecheck, build, the full pure suite and desktop/mobile Playwright
coverage. The production job was skipped because the candidate is still on
open PR #149; deployment and live-acceptance credit therefore remain unearned.

The preceding local candidate `2629cc5` adds `Edit → Generate Image…` as
a bounded offline abstract renderer that inserts a deterministic gradient,
stripes, dots or noise raster layer while enforcing prompt, dimension, pixel
and layer limits. The pure normalisation/render cases pass **3/3** and the
desktop/mobile dialog, editable-layer, dimension, reload and empty-input cases
pass **4/4**. The full local pure suite is **880/880**, and the complete local
desktop/mobile Playwright run is **1,025/1,025** after aligning two stale menu
expectations with the now-enabled Generative Fill command. Typecheck, lint,
build and the toolbar regression suite (**26/26**) also pass. Protected runs
`38948652002` (source head) and `38952991183` (documentation head) passed,
including the complete browser suite;
deployment and live-acceptance credit remain unearned because PR #149 is still
open. Production remains on the previously verified revision until those gates
complete. See
[`generate-image-contract.md`](./generate-image-contract.md).

The toolbar layout hardening now lets one-slot categories consume one global
track, two-slot categories consume two tracks, and larger categories retain a
full row. This removes the large blank regions introduced when family slots
were added while preserving family deduplication, visible subtool icons and
hold-to-open behavior. The desktop/mobile toolbar suite passes **26/26** with
explicit packed-track, no-placeholder and touch-target assertions. This is
local UI evidence only; the protected run for the candidate remains the
release gate.

The current local candidate adds source-safe Blur and Sharpen brush tools to
the Retouch category. Smudge, Blur and Sharpen share the Photoshop `R` family
flyout with a bottom-right arrow and visible subtool icons; each exposes Size,
Hardness and Flow, clips to the active selection, preserves source/alpha bytes,
guards locked layers, commits one undoable raster asset and survives reload and
portable project export. Pure retouch coverage is **3/3**, and the focused
desktop/mobile browser suite is **6/6**. The candidate is not merged or
deployed, so protected CI and live evidence remain separate gates.

The protected Playwright gate now defaults to two isolated workers on CI, with
`PLAYWRIGHT_WORKERS` as an override. This brings the full browser run inside
the workflow budget while preserving the same test inventory; each worker owns
an independent browser context and IndexedDB draft. This is a test-execution
reliability change, not a product-capability claim.

Lens Correction now uses a bounded source-pixel influence radius and forwards
the tile-local authored centre through the renderer. `lens-correction` is in
the explicit tiled neighbourhood allow-list, and its full-frame oracle matches
the tiled output at seams. The pure tiled/filter checks pass **18/18** and the
desktop/mobile Lens Correction acceptance passes **4/4**. The follow-up Layer
Styles increment adds a nondestructive editable Color Overlay beside the
existing bounded drop shadow and outline. It preserves the source asset and
alpha, normalizes legacy style records, and survives undo, reload and portable
project round trips; the focused desktop/mobile Layer Styles suite passes
**8/8**, while the full pure suite passes **848/848**. Lint, typecheck and the
production build pass locally; the build retains the known dynamic-import and
large-chunk warnings. These commits are pushed to PR #149 but protected CI and
deployment are still pending, so no production or live-acceptance credit is
earned yet.

The current nested Smart Object candidate extends the same bounded local
contract: selected root-level layers can be wrapped in a recursive child
`Frame`, rendered through the source-safe compositor, validated to four levels,
and retained by recursive asset compaction. Layer-panel and Layer-menu entry
points are covered by desktop/mobile acceptance, including representative
pixels, undo, reload and portable project round trips. The focused Smart Object
suite passes **10/10**. The follow-up Gradient Overlay style adds editable start/end colours, opacity,
angle and reversal while retaining source pixels. The next Inner Shadow style
adds bounded offsets, distance and blur, clips to source alpha and retains the
source asset. The next Bevel/Emboss style adds directional highlight/shadow
edge shading with bounded angle, depth and blur. The combined Layer Styles
desktop/mobile suite passes **14/14**, the Smart Object suite passes **10/10**,
and the pure suite passes **853/853**;
typecheck, lint and build pass locally. These changes remain local evidence
until protected CI, deployment and live revision checks complete.

## Current baseline

The repository contains broad partial implementations across all eight stages. The latest merged release (`3e6e0952522d5807abba809ec5dd2ca876f467fe`) passed protected validation and production deployment; the current candidate adds the bounded OpenType variable axes and has local lint, typecheck, production build and **906/906** pure tests passing. The release includes the linked smart-object selection contract, deterministic Wet Edges and Build-up brush-mask coverage, focused desktop/mobile tiled Gaussian Blur acceptance, tiled neighborhood coverage, toolbar taxonomy/preferences coverage, responsive toolbar acceptance, active blur-family batch Action acceptance, normalized filter-control Action persistence, Gradient Map color/stop Action persistence, plain Blur menu workflow, Camera Raw control/pixel contract, Assign/Convert Profile workflows, bounded oriented/alpha-aware TIFF import, bounded Text-tool font persistence and Font Preview Size coverage, and the toolbar release evidence. The layer workflow exposes generic Link Layers, Unlink Layers and Select Linked Layers; ordinary selected layers persist a `layerLinkId`, affine transform deltas propagate across linked peers as one undoable edit, and source assets remain independent. External provider-backed, nested and cloud-synchronized links remain staged. Recorded Actions route enabled blur families, Find Edges and Emboss through the deterministic renderer and persist normalized settings without source data. The toolbar evidence covers one visible slot per subtool family, Photoshop-style submenu arrows, visible SVG flyout icons, remembered subtool selection, reload persistence, two/three-column layouts without duplicate IDs or trailing empty slots, and compact/comfortable category spacing. Independent live health verification is recorded for the merged release; independent browser/export verification for the current candidate remains pending. The remaining roadmap gaps are documented below.

Progress percentages in status reports are estimates derived from this rubric and must identify the stage evidence that is still missing. They must never be increased solely because source files changed.

## Deferred implementation queue and blockers

The following items remain explicitly staged and must be scheduled as bounded,
tested increments rather than implied by the current high-use workflow:

1. Editable layered PSD/PSB interchange, including masks, text, vectors and
   an honest capability/loss manifest.
2. Full colour-profile, metadata and non-destructive document round trips,
   including profile-aware export and import boundaries.
3. Full wet-media brush simulation, physical bristle behaviour and the
   remaining mesh/face-aware Liquify semantics.
4. Language-specific shaping, hyphenation, font embedding and complete
   variable-axis interpolation for typography.
5. Physical-device and assistive-technology certification, broader offline
   recovery, and production-scale performance budgets.
6. Provider-backed/nested smart links, plugin APIs, folder watchers and
   synchronized cloud recipes, subject to the local-first privacy contract.

Implementation order is intentionally reprioritized for the next cycle:
layered PSD/PSB is deferred; the bounded profile/export slices are now shipped,
so the next candidate milestones are wet-media brush dynamics and advanced
Liquify semantics. Those require new deterministic contracts before they can be
called unblocked. Each increment must add pure pixel/validation tests and
desktop/mobile persistence or export coverage before it is promoted.

The deployed release has passed local and protected validation, production
deployment, readiness and live editor-render checks. The independent live
export-pixel check is still blocked by intermittent browser/network download
behaviour; no completion claim should be made until a downloaded export is
captured and compared against the expected rendered pixels. This blocker is an
acceptance gap, not evidence that the export implementation itself is complete
for all deferred formats.

The Polygon tool now persists a bounded parametric variant (`polygon`,
`triangle`, or `star`) and a 3–32 side count in local settings and project
files. Stars also expose a bounded 10–90% inner-radius control. Rendering,
boolean operations and reload preserve the editable variant, side count and
inner radius; the desktop/mobile acceptance suite covers control selection and
project-file round-trip. Custom polygon presets retain the same geometry when
applied. Freeform custom path libraries are now active as bounded local presets: `Edit → Define Custom Path…` stores a validated editable path in versioned settings, and the Pen/Direct Selection options can apply or remove presets while preserving path geometry. Pure validation and desktop/mobile project round-trip coverage are present; path libraries remain local evidence until protected CI, deployment and live acceptance pass.

The bounded local Content-Aware Move slice is available through `Edit →
Content-Aware Move…`. It requires an explicit selection, fills the vacated
region from deterministic local context, translates the selected pixels and
commits a new undoable asset; semantic object removal and generative inference
remain outside this contract. Pure and desktop/mobile acceptance are recorded
in `docs/content-aware-move-contract.md`.

Batch history export now applies an explicit local sRGB or Display P3 target to
every rendered snapshot and records that target in the privacy manifest. Source
assets, EXIF/GPS metadata and editable project layers remain local and are not
placed in the ZIP. The batch dialog and manifest assertion are covered by the
desktop/mobile batch export acceptance suite; full ICC embedding and external
metadata round trips remain staged. The manifest now also normalizes the local
title, description and author fields at the export boundary and rejects forged
metadata keys, with pure validation coverage.

## Latest local increment

The bounded profile/metadata export slice is now active. Export previews expose
an explicit sRGB or Display P3 target; conversion runs on an export-only canvas
through the existing alpha-safe D65 matrix primitive, so the editable draft and
its source assets remain unchanged. The control is covered by a desktop export
acceptance test, while the pure profile conversion and metadata privacy suites
continue to cover validation, transparent RGB preservation and local-only
project round trips. ICC embedding, authored vector/text colour conversion and
full external profile/metadata round trips remain staged.

The Type tool now persists the bounded OpenType variable axes `wght`, `wdth` and `opsz` in project files and Canvas typography. Weight, width and optical size controls are clamped and validated, with desktop/mobile reload coverage in `tests/browser/open-type.spec.ts` and pure normalization coverage in `tests/open-type.test.mjs`. The focused pure suite passes 4/4 and the OpenType desktop/mobile suite passes 6/6 after rebuilding the preview bundle. This remains local acceptance evidence until protected CI, deployment and independent live export checks pass.

The Type tool now persists a bounded Font Preview Size preference (`small`,
`medium`, `large`) shared by the Type menu and inspector. It changes only the
font-picker option preview, not document pixels, text metrics or history. Pure
normalization coverage is in `tests/font-preview.test.mjs`; desktop/mobile
cycle and reload coverage is in
`tests/browser/type-style-presets.spec.ts`. The feature is included in
`d46ec09`, and protected run #639 passed for that exact candidate; deployment
and live gates remain pending.

The inspector now exposes a History timeline backed by the existing bounded
immutable frame stack. It provides keyboard-addressable summaries and direct
restore navigation without a second document model; the restore path retains
the existing branch semantics and local conflict protections. Pure coverage is
in `tests/history-timeline.test.mjs`, and desktop/mobile acceptance coverage is
in `tests/browser/history-panel.spec.ts`. This increment is locally verified;
it is not CI, deployment or live acceptance until a protected workflow runs for
the candidate SHA.

The current local increment adds `Image → Mode` with a bounded RGB Color /
Grayscale frame property. Grayscale applies Rec. 709 luminance at render time,
preserves alpha and immutable source assets, and survives undo, reload and
portable-project round trips. Pure coverage is in
`tests/color-mode.test.mjs`; desktop/mobile menu, pixel, alpha, source-retention,
undo, reload and project coverage is in `tests/browser/color-mode.spec.ts`.
The candidate passes 828/828 pure tests and focused color-mode acceptance 4/4;
protected CI, deployment and live acceptance remain separate gates.

The brush-family controls also include a persisted, bounded smoothing amount
for Brush, Pencil and Eraser. `src/brushSmoothing.ts` keeps pointer response
deterministic and source-safe, with pure coverage in
`tests/brush-smoothing.test.mjs`; details and limitations are recorded in
`docs/brush-smoothing-contract.md`. This remains local evidence until the
protected workflow and live candidate verification pass.

Brush-family controls now also include a persisted, bounded deterministic
Scatter amount. `src/brushDynamics.ts` derives a replay-stable bounded stamp
offset without global randomness; pure coverage is in
`tests/brush-dynamics.test.mjs`, with desktop/mobile project-file coverage in
`tests/browser/brush-dynamics.spec.ts`. Texture, dual-brush, bristle and
wet-media dynamics remain staged.

Brush-family controls now also include a persisted deterministic Texture
amount. It modulates each local stamp's opacity with a bounded position-derived
factor while preserving the zero-value path and source-safe commit boundary.
Pure coverage is in `tests/brush-texture.test.mjs`, browser persistence coverage
is in `tests/browser/brush-texture.spec.ts`, and limitations are documented in
`docs/brush-texture-contract.md`.

Brush-family controls now also include a persisted deterministic Dual brush
amount. It applies a bounded secondary opacity weave to each local stamp while
preserving the zero-value path and source-safe commit boundary. Pure coverage is
in `tests/brush-dual.test.mjs`, with desktop/mobile project-file coverage in
`tests/browser/brush-dynamics.spec.ts`; full wet-media simulation remains staged; bounded wet colour pickup and physical bristle filament coverage and the optional secondary preset tip are active.

Brush-family controls now also include a persisted deterministic Bristle amount.
It applies bounded filament-like opacity modulation to each local stamp while
preserving the zero-value path and source-safe commit boundary. Pure coverage is
in `tests/brush-bristle.test.mjs`, with the same desktop/mobile project-file
acceptance; full wet-media simulation remains staged; bounded wet colour pickup and physical bristle filament coverage is active.

Custom brush presets now retain the secondary brush tip plus bounded Wet edges and Build-up values alongside the existing tip dynamics; legacy presets default the optional fields safely during normalization, with explicit migration coverage.

Brush-family controls now also include a persisted deterministic Build-up amount. It preserves centre coverage while applying a bounded centre-weighted opacity falloff to the outer deposit. Pure coverage is in `tests/brush-build-up.test.mjs`, desktop/mobile project-file coverage is included in `tests/browser/brush-dynamics.spec.ts`, and the approximation plus wet-media limitation are recorded in `docs/brush-build-up-contract.md`.

Mixer Brush strokes now interpolate every pointer segment at a bounded spacing,
so wet pigment pickup remains continuous during fast drags instead of applying
isolated dabs. The interpolation helper is shared by Mixer and Art History
Brushes, with pure deterministic coverage in
`tests/mixer-history-brush.test.mjs` and existing desktop/mobile Mixer Brush
stroke coverage. Full fluid simulation, bristle collision and canvas-wide
pigment reservoirs remain staged.

Liquify now exposes three bounded local modes—Twist, Push and Bloat—while
retaining the editable centre, radius and angle metadata. Each mode inverse
samples immutable source pixels, preserves alpha and remains undoable; pure
determinism/source-safety and desktop/mobile persistence coverage are recorded
in the filter-effects suites. Mesh pins, face-aware constraints and the full
Photoshop Liquify tool family remain staged.
Brush-family controls also include a persisted Flow amount that scales local
dab opacity independently from overall Opacity. `tests/browser/brush-flow.spec.ts`
covers the accessible control and project-file round-trip; the setting defaults
to 100% for legacy drafts and is documented in `docs/brush-flow-contract.md`.

The Gradient tool now exposes persisted Linear and Radial geometry. Radial
mode uses the drag start as its centre and drag distance as its radius while
retaining source-safe undoable commits. Desktop/mobile UI, pixel-change,
reload and project-file coverage is in
`tests/browser/gradient-modes.spec.ts`; limitations are recorded in
`docs/gradient-mode-contract.md`.

Gradient geometry now also includes Reflected mode, with colour at both ends
and a transparent midpoint on the authored linear axis. Up to six ordered
interior gradient stops are now authored for Linear and Radial modes; the legacy
midpoint control remains the fallback when no stop list is present. Noise and
gradient-map behaviour remain staged. The persisted Gradient end control can use
either the transparent default or the current background colour, including for
the reflected midpoint. An optional persisted authored midpoint colour now adds
a deterministic third stop. A bounded deterministic Dither control is also
persisted and tested for nontransparent gradient pixels, with a configurable
1%-99% midpoint position; a bounded deterministic RGB Noise control now adds
independent opaque-pixel variation while preserving alpha and transparent RGB;
a persisted Reverse control swaps Linear/Radial start
and end colours while preserving Reflected symmetry.

The current local increment adds two independently tested capabilities. Filter
→ Stylize → Solarize is a bounded channel-wise nondestructive approximation with
editable amount metadata and transparent-RGB safety. Select → Object Selection…
is a click-seeded connected-colour proxy with bounded tolerance and edge
softness; it writes the normal persisted selection mask and explicitly does not
claim semantic object recognition. Pure coverage, desktop/mobile acceptance,
typecheck, lint and production-build evidence are present on the roadmap branch;
protected CI and the deployed/live candidate remain separate gates.

The next local filter increment adds Filter → Stylize → Diffuse. It blends
visible pixels toward a bounded four-neighbour average, retains editable
amount/radius metadata, preserves alpha and transparent RGB, and has dedicated
pure and desktop/mobile persistence coverage. It remains local evidence until
the protected workflow publishes and verifies the candidate revision.

The current geometry increment adds Edit → Perspective Warp for visible,
unlocked raster and smart-object layers. Four validated convex target points
produce a same-sized source-safe raster approximation; pure and desktop/mobile
tests cover mapping, source retention, undo history and reload persistence.
Mesh-aware warp semantics and the deployed/live release gates remain separate.

The current vector increment adds `Type → Create Work Path`. It converts an
active selection's bounded rectangle into a four-anchor editable path layer,
retaining selection/source state and project/reload identity. The approximation
and its desktop/mobile persistence coverage are documented separately from
full alpha-contour tracing.

The following local increment adds Filter → Stylize → Wind, a bounded
directional source-sampling approximation with editable amount, radius and angle
metadata. Its pure and desktop/mobile tests cover deterministic directional
output, source safety, alpha preservation and reload persistence; CI and live
deployment remain independent release gates.

The current vector increment replaces the earlier Work Path bounds approximation
with a resolved-alpha contour tracer. `Type → Create Work Path` now preserves
irregular silhouettes, disconnected islands and holes as bounded editable
compound contours with an even-odd fill rule, while leaving selection and source
pixels unchanged. Pure coverage includes malformed input and contour topology;
desktop/mobile acceptance verifies the command, export and reload round trip.
The 710-test local suite, typecheck, lint and production build pass for this
candidate; protected CI, deployment and live acceptance remain separate gates.

The follow-up typography increment adds `Type → Convert to Shape` for visible,
unlocked editable text. It vectorizes the current rendered glyph alpha into a
bounded compound path, retains layer identity and group/opacity/blend metadata,
and restores the editable text through undo. Desktop/mobile acceptance checks
representative alpha coverage, path persistence, reload-safe export and undo;
font-outline fidelity and OpenType semantics remain explicitly out of scope.

The compositing increment adds `Layer → Matting…` for visible raster and
smart-object layers. Validated white/black matte metadata decontaminates
semi-transparent edge RGB before masks and filters without changing alpha or
the immutable source asset. Pure pixel/validation coverage and desktop/mobile
acceptance cover representative output, persistence and undo. The local suite
now passes 747/747 tests at that historical increment; subsequent local
increments raise the current full suite to 753/753. Protected CI, deployment and live acceptance remain
separate gates.

The next filter increment adds `Filter → Stylize → Gradient Map…`. It maps
source luminance between editable shadow/highlight colours as nondestructive
metadata, preserving source assets, alpha and transparent RGB. Pure coverage
and desktop/mobile pixel, source-retention, reload and portable-project tests
are present in the local candidate; multi-stop gradient libraries, LUT parity
and protected CI/deployment/live acceptance remain separate gates.

The next filter increment adds `Filter → Convert for Smart Filters` and
`Clear Smart Filter Stack`. Existing local filter effects can now be retained
as an ordered stack of up to eight nondestructive entries, rendered before a
later effect while preserving source pixels and project identity. Pure stack
validation and desktop/mobile representative-pixel/reload coverage are present;
the candidate is still awaiting protected CI, deployment and live acceptance.

The vector interoperability increment adds `Layer → Copy SVG`. Editable path,
rectangle, ellipse and polygon layers are converted through the shared
transformed path model and copied as deterministic standalone SVG without a
history commit. Pure serialization and desktop/mobile clipboard evidence cover
geometry, fill/stroke metadata and unsupported-layer guards; font embedding and
Photoshop document-graph export remain staged.

The typography utility increment adds `Edit → Find and Replace Text…`. A local
dialog searches only editable text layers, supports Match case and Whole words
only, commits all replacements as one immutable history frame, and leaves
non-text content untouched. Pure tests cover case/word-boundary behavior,
immutability and no-op handling; desktop/mobile acceptance covers the menu,
dialog, replacement notice and project-file round trip. The candidate remains
local evidence until protected CI, deployment and independent live acceptance
pass for its SHA.

The command-discoverability increment adds `Edit → Search` and Ctrl/Cmd+F. The
palette derives results from the live menu inventory and reuses command guards,
so disabled roadmap entries remain visibly disabled and command execution still
passes through the normal history and privacy boundaries. Desktop/mobile
acceptance covers filtering and running a transform command; this remains local
evidence until protected CI, deployment and live acceptance pass.

The performance increment adds `Edit → Purge Undo History…`. It explicitly
compacts retained history to the current validated frame without deleting the
local draft or flattening its layer tree. Pure planning and desktop/mobile
confirmation, disabled-state, dimension, and project round-trip coverage are
present; the candidate remains local evidence until protected CI, deployment
and live acceptance pass.

The latest local filter increment adds `Filter → Noise → Median…`: a bounded editable median kernel with amount blending, source/alpha/transparent-RGB safety and desktop/mobile persistence coverage. It remains local evidence until the protected workflow and live endpoint are independently verified.

The next local filter increment adds `Filter → Noise → Add Noise…`: a seeded
uniform perturbation with editable amount, Uniform/Gaussian distribution and monochromatic mode. Visible
pixels change deterministically while alpha, transparent RGB and source assets
remain unchanged; pure and desktop/mobile persistence coverage is included.
The implementation is an explicitly bounded approximation and remains local
evidence until protected CI, deployment and live acceptance pass.

The follow-up action-system increment adds the active noise, cleanup, gradient
map, lens-correction and Liquify filter commands to the deterministic Action
replay allowlist. Pure replay coverage verifies every command remains
allow-listed and completes in order; this closes a batch-workflow data-model
gap without implying that Action execution has passed production gates.

The follow-up noise increment adds `Filter → Noise → Dust & Scratches…`: a bounded thresholded local-median cleanup with editable radius, threshold and amount. Pure and desktop/mobile round-trip tests cover outlier replacement, transparent-RGB safety and source retention; protected CI and live deployment remain separate gates.

The noise family now also includes `Filter → Noise → Despeckle`, a fixed-radius local cleanup command with deterministic source-safe rendering and desktop/mobile persistence coverage. This bounded approximation does not claim Photoshop's texture-aware detector.

The Noise family now also includes `Filter → Noise → Reduce Noise…`, a bounded colour-weighted local filter with an editable preserve-details threshold. Pure and desktop/mobile tests cover representative smoothing, edge retention, transparent-RGB safety, source retention and project persistence.

The advanced-correction increment now also includes `Filter → AI Denoise…` as
a private deterministic Y’CbCr bilateral approximation with editable radius,
edge-protection threshold and amount. Pure and desktop/mobile tests cover
chroma smoothing, luminance-edge retention, transparent-RGB/source safety,
Action defaults and project reload. Model-backed RAW and temporal denoising
remain staged behind explicit privacy and capability contracts.

The same increment now includes `Filter → AI Sharpen…` as a private
deterministic luminance-detail approximation with editable radius, edge
threshold and amount. Pure and desktop/mobile tests cover high-frequency edge
enhancement, flat-field identity, transparent-RGB/source safety, Action
defaults and project reload. Model-backed RAW priors, deconvolution and
camera-aware sharpening remain staged.

The current geometry increment adds `Filter → Distort → Twirl…`. It uses a
bounded quadratically tapered rotational inverse map with premultiplied-alpha
bilinear sampling, preserving source bytes and transparent edge RGB. Pure and
desktop/mobile persistence tests cover the editable angle and reload behavior;
full mesh/liquify semantics remain staged.

The follow-up geometry increment adds `Filter → Distort → Liquify…` as a
bounded local push/twist inverse map with editable centre, radius and angle.
It preserves immutable source assets, alpha and transparent hidden RGB and is
covered by pure pixel/metadata tests plus desktop/mobile menu, undo-source and
reload acceptance. Photoshop mesh, face-aware and brush-history semantics
remain staged.

The toolbar increment adds persistent category visibility controls to
`Edit → Toolbar…`. Users can hide unused categories to reduce empty vertical
space; the UI keeps one category visible and returns to Move if the active
tool's category is hidden. Desktop/mobile reload tests cover the preference and
the compact palette remains free of duplicate family slots.

The same toolbar settings now persist category ordering with keyboard-accessible
up/down controls and a Reset defaults action. Desktop/mobile tests verify
reordered categories, safe reset, and family-choice reset survive the editor session; shortcut
rebinding is covered by the Keyboard Shortcuts contract below.

Toolbar local-storage values now pass through a versioned normalization
contract that removes unknown and duplicate category IDs, completes newly added
categories, validates column values, and prevents hiding every category. Pure
migration tests cover malformed and collision cases.

Toolbar settings also persist per-category tool-slot ordering. The order is
normalized against the current taxonomy, unknown and duplicate tool IDs are
discarded, newly introduced tools are appended, and family variants remain one
compact slot with their existing press-and-hold menu. Desktop/mobile reload
coverage and pure migration tests cover the preference boundary; shortcut
rebinding remains staged.

The toolbar icon-grid hardening gives every visible tool a fixed 26×26 icon
box with a 24px SVG, equal minimum button height, and dense row packing. This
keeps icons aligned across different viewBox proportions and prevents later
categories from leaving placeholder gaps. The focused desktop/mobile browser
regression passes **2/2**; protected CI and release deployment remain the
authoritative acceptance gates.

Distinct tool icons (audit 2026-11-03): the live release `0394bc3` rendered
icons in every flyout, but many were the same drawing. All five Crop & Slice
variants used Crop; all three Lasso variants, Selection Brush, Quick
Selection, Magic Wand, Healing, Spot Healing and Patch shared one wand (`Wand2`
is a Lucide alias of `WandSparkles`); the three Pen variants used Pencil; and
Rectangular Marquee used the Crop glyph. `TOOL_ICONS` in `src/toolPalette.ts`
now assigns each of the 59 palette tools its own canonical Lucide icon. Pure
tests render every icon and reject shared names, aliases and identical
drawings, per flyout and across the palette. Desktop/mobile Playwright opens
every flyout by keyboard and compares the rendered SVGs, and checks that
choosing a subtool swaps the representative slot's icon. Those three browser
tests fail against the live `0394bc3` site and pass on the branch.

Keyboard Shortcuts now provides editable local tool and menu-command binding
sections. Tools accept validated alphanumeric chords, while commands accept
validated alphanumeric, punctuation and function-key chords. Collisions,
malformed values and unknown IDs fail closed; the built-in Photoshop-style
shortcuts stay active when a command has no override. Exact modifier matching, versioned local persistence, per-row resets and a
Reset all action are covered by pure tests and desktop/mobile reload acceptance. Browser-reserved shortcuts,
disabled menu entries and physical-device parity remain explicit limitations.

Filter → Last Filter now remembers the most recently selected nondestructive
effect in a validated local preference, survives reload, remains disabled until
a valid effect is chosen, and reuses the existing source-safe editable metadata
path. Pure malformed-value normalization and desktop/mobile coverage cover the
guarded empty state, reload and repeat selection.

The normalized values are also stored in a versioned toolbar-preferences
envelope, while the earlier individual keys remain readable for migration.
Unsupported envelope versions fail closed to the canonical defaults.

Command shortcuts now have a separate versioned local preference envelope.
Edit → Keyboard Shortcuts exposes validated overrides for the advertised menu
commands, including punctuation and function-key chords; exact modifier
matching routes through the normal command dispatcher and survives reload.
Pure and desktop/mobile acceptance cover normalization, collision rejection,
invocation and persistence. See
[`command-shortcuts-contract.md`](command-shortcuts-contract.md).

## TIFF composite import candidate (`befd7ef`)

The candidate adds bounded classic TIFF composite import for 8-bit chunky
RGB/RGBA and grayscale/alpha using raw or PackBits strips in either byte order.
The follow-up hardening adds strict per-channel BitsPerSample validation,
None/Horizontal predictors, EXIF orientation normalization for values 1–8 and
explicit associated/unassociated alpha handling with safe unpremultiplication.
Unsupported BigTIFF, tiled/planar, palette, CMYK, unsupported compression,
oversized and malformed inputs fail before replacing the active draft. PSD/PSB
and TIFF batch decode use the same bounded decoders as editor open/import.
TIFF-specific pure tests pass 5/5; the focused import browser suite passes
20/20 across desktop and mobile, including representative pixels,
flattening disclosure and malformed-file draft retention. The complete local
pure suite passes 822/822, and lint, typecheck and production build pass.

Protected PR workflow #634 passed for the preceding TIFF SHA
`8757eb052539b112f7314befd7f84498cbfda6bb`; it validates the initial TIFF
scope but not this hardening commit. PR #136 is open at `befd7ef`; a new
protected run is required for this exact SHA. The live site remains healthy on
`7495c1b4f2490c7a135ef9011d7fd0ffefae93b6`; candidate deployment,
DNS/TLS/live-editor/export and authorization checks have not occurred. Keep
the completion estimate unchanged until the candidate passes protected CI,
merge/deploy and its applicable independent live checks. TIFF scope and
limitations are in [`tiff-import-contract.md`](tiff-import-contract.md).

## Font fallback disclosure increment

The Type menu now activates **Manage Missing Fonts** for the bounded local
font family list. A browser-local `FontFaceSet` check reports each family as
available or **Fallback active**, and the Text tool inspector repeats the
warning for the selected family. Editable text remains local and reload-safe;
no font files, text content or document pixels are uploaded. Malformed and
unavailable values fail closed to fallback. Pure coverage is 830/830, with
desktop/mobile browser acceptance 2/2; lint, typecheck and production build
also pass locally. Provider-backed font installation, full OpenType shaping
and language-specific fallback chains remain staged. See
[`font-fallback-contract.md`](font-fallback-contract.md).

## Menu visibility preference increment

**Edit → Menus…** now persists a versioned browser-local preference for hiding
explicitly disabled roadmap commands. Working commands, command search,
document pixels and project files remain unchanged; malformed preferences fail
closed to the default capability-map view. Pure coverage is 832/832 and the
desktop/mobile acceptance is 2/2; lint, typecheck and production build pass
locally. See [`menu-preferences-contract.md`](menu-preferences-contract.md).

## Mask All Objects increment

**Layer → Mask All Objects** now applies the bounded offline edge-connected
background proxy to every visible unlocked raster layer in one undoable commit.
It stores canvas-sized nondestructive masks, keeps source assets and alpha
unchanged, and disables itself when all raster layers are hidden or locked.
Semantic object/subject detection and provider-backed segmentation remain
staged. The focused browser coverage checks representative mask pixels, source
asset identity, undo, lock gating and both desktop/mobile projects. See
[`mask-all-objects-contract.md`](mask-all-objects-contract.md).

## High Pass filter increment

`Filter → Other → High Pass…` is now enabled as a bounded neutral-grey local
edge residual. Editable amount/radius metadata, source/alpha/transparent-RGB
safety, locked-layer guards, undo, reload and portable-project round trips are
covered by pure and desktop/mobile tests. Blend-mode compositing,
channel-specific high-bit-depth processing and exact Photoshop parity remain
staged; see [`high-pass-effect-contract.md`](high-pass-effect-contract.md).

## Flattened PSD export increment

The Export dialog now offers **PSD — flattened composite**. It writes a
bounded version-1 8-bit RGB PSD with separate R, G, B and alpha planes from the
rendered artboard. The encoder is deterministic, source-safe and limited to
16 megapixels/30,000-pixel dimensions; empty color-mode, image-resource and
layer/mask sections make the loss boundary explicit. PSD previews use the
rendered PNG preview because browsers do not display PSD blobs. Pure tests
round-trip the emitted bytes through the bounded PSD composite decoder and
cover planar ordering, signatures and malformed dimensions; desktop/mobile
export acceptance checks the download signature, disclosure and absence of
quality/target-size controls. Layered PSD/PSB, profiles, metadata and editable
document round trips remain staged; keep the `.pixelforge` project for editing.

## Single-page PDF export increment

The Export dialog now offers **PDF — flattened page**. It mattes the rendered
composite to white, encodes one local JPEG image XObject on a deterministic
single-page PDF, and omits layers, editable text, profiles, metadata and undo
history. The encoder enforces the same 16-megapixel/30,000-pixel bounds as the
other interchange outputs and runs on the main thread because it is a binary
container encoder rather than an `image/*` browser MIME path. Pure tests cover
the PDF header, catalog/page/image objects, JPEG embedding and malformed bounds;
desktop/mobile tests cover the dialog disclosure, download signature and
absence of quality/target-size controls. The matching import boundary now
accepts only a bounded one-page DeviceRGB 8-bit JPEG image XObject, decodes it
locally and publishes one flattened editable raster; parser tests cover image
extraction, truncation, duplicate-image and dimension guards, and browser
acceptance exports a real PDF then imports it back. General multi-page PDF,
vector/text/font/profile/metadata support and editable PDF round trips remain
staged; keep the `.pixelforge` project for editing. See
[`pdf-import-contract.md`](pdf-import-contract.md).
