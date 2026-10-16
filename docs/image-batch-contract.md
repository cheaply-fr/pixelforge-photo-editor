# PixelForge multi-input batch export contract

PixelForge can process a selected set of local image files without an account or
network request. Each file is decoded into a temporary canvas, rendered as a
flattened PNG, JPEG, WebP, bounded PSD composite or bounded single-page PDF, and placed in one ZIP archive. The editable draft
and the original `File` objects remain in the browser and are never copied into
the archive.

The batch operation is deliberately bounded for phones and anonymous use:

* At most 64 selected files are accepted.
* Each source file is limited to 64 MiB and each decoded image to 16 megapixels.
* The sum of encoded image bytes is limited to 256 MiB. The operation fails
  before constructing an oversized archive, so it cannot silently resize or
  discard source pixels.
* JPEG receives the selected quality and composites transparency over white.
  PNG preserves alpha; WebP preserves alpha where the browser supports its
  encoder. PSD stores a flattened 8-bit RGB-plus-alpha composite without layers,
  masks, profiles or metadata. PDF stores one flattened JPEG page without
  editable content or metadata. Unsupported encoders produce a per-file failure.

Each source is attempted independently. A decode or encode failure is recorded
with the source's display name and a short reason, while successful files remain
downloadable. If every source fails, no ZIP is returned. Progress reports the
completed count, total count, source name and whether that item succeeded or
failed. An `AbortSignal` cancels before the archive is created and leaves the
draft unchanged.

Output names use the source basename with unsafe characters removed, a stable
one-based index and the selected extension. Duplicate names receive a numeric
suffix. The manifest records dimensions, encoded byte sizes, counts, format,
quality and failures. It explicitly declares that the archive contains only
rendered pixels: source EXIF, GPS, color-profile data, asset URLs and editable
project data are omitted. The manifest timestamp is informational and does not
identify the source files beyond their user-visible names.

This contract is local multi-input processing. The existing “Batch export
history…” command remains a separate history-snapshot workflow, and editable
`.pixelforge` project export remains the recovery format. Recorded Actions now
reuse the same deterministic filter renderer for active nondestructive filters
when applying a flattened batch, including the enabled blur family (box,
Gaussian, lens, iris, smart, surface and shape blur), Gradient Map endpoint
colours/blend/interior stops, and other bounded filter effects. Unsupported
editor-only commands still fail per file rather than
silently changing semantics. HEIC/RAW/PSD decode,
background-removal batches and worker/tiled processing need separate
compatibility, quality and performance gates.

The pure tests cover privacy-safe names, individual failure continuation,
manifest counts and metadata wording, progress, cancellation, no-success
failure, and the 64-file bound. The browser acceptance gate must cover selecting
multiple files on desktop and mobile, mixed success/failure reporting, actual
ZIP signatures and manifest dimensions/bytes, canceling a running batch, and
local-only network behavior before this feature is exposed in the editor menu.
