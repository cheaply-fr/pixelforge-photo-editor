# Default type styles contract

`Type → Save Default Type Styles` stores the active editable text layer's
font, size, colour, weight, box width, alignment, line height, tracking and
orientation in the versioned local draft settings. `Type → Load Default Type
Styles` applies that style to the active editable text layer as one undoable
metadata edit. Text content, layer identity, transforms, masks and source
assets are preserved.

The style is validated against Pixel's supported fonts, alignment/orientation
values, colour format and bounded typography metrics. Legacy drafts without a
style remain valid; locked, non-text and missing-style states are guarded.
The setting survives reload and portable project export/import, remains local
to the draft, and does not claim provider-backed Adobe font or full OpenType
semantics.

Pure validation and immutability coverage is in `tests/type-styles.test.mjs`.
Desktop/mobile menu, undo, reload and project round-trip coverage is in
`tests/browser/type-style-presets.spec.ts`.
