# Select and Mask contract

`Select > Select and Mask…` refines an existing selection locally. The dialog
accepts bounded edge smoothing (0–64 px) and feathering (0–1,000 px). The
current selection is rendered to a canvas-sized alpha mask, smoothed with the
deterministic local alpha-average primitive, and stored as a new project asset;
the source pixels, layers and original selection remain undoable. Feather is
retained as editable selection metadata and survives local draft reload and
portable project export.

This is an offline edge-refinement surface. It does not claim Photoshop's
semantic subject, hair, cloud or decontamination algorithms. Invalid values,
missing selections and unavailable mask surfaces fail closed. Desktop and
mobile acceptance covers opening the menu, applying the bounded controls,
mask persistence and reload; pure selection-refinement fixtures cover alpha,
determinism and invalid input.
