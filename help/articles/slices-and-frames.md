---
title: Export parts of an image with Slice, Slice Select and Frame
summary: Mark rectangular areas with the Slice tool and download each as a PNG, edit saved slices with Slice Select, and add artboard viewports with the Frame tool.
category: transform-view
order: 90
level: intermediate
keywords: [slice, slices, export region, web slices, slice select, frame, artboard, export part of image]
tools: [slice, slice-select, frame]
related: [artboards, export-images, crop-and-straighten]
updated: 2026-11-14
---

**Slice** and **Slice Select** let you mark areas of the image and download each one as its own PNG file, without cropping the document. **Frame** adds an artboard: a named area of the canvas that can be exported on its own.

All three are in the Crop toolbar family: press and hold the Crop button, or right-click it, to choose them. They are also in the **Image** menu (**Slice tool**, **Slice Select tool**, **Frame tool**). Press <kbd>C</kbd> repeatedly to cycle Crop, Perspective Crop, Slice and Slice Select.

## Make and download a slice

![A slice named hero-banner over part of a city skyline, with the slice bar above the canvas](img/slice-preview.jpg "A slice preview with Download PNG and Save slice")

1. Choose **Slice**.
2. Drag across the area you want. It snaps to whole pixels.
3. In the bar above the canvas, type a **Slice name**. It is used as the file name.
4. Click **Download PNG** (or press <kbd>Enter</kbd>) to download that area now, and/or **Save slice** to keep it in the document.
5. **Cancel** or <kbd>Esc</kbd> discards the slice.

The PNG shows the area as it currently looks, with all visible layers. Making or downloading a slice does not change the image or the undo history.

## Edit saved slices with Slice Select

1. Choose **Slice Select**.
2. Click a saved slice to select it. Where slices overlap, the top one is chosen.
3. Then:
   - Drag inside it to move it; drag an edge or corner to resize it. Each drag is one undo step.
   - Change its name and click **Update slice**.
   - Click **Download PNG** to export it, or **Delete** to remove it.

Saved slices are kept in your draft and in project files. A document can hold up to 256 slices, and slices may overlap.

## Add an artboard with Frame

The **Frame** tool creates artboards, not image placeholders. Press <kbd>K</kbd> repeatedly to reach it from the keyboard.

![A frame being dragged on a landscape, with Artboard name, Background and Add artboard in the bar above the canvas](img/frame-preview.jpg "Frame: name the artboard and choose its background")

1. Choose **Frame**.
2. Drag the area of the artboard.
3. Type an **Artboard name** and pick a **Background** colour for transparent areas.
4. Click **Add artboard** or press <kbd>Enter</kbd>. **Cancel** or <kbd>Esc</kbd> discards it.

The artboard bar then appears at the top of the canvas, where you choose the active artboard, show or hide artboards and fit a layer into one. See [Artboards](artboards) for exporting and managing them.
