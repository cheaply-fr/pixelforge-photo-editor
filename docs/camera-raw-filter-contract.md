# Camera Raw Filter contract

`Filter → Camera Raw Filter…` is a distinct local, nondestructive correction
for visible unlocked raster and embedded smart-object layers. The dialog
stores bounded Highlights, Shadows, Temperature, Tint and Clarity values in
the editable photo-adjustment metadata. Exposure, Vibrance and Black and
White remain available in the existing photo-finishing controls and compose
with the Camera Raw values in a stable order.

The renderer uses luminance-weighted highlight and shadow recovery, bounded
warm/cool and green/magenta channel offsets, and a middle-gray local-contrast
approximation. Alpha and RGB bytes of fully transparent pixels are preserved;
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
