---
title: Supported file formats
summary: Which file types PixelForge can open and export, what each keeps, and which formats are not supported.
category: files
order: 10
level: beginner
keywords: [formats, file types, png, jpeg, jpg, webp, heic, tiff, psd, pdf, svg, raw, avif, gif]
related: [open-and-place-files, export-images, svg-import-and-export, import-psd-tiff-and-pdf, project-files]
updated: 2026-11-14
---

PixelForge reads and writes files entirely in your browser. This page lists what you can open, what you can save, and what is lost along the way.

## Open

| Format | Support | What you get |
|---|---|---|
| PNG, JPEG, WebP | Yes | One editable pixel layer. |
| GIF, BMP, AVIF and other browser images | When your browser can decode them | One editable pixel layer (animated images open as a single frame, as the browser draws them). |
| SVG | Yes, a safe subset | Editable shape, path, text and group layers; anything else as pixel layers. See [SVG import and export](svg-import-and-export). |
| HEIC / HEIF | When your browser can decode them | One flattened pixel layer. |
| TIFF | 8-bit RGB or greyscale, uncompressed or PackBits | One flattened pixel layer. |
| PSD / PSB | 8-bit RGB or greyscale composite | One flattened pixel layer; Photoshop layers are not kept. |
| PDF | One page holding one JPEG image (as PixelForge exports) | One flattened pixel layer. |
| `.pixelforge` project | Yes | Layers, settings and recent history, exactly as saved. See [Project files](project-files). |
| Camera RAW (DNG, CR2, CR3, NEF, ARW and others) | No | Develop the photo to JPEG or PNG first. |

TIFF, PSD and PDF support is limited; see [Import PSD, TIFF and PDF](import-psd-tiff-and-pdf).

Every image must be at most **16 megapixels** and 16,000 pixels on a side, and the file at most 64 MB. Metadata such as EXIF, GPS and embedded colour profiles is not kept.

## Export

| Format | Keeps transparency | Keeps layers | Notes |
|---|---|---|---|
| PNG | Yes | No | Lossless. |
| JPEG | No (white background) | No | Lossy; choose quality or a target size. |
| WebP | Yes | No | Lossy; choose quality or a target size. |
| PSD | Yes | No | One flattened 8-bit image for exchange with other apps. |
| PDF | No (white background) | No | One page with one flattened JPEG image. |
| SVG | Yes | Shapes, text and groups | Vector layers stay vectors; other layers are embedded as images. |
| `.pixelforge` project | Yes | Yes | The only format that keeps everything editable. |

See [Export images](export-images) and [Project files](project-files).

> [!IMPORTANT]
> Image exports (PNG, JPEG, WebP, PSD, PDF) are flattened copies. To keep editing your layers later, also keep a `.pixelforge` project file or your browser draft.

## Other files

- **Selections** can be downloaded and loaded as `.pixelselection` files from the **Select** menu.
- **Batch exports** download as a ZIP file. See [Batch processing](batch-processing).
