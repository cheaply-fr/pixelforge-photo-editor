# PDF import contract

PixelForge accepts a bounded interoperability subset of PDF: one page with
one 8-bit DeviceRGB JPEG image XObject, up to 16 megapixels and 64 MB of
source bytes. The JPEG is decoded locally into one editable raster layer. The
page remains anonymous and no PDF bytes, metadata or remote document viewer is
used.

Import rejects multi-image or multi-page structure, vectors, text, fonts,
profiles, unsupported filters, malformed streams and unsafe dimensions. The
result is explicitly flattened; page structure, editability, PDF metadata,
profiles and source-container round trips are not retained. The editable
`.pixelforge` project remains the recovery format. PDF export emits exactly
this one-page JPEG composite shape, so an export/import round trip is covered
without claiming general PDF interoperability.

Pure parser tests cover dimensions, JPEG extraction, malformed/truncated
streams, duplicate images and safety bounds. Browser acceptance covers a real
PDF export followed by file re-import and verifies the resulting canvas size,
flattening disclosure and unchanged failure behavior.
