# Lens Flare filter contract

PixelForge's **Filter → Render → Lens Flare…** command is a deterministic,
nondestructive local approximation of a photographic lens flare. It stores only
validated `filterEffects` metadata and re-renders from the immutable layer
asset on preview, export, undo and project reload.

The bounded renderer adds a source-aligned soft glow, an editable-angle star
streak and four seeded ghost rings. `amount` controls brightness, `radius`
controls size relative to the shorter canvas edge, `centerX`/`centerY` position
the flare, `angle` rotates the streak and `seed` selects a reproducible colour
and ghost layout. It is local-only: camera profiles, chromatic aberration,
sensor bloom and spectral calibration are not inferred.

Every output starts as a detached source copy. Visible pixels receive a bounded
additive blend while alpha is copied byte-for-byte; fully transparent RGB
padding remains source-owned. Amount or radius zero is a detached no-op.
Metadata normalization clamps all fields, rejects malformed imported records and
survives project round trips. `filter-lens-flare` is allow-listed for Action
recording and replay.

Pure tests cover deterministic output, seeded/geometry changes, no-op identity,
source retention, transparent-edge alpha safety and metadata/action validation.
Browser acceptance covers the Render menu command, editable controls, source
asset retention, reload and undo.

Camera aperture shapes, highlight reconstruction, optical profiles, depth-aware
occlusion and worker/GPU-specific performance remain staged.
