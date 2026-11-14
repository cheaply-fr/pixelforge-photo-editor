---
title: Project files
summary: Save your whole editable document, with layers and recent history, as a .pixelforge file, and open it again in any browser.
category: files
order: 60
level: beginner
keywords: [project, pixelforge file, backup, save, layered, move to another computer, archive]
related: [drafts-and-saving, export-images, cloud-projects, supported-file-formats]
updated: 2026-11-14
---

A **project file** (`.pixelforge`) is a complete, editable copy of your document that you keep yourself. Use it as a backup, to move work to another browser or device, or to archive versions.

## What a project file keeps

- All layers, groups, masks, vector shapes, text, adjustments, layer styles and filters, editable as before.
- Document settings and **File > File Info / Privacy…** fields.
- The recent undo history: the same window of up to 24 steps that your draft keeps.

Your draft's link to a cloud project is not stored in the file.

## Save a project file

- **File > Download project file** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) downloads `<document name>.pixelforge` through your browser's normal downloads.
- **File > Save project with file picker…** lets you choose the folder and file name, in browsers that support it. In others it falls back to a normal download and tells you so.

The file is built in your browser and saved straight to your device. Nothing is uploaded.

## Open a project file

1. Choose **File > Open project…**, or drop a `.pixelforge` file on the editor.
2. Pick the file.

The project opens as a **new draft** with its layers and history. The draft you had open stays saved in the browser. See [Drafts and saving](drafts-and-saving).

## Limits

A project file can be up to 1 GB and hold up to 4,096 stored images (the pixels of its layers across the saved history steps). Every image inside must be at most 16 megapixels. Files that are damaged, changed by hand or above these limits are refused, and your current document is left unchanged.

A project saved on a large desktop still opens on a phone, though editing may be limited there until you merge or trim layers. See [Large documents](large-documents).

> [!TIP]
> Download a project file before clearing browser data, switching browsers, or using **Discard draft**. A draft lives only in this browser; a project file is yours to keep.

## Project files and other apps

`.pixelforge` files are for PixelForge only. To share a picture, [export an image](export-images). To hand layered vector artwork to another app, use [SVG export](svg-import-and-export).
