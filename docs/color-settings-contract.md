# Color Settings contract

`Edit > Color Settings…` stores a bounded working-profile label (`sRGB` or
`Display P3`) on the editable frame. Legacy frames normalize to sRGB. The
setting is versioned document metadata: it survives undo and portable project
round trips, while source pixels and layer history remain unchanged when the
label is selected. `Assign Profile…` provides the same metadata-only operation
with the Photoshop menu name, while `Convert to Profile…` performs the
explicit local pixel conversion described in
[`color-profile-conversion-contract.md`](./color-profile-conversion-contract.md).

PixelForge does not silently convert browser canvas pixels or claim ICC/browser
color-management equivalence. Raster export continues to disclose that source
profiles are omitted unless a future explicit conversion/embedding contract is
implemented. The dialog is local-only and covered by pure validation plus
desktop/mobile project round-trip tests.
