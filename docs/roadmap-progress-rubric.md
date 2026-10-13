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

The repository contains broad partial implementations across all eight stages. The last locally recorded toolbar milestone had 668 passing unit tests and 18/18 focused desktop/mobile toolbar tests. Protected run `38386650794` completed successfully for `7495c1b4…`, including its production deploy. Independent live checks then matched that SHA in `/release.json` and `/api/readyz.json`; DNS resolves through `photoeditor-cheaply.web.app` to `199.36.158.100`, TLS verifies for `photoeditor.cheaply.fr`, the editor reports `v0.1.0 · Server online · 7495c1b4…`, and the export dialog confirmed a downloaded 102,221-byte JPEG with metadata privacy disclosure. PR #136 remains a separate, unmerged documentation change. Newer gradient endpoint and midpoint work is locally validated on the roadmap branch but is not represented by that deployed baseline.

Progress percentages in status reports are estimates derived from this rubric and must identify the stage evidence that is still missing. They must never be increased solely because source files changed.

The bounded local Content-Aware Move slice is available through `Edit →
Content-Aware Move…`. It requires an explicit selection, fills the vacated
region from deterministic local context, translates the selected pixels and
commits a new undoable asset; semantic object removal and generative inference
remain outside this contract. Pure and desktop/mobile acceptance are recorded
in `docs/content-aware-move-contract.md`.

## Latest local increment

The inspector now exposes a History timeline backed by the existing bounded
immutable frame stack. It provides keyboard-addressable summaries and direct
restore navigation without a second document model; the restore path retains
the existing branch semantics and local conflict protections. Pure coverage is
in `tests/history-timeline.test.mjs`, and desktop/mobile acceptance coverage is
in `tests/browser/history-panel.spec.ts`. This increment is locally verified;
it is not CI, deployment or live acceptance until a protected workflow runs for
the candidate SHA.

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
now passes 713/713 tests; protected CI, deployment and live acceptance remain
separate gates.

The next filter increment adds `Filter → Convert for Smart Filters` and
`Clear Smart Filter Stack`. Existing local filter effects can now be retained
as an ordered stack of up to eight nondestructive entries, rendered before a
later effect while preserving source pixels and project identity. Pure stack
validation and desktop/mobile representative-pixel/reload coverage are present;
the candidate is still awaiting protected CI, deployment and live acceptance.
