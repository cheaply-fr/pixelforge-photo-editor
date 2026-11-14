---
title: History panel
summary: Use the History panel to jump back to any earlier state of your document, understand what is kept after a reload, and free memory with Purge Undo History.
category: workflow
order: 10
level: beginner
keywords: [history, undo, redo, revert, snapshot, states, steps, purge, memory, toggle last state]
related: [undo-redo-and-history-basics, history-brushes, drafts-and-saving, large-documents]
updated: 2026-11-14
---

The History panel lists the states of your document, from the moment you opened it to your latest edit. Click any state to go back to it.

![The History panel listing four states: Background, Rectangle 1 and two Ellipse 2 states, each with the canvas size and layer count](img/history-panel.jpg "The History panel after drawing two shapes and applying a filter")

## Open the panel

In the properties sidebar, click **History** under **More panels**. On a phone, open the properties sheet at the bottom of the screen first.

The counter at the top shows the current position, for example **4 / 4**.

## Read the list

Each state shows:

- its number and the name of the layer that was active at that moment;
- the canvas size and the number of layers.

The first entry is the document as you opened it. The current state is highlighted and cannot be clicked.

## Go back to a state

1. Click an entry. The document returns to that state.
2. Carry on editing from there, or click a later entry (or use **Edit > Redo**) to go forward again.

Going back is itself undoable. If you make a new edit after going back, the later states you skipped are discarded and the new edit continues from there, just as with Undo.

The same steps are available with **Edit > Undo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd>), **Edit > Redo** (<kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>) and **Edit > Toggle Last State** (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Z</kbd>). See [Undo, redo and history basics](undo-redo-and-history-basics).

## How much history is kept

- **In memory**: up to 240 states, limited by how much image data they hold: 320 MB on a desktop, 128 MB on phones and devices with 4 GB of memory or less, 96 MB with 2 GB or less. The oldest states are released first. The note under the list shows the limits for your device.
- **After a reload**: your draft keeps a window of up to 24 states around the current one. When some states are kept in memory only, the panel says which steps are saved on this device; the others are not restored after a reload.

## Purge Undo History

**Edit > Purge Undo History…** clears every undo and redo state except the current one and frees the memory they used. Your layers, your current image and your draft are kept.

1. Choose **Edit > Purge Undo History…**.
2. Read the confirmation and click **Purge history**.

> [!WARNING]
> Purging cannot be undone: the discarded states are gone. The command is unavailable when there is nothing to purge or while Quick Mask mode is on.

> [!TIP]
> The **History Brush** paints pixels back from an earlier state. See [History brushes](history-brushes).
