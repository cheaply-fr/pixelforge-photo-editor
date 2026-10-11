# File Info and export privacy contract

PixelForge's **File > File Info / Privacy…** dialog exposes three bounded,
editable document fields: title (160 characters), description (2,000
characters), and author (160 characters). Title and author reject control
characters. Description accepts multiline text and normalizes CRLF/CR to LF
before saving. Unknown metadata keys are rejected, and all values are trimmed
at the persistence boundary.

The fields are versioned in the v2 draft envelope and survive IndexedDB
local-draft reload and portable `.pixelforge` export/import. They are local
document metadata; anonymous editing does not require an account. The editor
strips these fields from private-cloud request envelopes, so they are never
sent to an image encoder, cloud API, or rendered asset URL.

Image export has one truthful privacy boundary: browser PNG, JPEG and WebP
exports are made from a rendered canvas and contain pixels only. Original
EXIF/GPS metadata and source ICC/color profiles are not copied. File Info
title, description and author remain in the local draft and editable project
file; they are not embedded in rendered image bytes. The export dialog repeats
this disclosure beside the download action.

The browser tests open and edit File Info on desktop and mobile, cover
multiline reload, Cancel and Escape, malformed project import preservation,
new-document reset, exported-byte disclosure, and the local/project round
trip. Pure tests cover control-character and length bounds, line-ending
normalization, unknown-key rejection, and cloud-envelope stripping. These
tests do not claim color-managed output, EXIF writing, lossless metadata
retention, or Photoshop compatibility.
