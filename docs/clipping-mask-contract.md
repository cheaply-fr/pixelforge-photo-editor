# Clipping mask contract

PixelForge stores a clipping relationship on the active raster or embedded
smart-object layer with `clippingTo`, pointing to the directly lower
pixel-producing layer in the same root or folder. The base may be raster,
smart-object, editable text, a parametric shape, a line, or a path. A path's
rendered alpha includes compound contours and even-odd holes.

Create and Release Clipping Mask are available from the Layer menu and Layers
panel. The source and base must be visible and unlocked. Each accepted action
creates one history entry; Undo and Redo restore the relationship. Delete,
grouping, and import validation remove links that are no longer adjacent,
same-folder, or structurally valid.

Consecutive clipped layers form one clipping group. Each stored link still
names the adjacent lower layer, but rendering follows the links down to the
group's base: every clipped layer in the group uses the base's alpha, not the
alpha of the clipped layer directly below it, and the Layers panel reports
"Clipped to <base>". Documents saved with such chains load unchanged.

Bring Forward, Send Backward, Bring to Front, Send to Back and the panel's
Raise/Lower keep a clipped layer clipped while it still sits directly above
its group's base or another layer of the same group (the adjacent link is
re-pointed). A clipped layer moved out of its group is released and the
status names it; Undo restores it.

Arranging never releases another layer's clipping:

- A clipping group moves as one unit for layers outside it. Bring Forward,
  Send Backward and Raise/Lower step an outside layer past the base and all
  of its clipped layers in one move, so it never lands inside the group.
- Selecting a group's base selects the whole group (like a folder member
  selects its folder), so the base carries its clipped layers along for every
  arrange command. A locked clipped layer blocks moving its base.
- A clipped layer selected on its own keeps the single-step behaviour inside
  its group; stepping out of the group releases only that layer, and stepping
  up past a neighbouring clipping group jumps that whole group.
- The Layers panel has no drag-and-drop reorder; Raise/Lower are its only
  reorder controls, so an unclipped layer cannot be dropped into the middle
  of a group. (Chosen behaviour: such a move skips the whole group rather than
  joining it.)

Rasterize and Rasterize Type Layer keep the layer's ID, name, folder,
visibility, lock, opacity, blend, live layer styles, transform link and
clipping relationship; masks, smart filters, filter effects and adjustments
are baked into the new pixels as before. A rasterized base keeps its clipped
layers. Merge Down / Merge Layers keep the remaining clipped layers clipped to
a merged base, and a merge of layers that are all clipped in one group stays
clipped to the layer below. Nest as Smart Object does the same for the new
smart object and drops links inside the nested contents whose base stayed
outside. Apply Image and Calculations composite the visible image and still
release the target's clipping link.

The Layers panel indents each clipped row under its base with an `↳` glyph
(hidden from assistive technology) and exposes "Clipped to <group base>" as
the row's accessible description; the row's accessible name stays
"Select layer <name>". The indent fits the compact mobile layout.

Rendering isolates the source and base, then multiplies source alpha by the
base's rendered alpha. This preserves unrelated lower artwork, source RGB
bytes, transforms, masks, adjustments, styles and editable base geometry.
Project export/import and local draft reload retain the relationship. The
bounded slice excludes adjustment layers as bases.

Pure coverage includes adjacency, root/folder guards, invalid-link cleanup,
compound-base eligibility and immutable partial-alpha buffers. Browser coverage
runs the menu and touch-safe Layers-panel controls, pixels, undo/release,
reorder cleanup and project round-trip on desktop and mobile profiles.
`tests/clipping-rasterize-arrange.test.mjs` and
`tests/browser/clipping-rasterize-arrange.spec.ts` cover Rasterize of every
layer kind (including a Clouds + Emboss smart filter stack), merge
replacement, whole-group arrange steps, base expansion, folder blocks, undo
and the clipped-row indicator.
