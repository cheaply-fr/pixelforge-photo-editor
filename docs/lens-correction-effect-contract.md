# Lens Correction filter contract

Pixel's first Lens Correction slice is a deterministic bounded radial correction. Pixels are inverse-sampled toward or away from an editable centre using a smooth local falloff bounded by the persisted source-pixel radius, premultiplied-alpha bilinear interpolation, and clamped source coordinates. The bounded overlap makes large-document tiled rendering pixel-identical to the full-frame oracle. Source assets, destination alpha and transparent RGB remain unchanged; the metadata remains editable across drafts and project files.

The effect stores `filterEffects.type = lens-correction` with bounded amount, radius, centre, direction (`inward` or `outward`) and seed metadata. Amount controls correction strength, radius controls the influence extent, and direction selects whether source sampling contracts toward or expands away from the centre. Legacy records without `lensDirection` resolve to `inward`. This first stage is an offline local approximation and does not load camera/lens profiles or expand the canvas.

Unit tests cover centre identity, deterministic inward/outward remapping, legacy-direction defaults, radius/amount identities, transparent-source exclusion and detached buffers. Desktop/mobile acceptance covers menu activation, editable radius, centre and direction controls, representative pixels, source retention, reload and project round trips.

Profile-based calibration, chromatic-aberration correction, EXIF-aware camera metadata and full Photoshop Lens Correction controls remain planned. This contract does not claim Photoshop equivalence.
