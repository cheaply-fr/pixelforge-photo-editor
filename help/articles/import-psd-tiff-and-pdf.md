---
title: Import PSD, TIFF and PDF
summary: What PixelForge can read from Photoshop, TIFF and PDF files, why they open flattened, and what to do when a file is refused.
category: files
order: 70
level: intermediate
keywords: [psd, psb, photoshop file, tiff, tif, pdf, heic, heif, iphone photo, flattened, raw]
related: [supported-file-formats, open-and-place-files, export-images, project-files]
updated: 2026-11-14
---

PixelForge can open some PSD, PSB, TIFF, PDF and HEIC files, but it reads only a **flattened picture** from them. Layers, text, masks and other structure inside the file are not imported. This page explains what works and what to do when a file is refused.

All of these open the same way as any image: **File > Open image…**, drag and drop, or **Add image layer** in the Layers panel. After a successful import, the status line says the file was imported flattened and what was left out.

## PSD and PSB (Photoshop)

PixelForge reads the **composite image** that Photoshop saves inside the file: the picture as it looked when it was saved.

- Supported: 8-bit RGB or greyscale, with or without transparency, uncompressed or RLE-compressed, up to 16 megapixels.
- Not supported: 16- and 32-bit files, CMYK, Lab, indexed colour and ZIP-compressed data.
- Not kept: layers, masks, adjustment layers, smart objects, text, paths, guides, colour profiles and metadata.

If a PSD is refused, open it in the app that made it and save a flattened PNG or JPEG, or save the PSD as 8-bit RGB with maximum compatibility.

A PSD dropped on the editor always opens as a new document.

## TIFF

- Supported: 8-bit RGB, RGBA, greyscale or greyscale with alpha; uncompressed or PackBits; one image per file; up to 16 megapixels. Orientation is applied.
- Not supported: LZW, ZIP or JPEG compression, tiled or planar files, 16-bit and floating-point data, CMYK and palette images, BigTIFF and multi-page files.
- Not kept: metadata, colour profiles, extra pages, layers and paths.

If a TIFF is refused, re-save it as an uncompressed 8-bit RGB TIFF, or as PNG.

## PDF

PixelForge reads PDFs that contain **one page with one JPEG image**, which is what its own PDF export creates. Other PDFs, with text, vector drawings, several images or several pages, are refused. To edit a page from another PDF, render or export it to PNG or JPEG first, for example with your PDF viewer's export or screenshot function.

## HEIC and HEIF

HEIC is the default photo format on iPhones. It opens when your browser can decode it; many browsers cannot. If it is refused, convert the photo to JPEG first, or change your phone camera's format setting to the most compatible option.

## Camera RAW

RAW files (DNG, CR2, CR3, NEF, ARW, RAF, ORF and others) are not supported. Develop them to JPEG, PNG or TIFF in your camera's or computer's photo app first.

## Exporting back

You can export PSD and PDF, but again as a single flattened image. See [Export images](export-images). To keep your PixelForge layers, use a [project file](project-files).
