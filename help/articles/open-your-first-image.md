---
title: Open your first image
summary: Open a photo from your device, drop it on the editor or paste it from the clipboard, and see what happens to the file.
category: getting-started
order: 10
level: beginner
featured: true
keywords: [open, load, import, photo, picture, upload, start]
related: [open-and-place-files, supported-file-formats, drafts-and-saving, export-images]
updated: 2026-11-14
---

When you open [the editor](/editor) for the first time it shows a sample picture so you can try the tools straight away. Open one of your own images to replace it.

![The Open image button in the editor's top bar](img/open-image-button.jpg "Open image is in the top bar, next to Export")

## Open an image

1. Click **Open image** in the top bar, or choose **File > Open image…** (<kbd>Ctrl</kbd>+<kbd>O</kbd>, <kbd>⌘</kbd>+<kbd>O</kbd> on Mac).
2. Pick a file on your device. PNG, JPEG and WebP open in every current browser; see [Supported file formats](supported-file-formats) for the others.
3. The image opens as a new document with one **Background** layer, fitted to the window.

You can also drag a file from your desktop onto the editor. Dropping it while a document is open adds it as a new layer instead; hold <kbd>Shift</kbd> while dropping to open it as a new document. See [Open and place files](open-and-place-files).

## What happens to the file

- The image is decoded in your browser. It is **not uploaded** anywhere.
- It becomes a new draft that autosaves in this browser. The document you had open before stays saved as its own draft (see [Drafts and saving](drafts-and-saving)).
- The image keeps its full resolution, up to **16 megapixels** and 16,000 pixels on a side. Larger images are refused with a message, and your current document is left unchanged.
- Files larger than 64 MB are refused.
- Camera metadata (EXIF, GPS) and embedded colour profiles are not kept. Exports contain only the edited pixels.

> [!TIP]
> On a phone, the browser's file chooser usually lets you pick from your photo library or take a new photo.

## When an image will not open

The status line at the bottom of the editor explains why. The most common reasons are a camera RAW file (develop it to JPEG or PNG first), a HEIC photo in a browser that cannot decode HEIC, or an image over 16 megapixels. See [Troubleshooting](troubleshooting).

## Next steps

- Learn your way around in the [workspace tour](workspace-tour).
- Save a copy of your result with [Export images](export-images).
