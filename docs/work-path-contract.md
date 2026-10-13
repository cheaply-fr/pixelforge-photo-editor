# Work Path contract

`Type → Create Work Path` is active when a selection exists. PixelForge creates
an editable closed path layer around the selection's bounded rectangle, keeps
the selection and source layers unchanged, and exposes the path to Direct
Selection for anchor editing. The new path participates in normal layer
history, project export and reload.

This is intentionally a bounded selection-bounds approximation. It does not
claim Photoshop's full alpha-contour tracing, tolerance smoothing, or hairline
path optimization. Pure validation is covered by the existing path model;
desktop/mobile acceptance covers selection-to-path creation and project
round-trip persistence.
