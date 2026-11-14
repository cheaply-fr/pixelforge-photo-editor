---
title: Troubleshooting
summary: Fixes for common problems: images that will not open, missing downloads, lost drafts, full storage, budget messages, slow editing and tools that do nothing.
category: troubleshooting
order: 10
level: beginner
keywords: [problem, error, not working, help, fix, broken, issue, bug, cannot]
related: [faq, drafts-and-saving, large-documents, browser-support, report-a-problem]
updated: 2026-11-14
---

Most messages appear in the status line at the bottom of the editor. Find yours below. If your problem is not listed, see [Report a problem](report-a-problem).

## An image will not open

| Message or symptom | What to do |
|---|---|
| "Camera RAW import is not supported yet…" | Develop the RAW photo to JPEG or PNG first. |
| "HEIC/HEIF decoding is unavailable in this browser…" | Convert the photo to JPEG, or try another browser. |
| "Image exceeds 16 megapixels. Current draft unchanged." | Reduce the image to 16 megapixels or less in another app (for example 4000 × 4000). See [Large documents](large-documents). |
| "Image file exceeds 64 MB" | Save a smaller or more compressed copy. |
| A PSD, TIFF or PDF is "not a supported…" file | See [Import PSD, TIFF and PDF](import-psd-tiff-and-pdf). |
| "This SVG is not a supported safe local SVG…" | Remove scripts, external links and embedded fonts. See [SVG import and export](svg-import-and-export). |
| "Exit Quick Mask mode before opening an image" | Press <kbd>Q</kbd> or click the Quick Mask button to leave Quick Mask mode. |

When a file is refused, your current document is never changed.

## A download does not appear

- Check your browser's downloads list and download folder.
- Some browsers built into other apps ignore downloads. In the export dialog, use **Save with file picker…**, or for projects **File > Save project with file picker…**, or open PixelForge in a regular browser.
- Make sure your browser allows this site to download files.

## My work is gone

Drafts are stored only in the browser where you made them. Check that:

- you are using the **same browser and the same browser profile** on the same device;
- you did not use a **private or incognito window** (it forgets drafts when closed);
- browsing data or site data was not cleared;
- you are at the right address. Opening an image, opening a project or creating a document starts a new draft; earlier drafts are reachable only through their own address. Look in your browser history for an `/editor#draft=` address.

If you downloaded a project file, open it with **File > Open project…**. See [Drafts and saving](drafts-and-saving).

## "Your last draft is open in another tab…"

The draft is already open in another tab, so this tab started a new one to avoid two tabs overwriting each other. Switch to the other tab, or keep working here on the new draft.

## "This draft changed in another tab…"

The same draft was edited in two tabs. Choose **Duplicate draft** to keep this tab's edits as a copy, or **Reload newer draft** to load the other tab's version.

## "Browser storage is full…"

Your last saved version is kept, but new changes cannot be saved. Download a project file first (**File > Download project file**), then free space. See [Browser storage and limits](browser-storage-and-limits).

## "Recovery unavailable…"

The stored draft could not be read safely. The editor started a new draft and did not change the old one. If you have a project file or export, reopen that.

## "Layer pixel budget reached…" or image data limits

The document's layers hold more pixels than this device allows. Merge layers, delete unused ones, use **Layer > Trim Layer to Content**, or work on a smaller canvas. See [Large documents](large-documents).

## A tool or command does nothing

- **Locked layer:** messages such as "Unlock this layer before editing". Unlock it in the Layers panel.
- **Background layer:** its position is locked. Use **Layer > Layer from Background** to turn it into a normal layer.
- **Empty selection:** "No pixels are selected" means the selection does not cover any of the canvas. Use **Select > Deselect** (<kbd>Ctrl</kbd>+<kbd>D</kbd>) or make a new selection.
- **Wrong layer:** many tools work on the selected layer only. Check which layer is highlighted in the Layers panel.
- **Quick Mask mode:** some commands ask you to exit Quick Mask mode first.
- **Greyed-out menu command:** it needs something first, such as a selection, a text layer or more than one layer.

## Keyboard shortcuts do not work

- Click the canvas first. Shortcuts are ignored while you type in a text field.
- Some shortcuts, such as <kbd>Ctrl</kbd>+<kbd>N</kbd>, are reserved by some browsers for their own commands. Use the menu instead.
- See [Keyboard shortcuts](keyboard-shortcuts).

## Pasting an image does not work

- "Clipboard access was blocked…": allow clipboard access for this site in your browser, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> on the canvas.
- "The clipboard does not contain an image.": copy the image itself, not a link or file name.
- If you copied a layer in PixelForge, <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes that layer. Use **Edit > Paste Image from Clipboard** for images from other apps.

## The editor is slow

See [Performance tips](performance-tips) and [Large documents](large-documents).

## The top bar says "Offline · local editing" or "Server degraded"

**Offline · local editing** means PixelForge cannot reach its server; **Server degraded** means the server is reachable but reporting a problem. In both cases you can keep editing and your drafts keep saving on this device; sign-in and cloud projects may be unavailable until the server is back. See [Use PixelForge offline](offline-use).

## A "New version available" notice appears

A new version has been published. Choose **Reload** to switch to it (your draft is saved first), or **Later** to keep working.
