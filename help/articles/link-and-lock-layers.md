---
title: Link and lock layers
summary: Lock layers to protect them from accidental changes, and link layers so a position change on one applies to the others.
category: layers
order: 110
level: intermediate
keywords: [lock, unlock, protect layer, padlock, link layers, linked layers, unlink, select linked]
related: [layers-panel, find-and-select-layers, layer-groups, smart-objects, add-duplicate-and-arrange-layers]
updated: 2026-11-14
---

Locking protects a finished layer while you work on the rest of the document. Linking ties layers together so they keep their relative position.

![A locked paint layer: Lock layer is ticked and the row says "locked"](img/lock-layer-toggle.jpg "A locked layer")

## Lock a layer

Select the layer and tick **Lock layer** in the [Layers panel](layers-panel). You can also choose **Lock** in the row menu. The row shows "· locked" under the layer name.

To lock or unlock several layers at once, select them and choose **Layer > Lock Layers…**. If any selected layer is unlocked, all of them are locked; if all of them are already locked, they are unlocked.

While a layer is locked, you cannot paint on it, move or transform it, change its name, opacity, blend mode, masks or styles, delete it, duplicate it or reorder it. You can still show or hide it with **Visible**.

To lock a whole folder, tick the lock checkbox on its folder row. Every layer in a locked folder is protected, and its own lock settings cannot be changed until you unlock the folder. See [Layer groups](layer-groups).

> [!TIP]
> If a command does nothing and the status bar says "Unlock this layer before editing", check the **Lock layer** box and the folder lock.

### The Background layer

A **Background** layer in a new white or coloured document has a locked position: it cannot be moved, and the Eraser paints the background colour on it. This is not the same as **Lock layer**. To make it a normal layer, choose **Layer > Layer from Background** or rename it. See [Layer types](layer-types).

## Link layers

1. Select two or more unlocked layers (see [Find and select layers](find-and-select-layers)).
2. Choose **Layer > Link Layers**. The status bar says "Linked … layers for synchronized transforms".

When you change the position of one linked layer with **Layer X** and **Layer Y** in the **Layer details** panel (under **More panels**), the other linked layers move by the same amount. Each layer keeps its own pixels, opacity, blend mode, masks and settings.

- **Layer > Select Linked Layers** selects every layer linked to the selected one.
- **Layer > Unlink Layers** removes the link from the selected layers. It does not change any pixels.

The Layers panel does not show a link symbol on linked rows. Use **Select Linked Layers** to see which layers are linked.

> [!NOTE]
> Dragging with the Move tool currently moves only the active layer, even when it is linked. To move linked layers together, use the **Layer X** and **Layer Y** fields.

Smart objects have a separate kind of link that shares their contents. See [Smart objects](smart-objects).
