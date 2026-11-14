---
title: Edit text on the canvas
summary: Reopen a type layer, select and retype characters, resize paragraph boxes, convert between point and paragraph text and use the type editing shortcuts.
category: type
order: 20
level: beginner
keywords: [edit text, change text, retype, text box, caret, cursor, wrap, overflow, point text, paragraph text]
related: [add-text, character-and-paragraph, find-replace-and-spellcheck]
updated: 2026-11-14
---

Type layers stay editable. You edit them directly on the canvas, with a text caret, selection highlight and handles, much like in a word processor.

![A paragraph text box on a sunset photo, with wrapped lines and resize handles](img/type-paragraph-box.jpg "Paragraph type wraps inside its box")

## Start editing

- With **Horizontal Type** or **Vertical Type** active, click existing type.
- With the **Move** tool, double-click the type.

The text is selected as an editing session. The Type options bar above the canvas shows ✓ (**Commit type**) and ✕ (**Cancel type editing**).

> [!NOTE]
> The Type Mask tools never open an existing type layer. Clicking type with them starts a new type mask at that point. See [Vertical type and type masks](vertical-type-and-type-masks).

## Select and type

| To | Do this |
|---|---|
| Place the caret | Click in the text. |
| Select characters | Drag across them, or hold <kbd>Shift</kbd> and click to extend the selection. |
| Select a word / paragraph | Double-click / triple-click. |
| Select all the text | <kbd>Ctrl</kbd>+<kbd>A</kbd> |
| Move by line, to line start or end | <kbd>↑</kbd> <kbd>↓</kbd>, <kbd>Home</kbd>, <kbd>End</kbd> (these follow the wrapped lines you see) |
| Copy, cut, paste | <kbd>Ctrl</kbd>+<kbd>C</kbd>, <kbd>Ctrl</kbd>+<kbd>X</kbd>, <kbd>Ctrl</kbd>+<kbd>V</kbd> (plain text) |
| Insert a tab | <kbd>Tab</kbd> |
| Undo / redo typing | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd> |

Typing uses your browser's own text input, so accented characters, input methods for other scripts, the browser's spell-check underline and the phone keyboard all work as usual.

## Styling shortcuts while editing

These apply to the selected characters (or to the paragraph, for alignment). On a Mac use <kbd>⌘</kbd> for <kbd>Ctrl</kbd> and <kbd>Option</kbd> for <kbd>Alt</kbd>.

| Shortcut | Effect |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> | Faux bold / italic / underline |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>></kbd> or <kbd><</kbd> | Font size up or down by 2 px (add <kbd>Alt</kbd> for 10 px) |
| <kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd> | Tracking −20 / +20 (add <kbd>Ctrl</kbd> for ±100) |
| <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> | Leading −0.1 / +0.1 |
| <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> | Baseline shift up / down by 2 px |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> / <kbd>C</kbd> / <kbd>R</kbd> | Align left / centre / right |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>J</kbd> | Justify (last line left) |

## Finish editing

- **Commit**: click ✓, press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (or <kbd>Enter</kbd> on the numeric keypad), click outside the type, choose another tool or open a menu. The whole session becomes one history step.
- **Cancel**: click ✕ or press <kbd>Esc</kbd>. The layer goes back to how it was before you started.

## Resize and move the text box

- Drag a handle of a **paragraph** box to change its size. The text rewraps; the letters keep their size.
- Hold <kbd>Ctrl</kbd> while dragging a handle to scale the type instead.
- The handles of **point** type scale the type.
- Hold <kbd>Ctrl</kbd> and drag inside the box to move it.

When paragraph text does not fit its box, the bottom-right handle shows a red **+**. Make the box bigger, or turn on **Dynamic fit** in the Paragraph settings to scale the text to the box (see [Character and paragraph settings](character-and-paragraph)).

To rotate type or enter exact positions, use the layer transform commands; see [Free transform](free-transform).

## Point text and paragraph text

- **Type > Convert to Paragraph Text** puts point type in a box so it wraps.
- **Type > Convert to Point Text** removes the box; each line then ends only where you pressed <kbd>Enter</kbd>.

The same buttons are at the bottom of the **Paragraph** group in the sidebar.

## Edit the text without the canvas

When a type layer is selected, the [Layers panel](layers-panel) shows an **Editable text** field. Changing it replaces the text and keeps each character's styling where it can.

> [!TIP]
> Editing a long paragraph stays responsive, but a type layer holds at most 10,000 characters.
