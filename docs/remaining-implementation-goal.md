# PixelForge remaining implementation goal

Complete all remaining work in the professional-editor roadmap for `cheaply-fr/pixelforge-photo-editor`. Preserve the original scope and every requested tool and menu capability extracted from the supplied Photoshop references. Deliver verified stages while protecting existing editing behavior and user data.

## Requirements and progress audit

Reconcile source, tests, pull requests, deployment records and live behavior into a deduplicated backlog. Give every requirement an acceptance criterion, dependency, status and evidence: verified shipped, partial, unimplemented or unverified. Correct duplicated and stale roadmap claims. Keep source, local validation, GitHub CI, merged release, deployment and live acceptance separate. Prioritize the researched high-use workflows and foundational gaps. Disabled entries, command aliases and bounded approximations do not establish Photoshop parity.

Replace the provisional completion percentages with a documented weighted rubric derived from the complete inventory. Hourly reports must identify new verified work, test results, PR/CI status, exact deployed revision, live health, limitations and next steps. No code change means no implementation progress.

## Recently shipped milestone

NTSC Colors has a documented local Y'IQ composite-envelope contract, editable nondestructive UI, unit coverage, and desktop/mobile browser coverage for worker/fallback rendering, locks, source retention, undo/redo, draft reload, portable projects and PNG pixels. Protected CI, PR review/merge, deployment and independent live-revision plus DNS/TLS verification completed in the main workflow for `0fc1857d07d08083b960a34dc77c6f6b2ecb3bde`; `/release.json` and `/api/readyz.json` report that exact revision. The local approximation does not claim broadcast compliance or Photoshop parity.

## Remaining roadmap stages

1. **Document foundations:** finish missing depth in editable raster/text/vector layers, layer groups and stacking, artboards and frames, nondestructive raster/vector/clipping masks, smart-object semantics, asset ownership/compaction and versioned persistence. Artboards now have guarded per-viewport visibility controls with at least-one-visible export safety, isolated layer-tree rendering, and desktop/mobile persistence coverage. Linked/nested smart-object semantics and full asset compaction remain staged; audit every existing implementation against its real behavior and regression contract.
2. **Selections and precision:** complete requested rectangle/ellipse/row/column/lasso/color-based and automatic selections, replace/add/subtract/intersect/invert/feather and refinement, precision transforms, selection transforms, crop/perspective crop, slices, frames and remaining warp workflows. Preserve editable metadata and cancel/undo safety; disclose composite-raster operations.
3. **Painting and retouching:** deepen configurable brush/eraser/pencil/mixer/history/adjustment tools, size/hardness/opacity/flow, pressure and touch, presets/dynamics/stabilization, eyedropper, fill/gradients, clone/pattern stamp, healing/patch/removal, dodge/burn/sponge/blur/sharpen/smudge and requested cleanup tools. Evaluate semantic and content-aware capabilities separately from deterministic local substitutes.
4. **Typography and vectors:** finish text layout, alignment/spacing, shapes and parametric geometry, path/anchor/handle editing, vector Boolean limitations, text masks/conversions, OpenType shaping, warp/type-on-path and requested font workflows. Update All Text Layers now provides bounded supported font/size batch editing with an editable project round trip. Verify source editability, transforms, bounds, fill/stroke, hit testing and export pixels.
5. **Adjustments and menus:** complete nondestructive adjustment layers, hue/saturation, levels, curves, color balance, sharpen and noise depth; implement distinct algorithms for requested commands rather than presenting shared aliases as equivalent. Check Spelling now provides a bounded private local hint workflow, Color Settings stores an explicit sRGB/Display P3 working label; Assign Profile is metadata-only and Convert to Profile performs a bounded local raster/smart-object D65 transform without ICC embedding or authored vector/text conversion; Filter → Last Filter repeats the most recently selected nondestructive effect with a guarded empty state and reload-safe validated local preference. Complete the individual Edit/Image/Layer/Type/Select/Filter/View/Plugins capability inventory, including remaining gallery, distortion, procedural, video and color-management work under explicit contracts.
6. **Projects and exports:** strengthen reliable history, migration/corruption handling, conflict recovery, private-cloud authorization, account isolation, portable editable projects and recovery. Complete PNG/JPEG/WebP quality, byte-size control, metadata privacy, artboard exports and cancellable batch/Action workflows with per-file failure isolation and resource bounds. Audit lossless versus flattened behavior.
7. **Interaction and scale:** finish compact responsive categorized toolbar layouts, representative icons, hold-to-open subtools, group arrows, remembered subtools and Photoshop-compatible shortcuts. The local searchable Keyboard Shortcuts reference now derives from menu definitions, and Toolbar settings persist an anonymous two/three-column preference, category visibility, category ordering, and per-category tool ordering without placeholder rows. Keyboard Shortcuts also supports versioned one-character tool bindings with collision-safe normalization and reload persistence; selected flyout subtools now persist through a versioned local preference envelope and restore their compact representative after reload; modifier-aware tool chord rebinding now accepts validated Shift/Ctrl/Alt/Cmd combinations with reload persistence; **all working menu commands, including commands without a built-in shortcut, now accept validated local bindings with disabled-command guards and reload persistence** (see [`command-shortcuts-contract.md`](./command-shortcuts-contract.md)). Preserve optional profile/login/logout and version/server status. Close keyboard/accessibility, mobile/touch, offline recovery, worker/tile/cancellation/cache and measured latency/memory/device-budget gaps. Do not infer physical-device acceptance from emulation.
8. **Advanced and format evaluation:** complete optional background removal/object cleanup and separately evaluate HEIC/HEIF/TIFF/PSD/PSB/RAW/SVG/PDF interoperability with editable/lossless/flattened/unsupported labels. **PSD/PSB now has bounded flattened 8-bit RGB/grayscale composite import (raw and PackBits RLE) and TIFF now has bounded classic 8-bit chunky RGB/grayscale raw or PackBits import, both with source-safe failure handling; layered, profile, mask, page and metadata round trips remain explicitly unsupported.** Address requested generative, plugin/integration and synchronization capabilities already recorded in the roadmap only after privacy, resource, authorization, provider and failure contracts exist. Evaluations must record concrete evidence and limitations; supported capabilities require full release gates.

