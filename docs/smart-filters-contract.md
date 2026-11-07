# Smart Filters contract

`Filter → Convert for Smart Filters` is active for a visible, unlocked raster
or embedded smart-object layer when a local nondestructive filter effect is
selected. It moves the current validated effect into an ordered stack of up to
eight `smartFilters`, clears the single-layer adjustment slot, and renders the
stack in order before any later local filter effect. `Filter → Clear Smart
Filter Stack` removes the stack as one undoable metadata edit. Source assets,
alpha, layer identity and existing filter parameters remain unchanged; the
stack survives local/project reloads.

This is a bounded local filter graph, not Photoshop's full Smart Object or
Smart Filter UI. Each entry uses the existing deterministic effect renderer,
so provider, neural, camera-raw, linked-source, mask-order and per-filter blend
semantics remain staged. Pure tests cover validation, order, immutability and
the eight-effect limit; desktop/mobile acceptance checks representative pixels,
source metadata, project export and reload persistence.

## Filter stack panel and centred-filter placement

The Filter effects panel lists the active raster or smart-object layer's stack
as **Filter stack**. **Add filter to stack (n/8)** performs the same conversion
as the menu command, so a user can apply Mosaic, stack it, then choose Emboss
(or any other filter) on the same layer without rasterizing. Each stacked
entry can be hidden or shown (`enabled: false` is stored only for hidden
entries, so older stacks load unchanged), applied earlier or later, or
removed. Every change is one undoable metadata edit. Hidden entries never
render and are excluded from the layer-filter cache key (#185), so showing an
entry again can reuse a still-resident cached surface. Stacked entries render
first, in order, then the live filter. Pure tests: `tests/filter-stack.test.mjs`;
desktop/mobile: `tests/browser/filter-centers-stacks.spec.ts`.

Centred filters (Radial/Spin Blur, Twirl, Pinch, Spherize, Polar Coordinates,
Lens Flare, Ripple, Liquify, Iris/Path/Tilt-Shift Blur, Lens Correction,
Adaptive Wide Angle, Flame, Tree) store `centerX`/`centerY` as layer-local
fractions with 1e-6 precision (`src/filterCenter.ts`) instead of the whole
percentages the sliders used to produce (1 % ≈ 41 px on a 4096 px layer). The
sliders still step in whole percent; exact entry uses the **Filter center X/Y
(px)** fields (0.1 px steps) or the on-canvas crosshair. The crosshair can be
dragged, which commits one undoable edit on release, or focused and moved with
the arrow keys (one layer pixel, Shift for ten, Home recentres). Twirl and
Polar Coordinates gained centre sliders. Per-filter blend modes and
per-filter masks are not yet supported.

## Editing a stacked entry in place

Each stacked entry has an **Edit stacked filter n. Name** toggle
(`aria-pressed`). While it is on, the Filter effects panel shows "Editing
stacked filter n" with a **Done** button, and the same controls — filter type,
sliders, centre fields and the on-canvas crosshair — read and write that entry
instead of the live filter. Every change is one undoable metadata edit
(`replaceSmartFilter`): the entry keeps its position and hidden state, the
effect is validated and normalised like an appended entry, and Clear does not
empty a stacked entry (Remove does). The selection follows the entry when it is
moved, ends when it is removed, and falls back to the live filter on another
layer or when undo removes the entry. The live filter is never touched while
an entry is being edited, and action recording keeps recording only the live
filter. The #185 cache key hashes the normalised stack, so an edit misses the
cache and restoring the old parameters (undo) hits the earlier key again.

Evidence: `replaceSmartFilter`/`trackedSmartFilterIndex` in
`src/smartFilters.ts` with `tests/effects-polish.test.mjs` (hidden flag
retained, bounds and invalid input, render and cache key change and restore,
index tracking) and `tests/browser/effects-polish.spec.ts` on desktop and
mobile (edit Mosaic's cell size beneath a live Emboss, pixels change, undo and
redo, Clear refused, Done returns to the live filter, project and reload).
