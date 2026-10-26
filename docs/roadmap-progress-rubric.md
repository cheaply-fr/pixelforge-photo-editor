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
metadata round trips remain staged.

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
