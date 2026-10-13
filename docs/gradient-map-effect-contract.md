# Gradient Map effect contract

`Filter → Stylize → Gradient Map…` stores two validated six-digit colours and
an editable amount on the selected layer's nondestructive `filterEffects`
metadata. Each visible pixel's Rec. 709 luminance is interpolated between the
shadow and highlight colours; the amount blends that mapped result with the
immutable source. Alpha and the hidden RGB bytes of transparent pixels remain
unchanged.

The effect is deterministic, source-safe, undoable and portable through local
draft and project round trips. Invalid colours normalize to black/white at
the persistence boundary and malformed explicit metadata fails validation.
The local contract does not claim Photoshop's multi-stop gradient libraries,
color-stop interpolation spaces, blend modes or LUT/color-management parity.
Pure behavior is covered in `tests/filter-effects.test.mjs`; the desktop and
mobile UI, pixel, source-retention and reload/project checks are in
`tests/browser/filter-effects.spec.ts`.
