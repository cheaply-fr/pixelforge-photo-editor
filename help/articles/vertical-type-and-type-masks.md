---
title: Vertical type and type masks
summary: Set text in vertical columns with the Vertical Type tool, and make letter-shaped selections with the Horizontal and Vertical Type Mask tools.
category: type
order: 50
level: intermediate
keywords: [vertical text, columns, east asian, type mask, text selection, letter selection, cut out text, text mask]
tools: [vertical-text, text-mask, vertical-text-mask]
related: [add-text, edit-text-on-canvas, selection-basics, layer-masks]
updated: 2026-11-14
---

The **Type** toolbar slot holds four tools. Press and hold (or right-click) the **Horizontal Type** button to choose another one. The button then shows the tool you chose.

| Tool | Creates |
|---|---|
| Horizontal Type | An editable type layer, read left to right. See [Add text](add-text). |
| Vertical Type | An editable type layer set in vertical columns. |
| Horizontal Type Mask | A selection in the shape of horizontal letters. No layer is kept. |
| Vertical Type Mask | A selection in the shape of vertical letters. No layer is kept. |

## Vertical type

![The word DUSK set vertically, one letter under another, on a sunset photo](img/type-vertical.jpg "Vertical type")

1. Choose **Vertical Type** from the Type flyout.
2. Click the canvas where the column should start, and type. Characters run from top to bottom. Each <kbd>Enter</kbd> starts a new column.
3. Commit with ✓ or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.

Vertical type uses the same Character settings as horizontal type, including per-character fonts and colours. The spacing between characters follows the font size plus the tracking, and the spacing between columns follows the leading.

### Switch an existing layer

Select a type layer and choose **Type > Vertical Type** or **Type > Horizontal Type**. You can also use **Make vertical** in the Paragraph settings, or **Text orientation** in the [Layers panel](layers-panel). The text and its styling are kept, and the change can be undone.

> [!NOTE]
> Characters are stacked upright, one per line. Special vertical forms of punctuation that some fonts provide for East Asian text are not used.

## Type masks

A type mask turns letters into a selection. Use it to fill letters with a photo, cut text out of a layer, or make a [layer mask](layer-masks) shaped like words.

![A selection outline in the shape of the word DUSK over a sunset photo](img/type-mask-selection.jpg "A selection made with the Horizontal Type Mask tool")

1. Choose **Horizontal Type Mask** or **Vertical Type Mask** from the Type flyout.
2. Set the font and size in the Type options bar.
3. Click the canvas and type. You edit a preview, just as with normal type.
4. Commit with ✓ or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. The letters become the selection; no type layer is added.

The Type Mask tools never edit existing type: clicking existing text starts a new mask at that point.

### Make a selection from an existing type layer

To keep the type layer editable and also get a selection from it, select the type layer and choose **Type > Horizontal Type Mask** or **Type > Vertical Type Mask**. The command works on a visible, unlocked type layer with text in it, and is one undoable step. The layer itself does not change.

Once you have the selection, see [Selection basics](selection-basics) for what you can do with it, such as [filling it](fill-a-selection) or [stroking its edge](stroke-a-selection).
