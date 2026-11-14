---
title: Undo, redo and history basics
summary: Step backwards and forwards through your edits, jump to an earlier state in the History panel and understand how much history is kept.
category: getting-started
order: 30
level: beginner
keywords: [undo, redo, revert, mistake, back, history, steps, ctrl z]
related: [history-panel, drafts-and-saving, large-documents]
updated: 2026-11-14
---

Every edit you make is recorded as a step. You can undo it, redo it, or jump straight to an earlier step.

![The Edit menu open with Undo and Redo highlighted](img/edit-menu-undo.jpg "Undo and Redo are at the top of the Edit menu")

## Undo and redo

| Action | Menu | Keys |
|---|---|---|
| Undo the last step | **Edit > Undo** | <kbd>Ctrl</kbd>+<kbd>Z</kbd> |
| Redo a step you undid | **Edit > Redo** | <kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |
| Switch between the current and the previous step | **Edit > Toggle Last State** | |

On a Mac use <kbd>⌘</kbd> instead of <kbd>Ctrl</kbd>. The undo and redo arrows in the top bar do the same.

If you undo some steps and then make a new edit, the steps you undid are discarded and the new edit continues from there.

## Jump to an earlier state

1. In the properties sidebar, open **More panels > History**.
2. Each entry shows its number, the active layer, the document size and the number of layers. The current state is highlighted.
3. Click an entry to return the document to that state. This is itself reversible: use Redo or click a later entry.

![The History panel listing four states](img/basics-history-panel.jpg "The History panel")

See [History panel](history-panel) for more.

## How much history is kept

- **While you work:** up to 240 steps, limited by the memory the images in those steps use: 320 MB on desktops, 128 MB on phones and devices with 4 GB of memory or less, 96 MB on devices with 2 GB or less. When the limit is reached, the oldest steps are released first.
- **After a reload:** your draft saves a window of up to 24 recent steps (and up to 64 MB of their images) in this browser. Older steps stay in memory only and are not restored after a reload; when that happens, the History panel says which steps are saved on this device.
- **In a project file:** a downloaded `.pixelforge` file keeps the same recent window. See [Project files](project-files).

To free memory, **Edit > Purge Undo History…** clears every earlier and later step and keeps only the current state. It asks for confirmation first and cannot be undone. It does not change your layers or delete the draft.

> [!TIP]
> Before trying a risky change, use **Duplicate draft** in the bar above the canvas. You keep the original untouched and continue on a copy. See [Drafts and saving](drafts-and-saving).
