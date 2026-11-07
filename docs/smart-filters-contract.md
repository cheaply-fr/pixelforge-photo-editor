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
Polar Coordinates gained centre sliders. Editing a stacked entry's parameters
in place, per-filter blend modes and per-filter masks are not yet supported.
