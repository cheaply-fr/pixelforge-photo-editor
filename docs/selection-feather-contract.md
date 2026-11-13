# Selection Feather contract

`Select > Modify > Feather…` edits the persisted selection's `feather` value
from 0 through 1,000 px. Decimal radii are accepted with 0.1 px precision
(for example `1.2`; a decimal comma such as `1,2` is also accepted) and stored
as a plain number, so no migration is needed. Rendering applies a Gaussian
alpha blur whose standard deviation is the radius when the selection is used
for a mask, fill, cleanup or export; source image pixels remain unchanged.
Below 16 px the blur is a pure three-pass extended box filter (`featherAlpha`
in `src/selectionFeather.ts`), so fractional radii are honoured exactly instead
of being quantised by the browser's canvas `blur()` (Chromium renders 1.0–1.3
px identically); its cost does not grow with the radius. From 16 px up the
canvas `blur()` filter is kept, where its quantisation is small relative to the
radius and existing documents keep their previous output.
The value survives undo, local draft reload and `.pixelforge` round trips.

The command is disabled without an active selection, rejects malformed or
out-of-range input, and makes one history entry only when the value changes.
The existing panel control (0–100 px slider in 0.1 px steps) and the menu
dialog share the same validated setter; Select and Mask's feather field uses
the same decimal parser.
This is a bounded local blur contract, not Photoshop-equivalent Select and Mask
edge reconstruction.

## Options-bar Feather and marquee Style

Selection options for the marquee and lasso tools also show **Feather (new
selections)** (0–1000 px, the same bound as Select > Modify > Feather).
Like an options-bar feather it applies to every
*next* selection those tools create (not to the current one) and is persisted
in Settings as `marquee.feather`; it does not apply to the one-pixel Single
Row/Column marquees. The panel slider labelled "Current selection feather"
and `Select > Modify > Feather…` keep editing the current selection.

Rectangular and Elliptical Marquee have a **Style**: Normal, Fixed Ratio
(W:H terms; the box follows the drag's larger extent) or Fixed Size (W × H
document pixels placed from the press point; a plain click is enough).
`marquee.style`, `marquee.width` and `marquee.height` persist in Settings.
Older drafts omit `marquee` and load as feather 0, Normal, 1 × 1; malformed
fields fall back individually (`normalizeMarqueeOptions` in
`src/marqueeOptions.ts`).
