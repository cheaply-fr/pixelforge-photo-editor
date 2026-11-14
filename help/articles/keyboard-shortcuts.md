---
title: Keyboard shortcuts
summary: Every keyboard shortcut in the editor, grouped by tools, files, editing, selections, layers, view and type, plus how to assign your own keys to tools and menu commands.
category: workflow
order: 30
level: beginner
keywords: [shortcuts, hotkeys, keys, keyboard, key bindings, rebind, customise shortcuts, cheat sheet]
related: [command-search, customise-menus-and-toolbar, edit-text-on-canvas, workspace-tour]
updated: 2026-11-14
---

PixelForge uses many of the same keys as other image editors. On a Mac, use <kbd>⌘</kbd> wherever this page says <kbd>Ctrl</kbd>, and <kbd>Option</kbd> for <kbd>Alt</kbd>.

Shortcuts do nothing while you are typing in a text field or a dialog is open, and some browser shortcuts cannot be taken over by a web page.

![The Keyboard Shortcuts dialog filtered by "layer", listing layer shortcuts above the Custom tool bindings](img/keyboard-shortcuts-dialog.jpg "Edit > Keyboard Shortcuts…")

## Tools

Pressing a tool's letter selects the first tool of its family; pressing it again moves to the next tool in the family. Hold <kbd>Shift</kbd> to go backwards.

| Key | Tools (in cycling order) |
|---|---|
| <kbd>R</kbd> | Rotate View. <kbd>Shift</kbd>+<kbd>R</kbd> switches between Rotate View and the last of Smudge, Blur or Sharpen you used |
| <kbd>I</kbd> | Eyedropper, Color Sampler, Ruler, Note, Audio Annotation, Count |
| <kbd>M</kbd> | Rectangular Marquee, Elliptical Marquee, Single Row Marquee, Single Column Marquee |
| <kbd>L</kbd> | Lasso, Polygonal Lasso, Magnetic Lasso, Selection Brush |
| <kbd>W</kbd> | Selection Brush, Quick Selection, Magic Wand |
| <kbd>C</kbd> | Crop, Perspective Crop, Slice, Slice Select |
| <kbd>K</kbd> | Frame, Mask Brush, Mask Eraser, Adjustment Brush |
| <kbd>S</kbd> | Clone, Pattern Stamp |
| <kbd>J</kbd> | Healing, Spot Healing, Patch, Red Eye |
| <kbd>Y</kbd> | History Brush, Art History Brush |
| <kbd>O</kbd> | Dodge, Burn, Sponge |
| <kbd>B</kbd> | Brush, Pencil, Color Replace, Mixer Brush |
| <kbd>G</kbd> | Gradient, Fill |
| <kbd>E</kbd> | Eraser, Background Eraser, Magic Eraser |
| <kbd>P</kbd> | Pen, Freeform Pen, Curvature Pen |
| <kbd>A</kbd> | Path Selection, Direct Selection |
| <kbd>U</kbd> | Rectangle, Rounded Rectangle, Ellipse, Line, Polygon, Custom Shape |

Add Anchor Point, Delete Anchor Point and Convert Point have no key; choose them from the Pen flyout.

> [!NOTE]
> The toolbar shows the letters V, H, Z and T for Move, Hand, Zoom and Horizontal Type, but these keys do not currently select those tools. Click the tool, use **Type > Text Tool** for type, or give them your own keys under **Custom tool bindings** (see below).

## Colours, painting and Quick Mask

| Key | Action |
|---|---|
| <kbd>D</kbd> | Reset the colours to black foreground and white background |
| <kbd>X</kbd> | Swap the foreground and background colours |
| <kbd>[</kbd> / <kbd>]</kbd> | Make the brush smaller / larger, for every painting tool |
| <kbd>Q</kbd> | Turn Quick Mask mode on or off |
| <kbd>Alt</kbd>+<kbd>Backspace</kbd> | Fill the selection (or the whole layer) with the foreground colour |
| <kbd>Ctrl</kbd>+<kbd>Backspace</kbd> | Fill the selection (or the whole layer) with the background colour |
| <kbd>Shift</kbd>+<kbd>F5</kbd> | **Edit > Fill…** |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> | Clear the selected pixels of the active layer (with a selection) |

