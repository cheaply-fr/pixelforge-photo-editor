# Adjustment Brush contract

PixelForge's Adjustment Brush is a local, nondestructive mask-painting tool for
source-free adjustment layers. It uses the existing canvas-space layer mask
asset: a Reveal stroke increases mask alpha and a Conceal stroke (the
**Paint** option, or Alt-drag) lowers it. The Mask Brush and Mask Eraser
refine masks on raster content only: on an adjustment layer they are refused
with "Select a visible, unlocked raster layer before refining its mask", so
use the Adjustment Brush in Conceal mode to paint an adjustment out. Adjustment parameters remain editable and underlying raster assets
are never rewritten.

An adjustment layer can receive a mask from the current selection through the
Layer panel or Layer menu. The Adjustment Brush requires a visible, unlocked
adjustment layer. A fresh adjustment layer has no mask: the first stroke
creates a canvas-sized one, empty for a Reveal stroke (the adjustment then
applies only where painted) and fully revealing for a Conceal stroke (the
adjustment is removed where painted). The **Paint** option chooses Reveal or
Conceal; Alt-dragging uses the other mode for one stroke. An existing mask is
refined in place. Before the 2026-11 audit (B-11) every stroke on a fresh
adjustment layer was refused with the Mask Brush message. Brush size,
hardness, opacity and pen/touch pressure sampling use the existing bounded mask
refinement implementation. Each completed stroke is one undoable history entry;
cancelled and no-op gestures do not create history.

Masks are validated as frame-sized assets, included in project asset compaction,
transformed with the document, and retained through local draft reload and
project export/import. Rendering applies the adjustment only where mask alpha
permits it, including inverted masks, while preserving source pixels and alpha
outside the adjustment.

This milestone does not claim Photoshop's bristle, wet-media, Art History,
semantic object selection or pressure-curve systems. Those remain separate
roadmap work with their own pixel and device-budget gates.
