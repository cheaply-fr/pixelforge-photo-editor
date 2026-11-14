---
title: Browser storage and limits
summary: Where PixelForge stores drafts and settings in your browser, how much space they use, what removes them and how to free space.
category: performance
order: 30
level: intermediate
keywords: [storage, quota, disk space, indexeddb, clear data, cache, storage full, space]
related: [drafts-and-saving, large-documents, privacy-and-your-data, project-files]
updated: 2026-11-14
---

PixelForge saves your work in your browser's own storage for this site. This page explains what is stored, how big it can get and how to manage it.

## What is stored

| What | Where | Removed when |
|---|---|---|
| Drafts: layers, settings and recent undo history | Browser database (IndexedDB) | You discard the draft, or clear site data |
| Rendered layer cache, used to reopen large drafts quickly | A separate browser database | Automatically, oldest first, when it reaches its size limit, or when you clear site data |
| Preferences: toolbar, shortcuts, presets, action recipes, last draft | Browser local storage | You clear site data |
| Editor files and fonts for offline use | Browser cache | The browser or a new version replaces them |

Nothing in this list is uploaded. See [Privacy and your data](privacy-and-your-data).

## How much space drafts use

A draft stores the pixels of its layers for the saved history steps, as compressed PNG images. Images shared between steps are stored once, and each save writes only what changed. A draft can reference up to 4,096 images and 1 GB of image data.

How much space your browser allows depends on the browser and on the free space on your device. Browsers usually allow a site a large share of free disk space, but phones and nearly full devices offer much less.

Each new document or opened image is a separate draft that stays stored until you discard it or clear site data, even if you no longer have its address.

## "Browser storage is full"

When the browser refuses to save, the editor shows "Browser storage is full. Your last local save is kept; export a copy or free up space." Your last saved version is safe, but new changes are not saved until there is space.

1. Download a project file now (**File > Download project file**).
2. Free space on your device.
3. Discard drafts you no longer need: open each one and click **Discard draft**.
4. If you are sure every draft you want is backed up as a project file, clear this site's data in your browser settings.

## What can remove your drafts

- Clearing browsing data, cookies and site data, or "clear on exit" settings.
- Closing a private or incognito window.
- The browser freeing space when the device is low on storage.
- Uninstalling the browser, or resetting the device.

> [!TIP]
> Treat drafts as a convenience, not as your only copy. Keep project files of work that matters, and see [Drafts and saving](drafts-and-saving).
