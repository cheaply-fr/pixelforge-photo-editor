---
title: Drafts and saving
summary: How PixelForge autosaves your work as a draft in this browser, what Save draft and Duplicate draft do, and how to keep a copy you control.
category: files
order: 30
level: beginner
featured: true
keywords: [save, autosave, draft, recover, lost work, bookmark, backup, discard, duplicate]
related: [project-files, export-images, cloud-projects, browser-storage-and-limits, troubleshooting]
updated: 2026-11-14
---

You never need to press Save to avoid losing work in PixelForge. Every change is saved automatically as a **draft** in this browser, on this device. Nothing is uploaded.

![The document bar with Save draft highlighted](img/docbar-save-draft.jpg "Save draft, Duplicate draft, Home and Discard draft above the canvas")

## Autosave

- After each change, the status line at the bottom of the editor reads **Saved on this device**.
- Pixels, layers, settings and recent undo history are saved. See [Undo, redo and history basics](undo-redo-and-history-basics) for how much history is kept.
- Reload the page or come back later in the same browser and the draft reopens where you left it.

Each draft has its own address, ending in `#draft=` and an ID. Bookmark it to come back to that draft. Opening [the editor](/editor) without a bookmark reopens your most recent draft, and the home page offers **Continue saved draft**.

## The document bar

| Button | What it does |
|---|---|
| **Save draft** | Saves the draft in this browser now and shows the time, for example "Saved on this device · 14:05" (on a phone, "Saved · 14:05", so the time is not cut off). It does not download or upload anything. |
| **Duplicate draft** | Continues on a new copy of the document. The original draft stays saved unchanged under its own address. |
| **Home** | Goes to the PixelForge home page. Your draft stays saved. |
| **Discard draft** | Deletes this draft from the browser after you confirm, and returns to the home page. This cannot be undone. |

> [!NOTE]
> <kbd>Ctrl</kbd>+<kbd>S</kbd> opens the image export (PNG), and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> downloads a project file. Save draft has no shortcut.

## New documents start new drafts

Opening an image, opening a project or creating a new document starts a **new draft**. The previous draft stays stored in the browser, but PixelForge has no list of older drafts: you can reach one only through its address (a bookmark or your browser history). Use **Duplicate draft**, a [project file](project-files) or an [export](export-images) to keep versions you can find again.

## Keep a copy you control

A draft lives only in this browser's storage. It is removed if you clear your browsing data or site data, and private or incognito windows forget it when they close. A browser can also remove site data when the device runs out of space.

To keep your work safe:

- **File > Download project file** saves a `.pixelforge` file with your layers and recent history. You can open it in any browser. See [Project files](project-files).
- Export a PNG, JPEG or other image of the result. See [Export images](export-images).
- If you sign in, save a private copy to your cloud projects. See [Cloud projects](cloud-projects).

## The same draft in two tabs

If your last draft is already open in another tab, a new editor tab starts a new draft and tells you so. If you open the same draft's bookmark in two tabs and edit in both, the second tab to save shows "This draft changed in another tab". Choose **Duplicate draft** to keep that tab's edits as a copy, or **Reload newer draft** to switch to the other tab's version.

## When saving fails

- **"Browser storage is full. Your last local save is kept; export a copy or free up space."** Your previous save is intact. Download a project file, then free space (see [Browser storage and limits](browser-storage-and-limits)).
- **"Recovery unavailable. Original draft kept; export backups of your work."** The stored draft could not be read safely, so the editor started a new draft and left the original untouched.

See [Troubleshooting](troubleshooting) for more.
