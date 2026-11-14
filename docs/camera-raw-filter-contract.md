# Camera Raw Filter contract

`Filter → Camera Raw Filter…` is a distinct local, nondestructive correction
for visible unlocked raster and embedded smart-object layers. The dialog
stores bounded Highlights, Shadows, Temperature, Tint and Clarity values in
the editable photo-adjustment metadata. Exposure, Vibrance and Black and
White remain available in the existing photo-finishing controls and compose
with the Camera Raw values in a stable order.

The renderer uses luminance-weighted highlight and shadow recovery and
bounded warm/cool and green/magenta channel offsets. **Clarity** is midtone
local contrast: each pixel's luminance is compared with a large-radius
neighbourhood luminance (three alpha-weighted box passes per axis, radius
2.5 % of the longer side, 2–48 px); the difference is scaled by Clarity and by
a bell that peaks at middle gray and reaches zero at black and white, and
added equally to R, G and B. Flat areas and hue are unchanged, positive values
widen midtone edges and negative values soften them. (Earlier builds scaled
each pixel's colour away from its own gray, a saturation change.) Alpha and RGB bytes of fully transparent pixels are preserved;
source assets are never replaced. The edit is one undoable metadata commit and
survives draft reload and portable project round trips. Locked, hidden,
non-raster and non-smart-object layers are guarded.

This slice intentionally does not load camera profiles, demosaic RAW data,
perform linear-light processing, or claim Adobe Camera Raw parity. Those
capabilities require a separate format, color-management, resource and
privacy contract.

Pure pixel, bounds, immutability and legacy-metadata coverage is in
`tests/photo-adjustments.test.mjs`. Desktop/mobile dialog, alpha, source,
undo and reload/project coverage is in
`tests/browser/photo-adjustments.spec.ts`.
