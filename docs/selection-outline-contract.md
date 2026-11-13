# Selection outline contract

Every active selection is drawn with an animated dashed outline ("marching
ants"), whatever created it: marquees, lassos, Selection Brush, Quick
Selection, Magic Wand, Color Range, Type Mask, Quick Mask exit, refinement
commands, Select All / Reselect, and selections restored from a draft or a
`.pixelforge` file.

- **Geometry**: the selection is rendered to its frame-space alpha plane
  (`renderSelection`, including feather, inversion, masks, multi-part
  composition and transforms) and traced by `selectionOutline` in
  `src/selectionOutline.ts` at 50 % coverage. Boundary edges are merged into
  horizontal and vertical runs, so separate islands and holes are outlined
  separately. The trace runs once per selection change, off the pointer path,
  and only visits each row's covered span (identical path output);
  busy masks are traced on a coarser grid so the path stays bounded
  (`SELECTION_OUTLINE_MAX_SEGMENTS`).
- **Rendering**: an `svg.selection-outline` (`data-testid="selection-outline"`)
  inside `.canvas-wrap` with a frame-sized `viewBox`, so it follows zoom, pan
  and Rotate View with the canvas. A white base stroke under a black 4/4 dash
  keeps it visible on any image; strokes are non-scaling 1 px lines. It is
  `aria-hidden` and `pointer-events: none`.
- **Motion**: the dash offset animates; with `prefers-reduced-motion: reduce`
  the dashes are static.
- **Quick Mask**: the outline is hidden while Quick Mask is on and returns
  when Quick Mask is converted back to a selection.

## Delete / Backspace

With an active selection, Delete or Backspace (outside text fields, menus and
dialogs, and not during a gesture or Quick Mask) clears the selected pixels of
the active visible, unlocked raster layer to transparency as one undoable
history step (`clearSelectedPixels` in `src/colorRegion.ts`; feathered
coverage clears partially). The selection stays active. Other layer kinds get
a notice and are not changed. A selection that covers no pixels clears
nothing and shows "No pixels are selected". Alt/Option+Backspace and
Ctrl/Cmd+Backspace are the quick fills, not Clear (docs/keyboard-shortcuts.md). In the Layers list, Delete still deletes the
focused layer row.
