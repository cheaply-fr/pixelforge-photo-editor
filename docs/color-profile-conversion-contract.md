# Color profile assignment and conversion contract

`Edit → Assign Profile…` changes only the editable frame's working-profile
label. RGB bytes, layer asset identities and history remain unchanged.

`Edit → Convert to Profile…` performs a bounded local D65 matrix conversion
between the supported sRGB IEC 61966-2.1 and Display P3 profiles. Raster and
embedded smart-object content receives a new asset identity in one undoable
history commit; the previous source asset remains available through undo and
portable project history. Alpha bytes and the RGB bytes of fully transparent
pixels are preserved. Masks are alpha data and are not colour-converted.

The operation does not embed ICC profiles, invoke browser colour-management
APIs, convert authored vector/text colours, or claim HDR, wide-gamut display,
soft-proof or Photoshop parity. Export continues to disclose that source
profiles are omitted. Malformed dimensions, buffers and missing assets fail
closed without changing the draft.

Pure matrix, bounds, alpha and round-trip coverage is in
`tests/color-profile.test.mjs`. Desktop/mobile acceptance covers assignment,
conversion, source retention, representative pixels, transparent RGB, undo,
reload and project persistence in `tests/browser/color-settings.spec.ts`.
