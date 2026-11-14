---
title: Refine edges with Select and Mask and Quick Mask
summary: Smooth and feather a selection edge with Select > Select and Mask…, and paint a selection as a red overlay in Quick Mask mode.
category: selections
order: 90
level: intermediate
keywords: [refine edge, select and mask, quick mask, mask mode, red overlay, smooth edge, feather]
related: [modify-selections, selection-brush, select-subject-and-objects, layer-masks]
updated: 2026-11-14
---

Two tools help you clean up a selection's edge: **Select and Mask…** applies a smoothing and feather in one step, and **Quick Mask** lets you paint the selection directly, seeing it as a coloured overlay.

## Select and Mask

![The Select and Mask dialog with Edge smoothing and Feather fields](img/select-and-mask-dialog.jpg "Select > Select and Mask…")

1. Make a selection.
2. Choose **Select > Select and Mask…**.
3. Set **Edge smoothing (px)**, a whole number from 0 to 64. It averages the edge to remove jaggies and small notches (default 2).
4. Set **Feather (px)**, from 0 to 1,000; decimals are allowed (default 0).
5. Click **Apply Select and Mask**.

The result replaces the current selection and is one undo step. The feather stays editable afterwards with **Current selection feather** or **Select > Feather…**.

> [!NOTE]
> Select and Mask here is a straightforward smoothing and feathering step. It does not detect hair, fur or clouds, and it does not remove colour fringes.

## Quick Mask mode

Quick Mask shows the selection as a mask: unselected areas are covered in translucent red, selected areas are clear. You then paint to change it.

![Quick Mask mode on a portrait: the area outside the selection is covered in red, and the Quick Mask options are shown in the sidebar](img/quick-mask-overlay.jpg "Quick Mask mode")

1. Optionally make a rough selection first. Without one, Quick Mask starts with the whole image selected (no red), and you paint away what you do not want.
2. Press <kbd>Q</kbd>, click **Quick Mask** at the bottom of the toolbar, or choose **Select > Edit in Quick Mask Mode**. The Brush tool is selected.
3. Paint to hide selected pixels (they turn red). Hold <kbd>Alt</kbd> while painting, or tick **Reveal selection while painting**, to paint selection back in.
4. The brush **Size**, **Hardness** and **Opacity** apply; a soft or partly opaque brush makes a partly selected edge.
5. Leave Quick Mask by pressing <kbd>Q</kbd> or <kbd>Esc</kbd>, clicking **Exit** in the Quick Mask mode section, or choosing **Select > Edit in Quick Mask Mode** again. The painted mask becomes the selection.

While Quick Mask is on, the marching ants are hidden, and most document changes (layer edits, transforms, resizing, opening images) are blocked until you exit. Press <kbd>Esc</kbd> during a stroke to cancel just that stroke.

> [!TIP]
> To keep a refined selection for later, save it with **Select > Save Selection…** or turn it into a layer mask. See [Save and load selections](save-and-load-selections).
