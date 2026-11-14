---
title: Action recipes
summary: Record a sequence of menu commands as an action recipe, replay it on any document with one click, or apply it to a batch of images.
category: workflow
order: 20
level: intermediate
keywords: [actions, macro, record, automate, repeat, replay, recipe, batch, automation]
related: [batch-processing, command-search, keyboard-shortcuts, filters-overview]
updated: 2026-11-14
---

An action recipe is a saved list of editor commands, such as a filter, an auto adjustment and a flip. Record it once, then replay it whenever you need the same treatment again.

![The Action recipes dialog with a recipe called "Warm web finish" of 2 steps, and Run, Batch… and Delete buttons](img/actions-dialog.jpg "A recorded action recipe")

## Record a recipe

1. Choose **Edit > Action recipes…**.
2. Enter a **Recipe name** and click **Start recording**.
3. Click **Close**. Recording continues while the dialog is closed.
4. Use the menu commands you want to record, for example **Filter > Warm** and then **Filter > Sharpen**.
5. Open **Edit > Action recipes…** again. The dialog shows "Recording … (N steps)". Click **Stop recording**.

The recipe is listed with its number of steps.

## What can be recorded

Recipes record commands that give the same result every time:

- filters from the **Filter** menu, together with their settings such as amount, radius, angle and centre;
- **Auto Tone**, **Auto Contrast** and **Auto Color**, and **Reset adjustments**;
- rotating and flipping the image;
- selection commands such as **All**, **Deselect** and **Inverse**, and layer selection commands;
- layer mask commands (invert, disable, remove), **Lock Layers**, **Merge Layers**, **Merge Visible** and **Flatten Image**.

Painting strokes, tool gestures, commands that open a file or export, and most dialogs are not recorded. A recipe holds up to 64 steps.

## Replay a recipe

1. Open the document and select the layer you want to change.
2. Choose **Edit > Action recipes…**.
3. Click **Run** next to the recipe.

The steps run in order through the normal commands, so each one appears in the [History panel](history-panel) and can be undone. If a step cannot run (for example, the layer is locked or nothing is selected), the replay stops at that step and the status bar says which one failed.

## Apply a recipe to many images

Click **Batch…** next to a recipe and choose image files from your device. The recipe is applied to each file in turn (up to 64 files), and the flattened results are collected in a ZIP to download. A file that fails is reported without stopping the others. See [Batch processing](batch-processing).

## Delete a recipe

Click **Delete** next to the recipe. It is removed immediately.

## Where recipes are stored

Recipes are saved in this browser, separately from your documents. They contain only command names and settings: no pixels, images, metadata or account details. They are not included in project files and are not synced to other devices.

> [!NOTE]
> Action recipes are PixelForge's own format. They cannot read or write Photoshop action files.
