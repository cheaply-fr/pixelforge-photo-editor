---
title: Tool presets
summary: Save a tool's options as a named preset, switch between presets in one click, reset tools to their defaults, and export or import presets.
category: workflow
order: 60
level: intermediate
keywords: [tool preset, save settings, favourite settings, reset tool, default settings, export presets, import presets]
related: [brush-presets, type-styles, customise-menus-and-toolbar, shape-tools]
updated: 2026-11-14
---

A tool preset stores the options of one tool under a name, such as "Soft sketch" for a large soft brush or "Hard ink" for a small hard one. Pick the preset later to set all those options at once.

![The Tool presets panel for the Brush with two saved presets, the preset action buttons, the save form and Reset Tool and Reset All Tools](img/tool-presets-panel.jpg "Tool presets for the Brush tool")

## Which tools have presets

Tools with options show a **Tool presets** button at the top of their options in the sidebar: painting and retouching tools, the eraser tools, Gradient, the Horizontal Type tool, the Rectangle, Ellipse, Line and Polygon tools, and the marquee, lasso and selection tools. The button shows the tool name and the preset in use, with **Modified** when you have changed the options since applying it.

Tools without stored options, such as Move, Hand, Zoom, Crop and the Pen tools, have no presets.

## Save a preset

1. Set up the tool the way you want.
2. Click **Tool presets** to open the panel.
3. Under **Save current … options as**, enter a name.
4. Choose what to include:
   - **Include colour**: also store the foreground and background colours (off by default, only for tools that use them).
   - **Include size**: also store the brush size, or the font size for type (on by default).
5. Click **Save preset**.

Values you don't include are neither saved nor changed when you apply the preset.

## Apply a preset

Open the panel and click a preset. The list shows the presets for the current tool; tick **All tools** to see every preset, and use **Search presets** to filter by name or tool. Choosing another tool's preset switches to that tool first.

> [!NOTE]
> Some options, such as size, hardness and opacity, are shared between related tools. Applying a preset for one tool also changes those values for its relatives.

Applying a preset changes tool settings only, never your document, so it adds nothing to the history.

## Manage presets

Select a preset in the list, then use the buttons below it:

| Button | Action |
|---|---|
| Update preset from current options | Save the tool's current options into the selected preset (same tool only). |
| Rename preset | Rename it in place. |
| Duplicate preset | Make a copy named "… copy". |
| Move preset up / down | Change the order. You can also drag presets on a desktop, or press <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd>. |
| Delete preset | Delete it, after a confirmation. |

## Reset tools

- **Reset Tool** puts the current tool's options back to their defaults.
- **Reset All Tools** does the same for every tool.

Both ask for confirmation first. They keep your saved presets and do not change your colours.

## Export and import

- **Export** downloads your presets as `pixelforge-tool-presets.json`, settings only.
- **Import…** reads such a file (up to 512 KB). Invalid presets are skipped and counted; nothing already on this device is overwritten.

Presets are stored in this browser (up to 100). They are not part of documents or project files. Use Export and Import to move them to another browser or device.

> [!TIP]
> Brushes also have their own preset library with tip shapes and dynamics; see [Brush presets](brush-presets). Type has character and paragraph presets; see [Type presets and default styles](type-styles).
