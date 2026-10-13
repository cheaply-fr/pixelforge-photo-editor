# Gradient Map effect contract

`Filter → Stylize → Gradient Map…` stores two validated six-digit endpoint colours, up to six strictly ordered interior stops, and an editable amount on the selected layer's nondestructive `filterEffects` metadata. Each visible pixel's Rec. 709 luminance is interpolated through the authored stop ramp; the amount blends that mapped result with the immutable source. Alpha and the hidden RGB bytes of transparent pixels remain
unchanged.

The effect is deterministic, source-safe, undoable and portable through local
draft and project round trips. Invalid colours normalize to black/white at
the persistence boundary and malformed explicit metadata fails validation.
The local contract does not claim Photoshop's gradient libraries, alternate color-stop interpolation spaces, blend modes or LUT/color-management parity. Interior stops are bounded to six local sRGB colours and positions from 1% through 99%.
Pure behavior is covered in `tests/filter-effects.test.mjs`; the desktop and
mobile UI, pixel, source-retention and reload/project checks are in
`tests/browser/filter-effects.spec.ts`.