## Invariants and delivery gates

Preserve free anonymous editing without required sign-in or payment; optional existing Cheaply Marketplace authentication; bookmark/reload-safe durable drafts; private user-scoped cloud projects; source immutability; safe cancellation and recovery; metadata/privacy boundaries; and the canonical repository identity and protected Google Cloud CI/CD. Audit security, dependency and endpoint-authorization gaps as part of industrial-quality acceptance.

Every shipped milestone must include actual UI and data-model behavior, extensive meaningful pure/unit tests and desktop/mobile acceptance, representative pixels, persistence round trips and invalid-input/lock/cancellation/error coverage. Require green protected GitHub checks, a verified merge/deployment SHA, independent live editor and export behavior, DNS/TLS verification, and account/project authorization checks. Document bounded approximations and remaining gaps without claiming Photoshop equivalence.

The goal remains active until every original requirement and recorded capability passes its applicable acceptance gates. Missing, indirect or uncertain evidence means unfinished work. Do not narrow success to implemented subsets or mark the project complete to replace the goal.

The current layer-link increment adds `Layer → Link Layers`, `Layer → Unlink
Layers` and `Layer → Select Linked Layers`. Ordinary selected unlocked layers
receive a persisted `layerLinkId`; affine transform edits propagate to linked
peers as one undoable delta while each asset remains independent. Select Linked
Layers also selects every smart-object instance sharing a selected embedded
`linkId`, unions multiple selected link groups in stack order, preserves
pixels/transforms and source assets, and guards stale or unlinked selections.
Pure coverage is in `tests/layer-links.test.mjs` and
`tests/linked-layers.test.mjs`; desktop/mobile undo, reload, transform, pixel
and project round-trip coverage is in `tests/browser/layer-links.spec.ts` and
`tests/browser/smart-objects.spec.ts`. External provider-backed linked files,
nested links and synchronized cloud asset graphs remain staged. See
[`layer-links-contract.md`](./layer-links-contract.md).

The current typography increment adds `Type → Save Default Type Styles` and
`Type → Load Default Type Styles`. A bounded local preset stores supported
font, size, colour, weight, box width, alignment, line height, tracking and
orientation in versioned draft settings; loading it is one undoable editable
text-layer update that preserves content, identity and transforms. Pure
validation coverage is in `tests/type-styles.test.mjs`, and desktop/mobile
undo, reload, project round-trip and guard coverage is in
`tests/browser/type-style-presets.spec.ts`. Provider fonts and full OpenType
style libraries remain staged.

