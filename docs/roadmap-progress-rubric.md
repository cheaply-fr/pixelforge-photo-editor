# Roadmap progress rubric

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

## Current baseline

The repository contains broad partial implementations across all eight stages. The current default branch is `6515b45affed0a39113f9134fb8ebec2f5935d2d` (bounded OpenType controls). The live endpoint currently reports that same revision from both `/release.json` and `/api/readyz.json`, with `ready: true`; this confirms the deployed revision and readiness only. DNS/TLS, editor/export behavior and account/project authorization are separate live gates and are not inferred from these probes. Historical increment notes below preserve their original candidate SHAs and test counts; they are evidence for those increments, not claims about the current live deployment.

Two unreleased candidates are independently tracked. PR [#139](https://github.com/cheaply-fr/pixelforge-photo-editor/pull/139) (`c1ff5a51a0496a64d90ae0fc3fb7c7ac2d65927c`) contains the toolbar-family regression fix. Protected run [38757190047](https://github.com/cheaply-fr/pixelforge-photo-editor/actions/runs/38757190047) completed successfully, including the desktop/mobile toolbar suite; merge, deployment and live acceptance remain pending. PR [#140](https://github.com/cheaply-fr/pixelforge-photo-editor/pull/140) (`da8ca669130752d273328fe48395f477ec7c1909`) adds the bounded Adaptive Wide Angle effect. Protected run [38770857195](https://github.com/cheaply-fr/pixelforge-photo-editor/actions/runs/38770857195) completed successfully; deployment and live acceptance remain pending. Local evidence for the toolbar candidate is 844/844 pure tests and 24/24 desktop/mobile toolbar tests; the Adaptive Wide Angle candidate is 849/849 pure tests. These candidate results do not change the deployed revision or completion estimate.

Progress percentages in status reports are estimates derived from this rubric and must identify the stage evidence that is still missing. They must never be increased solely because source files changed.

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

## Latest local increment

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
