# Update All Text Layers contract

`Type > Update All Text Layers` applies a bounded font and size change to every
editable text layer in the current frame. Raster, vector, mask and adjustment
layers are untouched. The operation commits once to the normal undo history,
keeps each layer editable, and survives portable project export/import through
the existing document model.

Only the locally supported font list and a 1–1000 pixel size are accepted.
There is no font download, network request, rasterization, or silent fallback;
unsupported values fail closed. The dialog is disabled when the document has no
text layers and is covered by desktop/mobile export round-trip tests plus pure
validation tests.