The current OpenType increment adds `Type → OpenType` and selected text-layer
controls for standard/discretionary ligatures, contextual alternates, kerning
and small caps. Settings are versioned layer metadata, browser Canvas 2D
typography requests, and source-safe desktop/mobile project round trips. Pure
coverage is in `tests/open-type.test.mjs`; browser coverage is in
`tests/browser/open-type.spec.ts`. Variable-font axes, language-specific and
vertical shaping, type-on-path alternates, font embedding and provider-backed
style libraries remain staged; see [`open-type-contract.md`](./open-type-contract.md).

The current Camera Raw increment adds `Filter → Camera Raw Filter…` as a
distinct bounded local correction. Highlights, Shadows, Temperature, Tint and
Clarity remain editable metadata and compose with existing exposure/vibrance
finishing without replacing source assets. Pure coverage is in
`tests/photo-adjustments.test.mjs`; desktop/mobile dialog, alpha, undo, reload
and project round-trip coverage is in `tests/browser/photo-adjustments.spec.ts`.
Camera profiles, demosaicing, linear-light RAW processing and Adobe parity
remain staged; see [`camera-raw-filter-contract.md`](./camera-raw-filter-contract.md).

## Goal text for recreation

Complete all remaining work in PixelForge's professional-editor roadmap for cheaply-fr/pixelforge-photo-editor, preserving the full original scope and every requested tool/menu capability from the supplied Photoshop references. Reconcile current source, tests, PRs, deployments and live behavior into a deduplicated requirement-by-requirement backlog; classify each requirement as verified shipped, partial, unimplemented or unverified. Preserve accepted shipped behavior and complete missing depth and release gates; do not count disabled entries, aliases or bounded approximations as Photoshop parity. Prioritize researched high-use workflows and foundational architecture rather than easy cosmetic additions. The NTSC Colors slice now has pixel, metadata, source-retention, undo/redo, reload, project round-trip, worker/fallback, desktop/mobile and export tests; retain its protected CI/CD and production-verification gate. Continue all remaining stages: (1) editable raster/text/vector document foundations, groups, artboards, raster/vector/clipping masks, smart-object semantics and safe versioned persistence; (2) precise selections, add/subtract/intersect/invert/feather, selection refinement, transforms, crop/slice/frame and remaining warp workflows; (3) brush/eraser/fill/gradient/eyedropper/clone/healing and retouch depth, advanced configurable brush dynamics, stabilization and pen/touch behavior, history tools and requested cleanup tools; (4) typography, layout/spacing, shapes, paths, text conversions and remaining OpenType/warp/type-on-path capabilities; (5) nondestructive adjustments, adjustment layers, levels/curves/color balance and remaining distinguishable sharpen/noise/filter algorithms, color-space contracts and requested menu operations; (6) durable history, migrations, corruption and conflict recovery, private-cloud authorization, portable editable projects, PNG/JPEG/WebP export quality/byte-size/privacy and cancellable batch/Action workflows; (7) responsive compact categorized toolbar with icons, hold-to-open subtools, arrows and Photoshop-compatible shortcuts, accessible keyboard/touch UI, optional account profile/login/logout, version/server status, offline editing and measured worker/tile/cancellation/cache and device-memory budgets; (8) optional background removal/object cleanup and separately evaluated HEIC/HEIF/TIFF/PSD/PSB/RAW/SVG/PDF interoperability, explicit editable/lossless/flattened and unsupported-format disclosures, with no unsupported equivalence claim. Include remaining integration/plugin, synchronization, generative and advanced menu capabilities already recorded in the roadmap; establish privacy, resource, capability and test contracts before enabling them. Preserve free anonymous editing without required sign-in/payment, optional Cheaply Marketplace authentication, bookmark/reload-safe drafts, private user-scoped cloud projects, source immutability, data safety, repository identity and the existing protected Google Cloud CI/CD. Each shipped milestone requires real UI and data-model behavior, extensive meaningful pure/unit and desktop/mobile acceptance tests, invalid input/locks/cancellation/error coverage, representative pixels and round-trip persistence, green required GitHub checks, verified merge/deploy SHA, independent live editor/export behavior, DNS/TLS and account/project authorization verification. Keep an auditable weighted completion rubric and explicit remaining limitations; hourly statistics must distinguish local tests, CI, deployment and live acceptance and must not invent progress. Finish only after every original requirement and recorded capability has passed its applicable acceptance gates; keep the goal active while any work or evidence remains missing.

