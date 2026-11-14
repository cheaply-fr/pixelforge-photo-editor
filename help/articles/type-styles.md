---
title: Type presets and default styles
summary: Save character and paragraph settings as type presets, store a default type style with the document, and change the font and size of every type layer at once.
category: type
order: 70
level: intermediate
keywords: [text style, character style, paragraph style, preset, reuse, consistent, brand fonts, update all text]
related: [character-and-paragraph, tool-presets, font-library-and-glyphs]
updated: 2026-11-14
---

PixelForge has three ways to reuse type settings. Pick the one that matches what you want to keep.

| Feature | Saves | Stored |
|---|---|---|
| Type presets | Character and paragraph settings | In this browser, for every document |
| Default type styles | One style for the document | With the document (draft and project file) |
| Update All Text Layers | Nothing; applies a font and size to every type layer once | Not applicable |

## Type presets

![The Type presets group with a saved preset called "Poster title"](img/type-presets.jpg "A saved type preset")

1. Style some type the way you like, or select a type layer that already has the look.
2. With a type tool active, open the **Type presets** group at the bottom of the sidebar's Text section.
3. Enter a name and click **Save**.

To use a preset, click its name. It applies to the selected characters while you edit, to the whole selected type layer, or to new type when nothing is selected. Click **×** next to a preset to delete it.

Type presets are kept in this browser only (up to 40). They are not part of your documents or project files, and they are not synced to other devices.

## Default type styles

- **Type > Save Default Type Styles** stores the selected type layer's font, size, colour, weight, box width, alignment, line height, tracking and orientation with the document.
- **Type > Load Default Type Styles** applies that stored style to the selected type layer. The text itself does not change, and the change is one undoable step.

Because the default style is saved with the draft and in [project files](project-files), it travels with the document.

## Change every type layer at once

**Type > Update All Text Layers** sets one font and size (1 to 1000 px) on every editable type layer in the document:

1. Choose **Type > Update All Text Layers**.
2. Choose a **Font** (or click **Aa** to browse) and enter a **Size**.
3. Click **Update text**.

All type layers stay editable, other layers are not touched, and one <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes the whole change. Size and font set on individual characters are kept.

> [!TIP]
> The Horizontal Type tool also has general [tool presets](tool-presets), which save the tool's options such as the font and size for new type.
