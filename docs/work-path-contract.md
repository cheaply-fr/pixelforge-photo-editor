# Work Path contract

`Type → Create Work Path` is active when a selection exists. PixelForge renders
the resolved selection alpha (including feather, inversion, composed regions and
transformed masks), traces its pixel silhouette into one or more editable
closed path contours, keeps the selection and source layers unchanged, and
exposes the path to Direct Selection for anchor editing. Compound contours use
an even-odd fill rule so disconnected islands and holes survive project
round-trips. The new path participates in normal layer history, project export
and reload.

The tracer is intentionally bounded and axis-aligned: it uses a configurable
alpha threshold, removes collinear anchors, caps contours at 64 and nodes per
contour at 4096, and does not claim Photoshop's tolerance smoothing, Bézier
fitting, hairline optimization, or semantic vectorization. Pure tests cover
irregular silhouettes, disconnected islands, holes and malformed input;
desktop/mobile acceptance covers selection-to-path creation and project
round-trip persistence.
