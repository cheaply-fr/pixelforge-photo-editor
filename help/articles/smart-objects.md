---
title: Smart objects
summary: Embed an image or nest layers as a smart object, so you can scale and transform it without losing quality, swap its contents and link copies together.
category: layers
order: 100
level: advanced
keywords: [smart object, embedded, place embedded, nest layers, replace contents, linked smart object, non-destructive transform, mockup]
related: [layer-types, smart-filters, free-transform, artboards, merge-and-flatten, clipping-masks]
updated: 2026-11-14
---

A smart object is a layer that keeps its original image. When you scale, rotate or distort it, PixelForge redraws it from that original, so shrinking it and enlarging it again does not blur it. You can also swap the image inside while keeping the size, position and effects, which is handy for mock-ups and templates.

![A smart object made by nesting two layers; the Layers panel shows its embedded source](img/smart-object-nested.jpg "A nested smart object in the Layers panel")

## Create a smart object

There are two ways:

- **From an image file:** click **Add smart object** in the [Layers panel](layers-panel), or choose **Layer > New Smart Object…**, then choose an image. It is added as a new smart object layer.
- **From existing layers:** select one or more layers that are not in a folder and are unlocked, then click **Nest selected layers** or choose **Layer > Nest Selected Layers as Smart Object**. The layers are replaced by one smart object named "Nested contents" with the number of layers.

The Layers panel shows "Embedded source" and the source name for the selected smart object. Its type in the list is "smart-object".

## What you can do with it

Smart objects take the same settings as other layers: transforms, [opacity and blend mode](blend-modes-and-opacity), [layer masks](layer-masks), [vector masks](vector-masks), [layer styles](layer-styles) and adjustments. They can be clipped to a base layer ([Clipping masks](clipping-masks)).

To apply editable filters, see [Smart filters](smart-filters).

## Replace the contents

1. Select the smart object.
2. Click **Replace contents**, or choose **Layer > Replace Contents…**.
3. Choose a new image.

The layer keeps its name, position, transform, opacity, blend mode, styles, mask and adjustments. Only the image changes. If the smart object was made by nesting layers, the nested layers are replaced by the new image.

With an [artboard](artboards), **Replace smart object and fit** swaps the image and fits it to the active artboard.

## Link copies

Linked smart objects share one image, so replacing the contents of one updates all of them, while each keeps its own size and position.

1. Select two or more smart objects.
2. Choose **Layer > Link Smart Object Contents**.

**Layer > Select Linked Layers** selects every smart object linked to the selected one, and **Layer > Unlink Smart Object Contents** removes the link. These links live inside your document; they do not watch or update from files on your computer.

## Turn it back into pixels

**Layer > Rasterize** (or **Rasterize layer** in the Layers panel) turns the smart object into a normal image layer with its current look. Undo brings the smart object back.

## Limits

- You cannot open a smart object to edit the layers inside it. To change nested content, undo the nesting, or replace the contents.
- Smart objects can be nested up to four levels deep.
- Retouching tools that edit pixels directly, such as painting, need a normal image layer. Rasterize first, or paint on a new layer above.
- Smart objects are embedded copies. Linking to external files is not available.
