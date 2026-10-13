# Matting contract

`Layer → Matting…` is active for visible, unlocked raster and embedded
smart-object layers. The command records a validated matte colour (`white` or
`black`) and amount from 0–100 as layer metadata. During render, semi-transparent
edge RGB values are uncomposited against that matte while alpha and fully
opaque/transparent pixels remain unchanged. Source assets are immutable, the
operation is undoable, and metadata survives local/project round trips.

This is deterministic local colour decontamination, not semantic hair or edge
matting. It does not infer a background, reconstruct missing pixels, or provide
Photoshop's advanced defringe algorithms. Pure tests cover white/black channels,
partial amounts, alpha/transparent-RGB safety and validation; desktop/mobile
acceptance covers representative pixels, menu prompts, persistence and undo.
