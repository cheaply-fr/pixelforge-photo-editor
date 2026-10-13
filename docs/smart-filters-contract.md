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
