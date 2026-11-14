---
title: Open and place files
summary: Open a file as a new document, add images as layers by dropping, pasting or with Add image layer, and place a reference image.
category: files
order: 20
level: beginner
keywords: [open, place, import, drag and drop, paste, clipboard, add image, layer, insert]
related: [open-your-first-image, supported-file-formats, reference-image, smart-objects, project-files]
updated: 2026-11-14
---

There are two ways to bring a file in: **open** it as a new document, or **place** it as a new layer in the document you are working on.

![The File menu](img/file-menu.jpg "The File menu")

## Open a file as a new document

- Click **Open image** in the top bar or choose **File > Open image…** (<kbd>Ctrl</kbd>+<kbd>O</kbd>).
- Or hold <kbd>Shift</kbd> while you drop a file on the editor.

The file opens as a new draft. Your previous document stays saved in this browser. To open a PixelForge project file, use **File > Open project…** instead (see [Project files](project-files)).

## Add an image as a layer

Any of these adds the image as a new layer above the selected layer, in one undo step:

- **Drag and drop** one or more image files onto the canvas. Each image is centred where you drop it. Dropping on the Layers panel puts the new layers at the drop line.
- Click **Add image layer** in the Layers panel and pick a file.
- **Paste** an image you copied in another app or web page with <kbd>Ctrl</kbd>+<kbd>V</kbd>, or choose **Edit > Paste Image from Clipboard**. The browser may ask for permission to read the clipboard.

![The Add image layer button in the Layers panel](img/add-image-layer-button.jpg "Add image layer in the Layers panel")

SVG files placed this way arrive as editable shape and text layers. PSD and PSB files dropped on the editor always open as a new document, and a dropped `.pixelforge` file opens as a project. Files that cannot be placed are skipped with a message.

> [!NOTE]
> If you copied a layer inside PixelForge with **Edit > Copy Layer**, <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes that layer. To paste an image from another app in that case, use **Edit > Paste Image from Clipboard**.

## Place a file as a smart object

**Layer > New Smart Object…** asks for a file and places it as a smart object, which you can transform without losing its original pixels. See [Smart objects](smart-objects).

## Place a reference image

**File > Place reference image…** shows a picture over your work as a guide, for example a sketch to trace or colours to match. It is not a layer and is never included in exports. See [Reference image](reference-image).

## Limits

The same limits apply to every way of bringing an image in: 16 megapixels and 16,000 pixels per side, 64 MB per file, and at most 512 layers per document. See [Supported file formats](supported-file-formats) and [Large documents](large-documents).