## Files

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | New white document |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Open image… |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Open the Export dialog |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Download the project file (`.pixelforge`) |

## Editing

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Z</kbd> also undoes) |
| <kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Redo |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> | Copy Layer |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> | Copy Merged |
| <kbd>Ctrl</kbd>+<kbd>X</kbd> | Cut Layer |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Paste Layer, or paste an image from the clipboard when no layer was copied |
| <kbd>Ctrl</kbd>+<kbd>T</kbd> | Free Transform |
| <kbd>Ctrl</kbd>+<kbd>F</kbd> | Search commands (see [Search commands](command-search)) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Auto Tone |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>I</kbd> | Image Size… |

## Selections

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | Deselect |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> or <kbd>Ctrl</kbd>+<kbd>I</kbd> | Inverse |
| <kbd>Esc</kbd> | Cancel a Polygonal or Magnetic Lasso, a Pen path, a Quick Mask stroke or a crop in progress |
| <kbd>Enter</kbd> | Apply a crop, perspective crop or frame preview |

## Layers

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>J</kbd> | Duplicate the layer |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> | Group the layer |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Ungroup |
| <kbd>Ctrl</kbd>+<kbd>]</kbd> / <kbd>Ctrl</kbd>+<kbd>[</kbd> | Bring Forward / Send Backward |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>]</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>[</kbd> | Bring to Front / Send to Back |

## View and workspace

| Shortcut | Action |
|---|---|
| <kbd>0</kbd> or <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit to screen |
| <kbd>1</kbd> or <kbd>Ctrl</kbd>+<kbd>1</kbd> | Actual size (100 %) |
| <kbd>+</kbd> / <kbd>-</kbd> (also with <kbd>Ctrl</kbd>) | Zoom in / out |
| <kbd>F</kbd> | Cycle Standard Screen Mode, Full Screen with Menu and Full Screen |
| <kbd>Esc</kbd> | Leave full screen, or close an open menu or tool flyout |
| <kbd>F6</kbd> or <kbd>Ctrl</kbd>+<kbd>.</kbd> | Move keyboard focus into the active tool's options |
| <kbd>F1</kbd> | Open the Help Center |

## Menus from the keyboard

Menu names in the menu bar are buttons: <kbd>Tab</kbd> to one and press <kbd>Enter</kbd>, <kbd>Space</kbd> or <kbd>↓</kbd> to open it. Inside a menu, <kbd>↑</kbd> and <kbd>↓</kbd> move between the available commands, <kbd>Home</kbd> and <kbd>End</kbd> jump to the first and last, <kbd>Enter</kbd> runs the command and <kbd>Esc</kbd> closes the menu.

## While editing type

See [Edit text on the canvas](edit-text-on-canvas) for the type shortcuts: commit with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>, cancel with <kbd>Esc</kbd>, and character and paragraph formatting keys.

## See and customise shortcuts

**Edit > Keyboard Shortcuts…** lists the shortcuts shown in the menus. Type in **Filter shortcuts…** to narrow the list.

The same dialog lets you add your own keys:

- **Custom tool bindings**: give any tool a key, a letter or a digit, optionally with <kbd>Shift</kbd>, <kbd>Ctrl</kbd>, <kbd>Alt</kbd> or <kbd>Cmd</kbd>. Type it like `shift+q`.
- **Custom menu command bindings**: give any menu command a key, a punctuation key or a function key, with optional modifiers, including commands that have no shortcut of their own.

Click **Apply** to save. **Reset** next to a row removes your key and restores the default; **Reset all** clears every custom key. Duplicate and invalid keys are ignored. Your keys are stored in this browser only.

A custom key takes priority over the built-in one. A command assigned to a key still runs only when it is available for the current document.
