# PixelForge image export contract

The image export dialog renders the current editable frame locally, then encodes a flattened copy as PNG, JPEG or WebP. It never uploads the source image. An editable `.pixelforge` project remains the recovery format because a rendered export cannot retain layers, masks, vector properties or undo history.

## Formats and fidelity

* **PNG** is lossless and preserves alpha. The quality control is hidden because it has no meaning for PNG.
* **JPEG** is lossy and always receives a white matte. Transparent pixels therefore become white. The browser's encoded MIME type is checked before download so a fallback PNG cannot be mislabeled as `.jpg`.
* **WebP** is encoded with the selected quality and supports transparency. Quality 100 is still not presented as a lossless guarantee. Unsupported WebP encoders fail visibly and leave the editable draft unchanged.

The dialog previews the actual encoded byte size before download. JPEG and WebP also accept an optional target size from 1 KB through 64 MB. When a target is present, PixelForge performs a bounded search over integer quality values and chooses the highest quality whose browser-produced blob fits. If even quality 1 is too large, the smallest valid blob is returned with an explicit “target not met” status; dimensions are never silently reduced. PNG remains lossless and has no target-size control. The filename uses the document name and the format extension. Exports contain only the rendered pixels; original EXIF/GPS metadata and source color profiles are not copied.

The selected format, lossy quality and optional target size are validated and saved with the local draft, then restored from a bookmark or after reload. Legacy projects without these optional fields default to PNG at quality 92 with no target. The preference is UI state; the document's pixels and editable history do not depend on it. File > File Info / Privacy… stores bounded title, multiline description and author fields in the local draft and editable project only. These fields are stripped from private-cloud request envelopes; see [metadata-privacy-contract.md](./metadata-privacy-contract.md).

## Batch history export

“Batch export history…” renders every retained undo-history frame as a
flattened PNG, JPEG or WebP image and downloads one local ZIP package. The
archive uses the ZIP store method so browser-produced bytes are unchanged and
portable without a third-party compression runtime. A manifest records the
document name, format, quality, snapshot index, dimensions and byte size. It
contains no asset URLs, layer source data or embedded metadata. Filenames are
sanitized and path traversal or duplicate names are rejected. Rendering stops
at a 256 MB encoded-output safety limit; the editable draft remains available
when the limit or an encoder fails.

## Named artboard export

When a versioned frame contains named artboards, the image export dialog starts
with `activeArtboardId` and lets the user choose any visible validated
artboard. The preview, dimensions and downloaded pixels are limited to that
selected rectangle. A solid `background` swatch is painted beneath transparent
composite pixels, while the editable frame and source assets remain unchanged.
Frames without artboards use the virtual full canvas viewport, preserving legacy
dimensions and export behavior. Artboards with explicit `layerIds` render an
isolated cloned layer/group tree before cropping, retaining folder opacity and
blend isolation; omitted membership preserves the legacy full-document view and
an explicit empty list exports the configured background only. Membership is
sanitized after layer deletion, merge and flatten operations. The implementation
is still a viewport/artboard contract: Photoshop content-frame fitting,
replacement and linked frame assets remain staged.

## Acceptance evidence

The desktop/mobile browser tests export all three formats and check PNG, JPEG and WebP signatures, check that WebP quality changes the encoded byte count, check the transparency disclosure, exercise the JPEG/WebP target-size search against actual downloaded bytes, assert the target preference survives reload, and check that rendered exports contain no EXIF/GPS marker. Batch tests create multiple history states, inspect the ZIP entries and manifest, verify dimensions/byte counts and assert that source data URLs are absent. Pure tests cover CRC-32, archive entry order and path-traversal/duplicate-name rejection. A browser that cannot encode WebP receives an explicit unsupported-format message rather than a corrupt download.

## Multi-input batch export

The local multi-input contract is documented separately in
[`image-batch-contract.md`](./image-batch-contract.md). Its implementation is
kept separate from history export so each selected source can fail without
discarding successful outputs. The editor integration remains gated on desktop
and mobile selection, cancellation, mixed-result and no-network acceptance
tests; this module does not claim successful HEIC/RAW/PSD decoding or
background-removal quality for arbitrary batches. Unsupported layered and
camera formats are rejected with explicit per-file compatibility labels before
the browser decoder runs.

The metadata privacy slice is implemented and tested, but this contract does not claim EXIF/ICC writing, color-managed output, HEIC/PSD output or Photoshop compatibility. Browser exports remain rendered-pixel downloads.

## Source-format compatibility disclosure

Raster imports (PNG, JPEG, WebP and other browser-readable `image/*` inputs)
are decoded into an editable raster layer. PixelForge deliberately labels this
as a **flattened raster import**: original EXIF/GPS metadata, camera RAW data,
layer stacks and the source container are not retained in the document.

HEIC/HEIF and TIFF are conditional imports. When the current browser can
decode the container, each is imported as the same flattened raster and the UI
identifies the source format and the metadata loss; when it cannot, the source
draft remains untouched and the user is told to convert to PNG or JPEG. PSD/PSB
and camera RAW extensions (including DNG, CR3, NEF and similar formats) are
explicitly rejected at the import boundary with a develop/flatten-first
message. PixelForge does not claim lossless HEIC, TIFF, PSD or RAW round trips,
and batch import uses the same labels in its per-file failure manifest.
