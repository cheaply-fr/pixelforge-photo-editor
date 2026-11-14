---
title: Browser support
summary: Which browsers PixelForge is tested on, what your browser needs, and which features depend on the browser.
category: troubleshooting
order: 40
level: beginner
keywords: [browser, chrome, edge, firefox, safari, compatibility, requirements, ios, android]
related: [troubleshooting, using-pixelforge-on-a-phone, offline-use, report-a-problem]
updated: 2026-11-14
---

PixelForge runs in a web browser. It is developed and automatically tested on **Chromium-based browsers** (Google Chrome and Microsoft Edge, for example) on desktop, and in a phone-sized Chrome. Use a current version of your browser.

Other modern browsers such as Firefox and Safari can run the editor, but they are not covered by the automated tests, so you may meet differences. If something does not work in one browser, try a Chromium-based browser and [report the problem](report-a-problem).

## What your browser needs

- JavaScript enabled.
- Site storage (IndexedDB) allowed for photoeditor.cheaply.fr, so drafts can be saved. Blocking site data or using strict privacy modes can stop drafts from saving.
- Enough free memory for the size of your document. See [Large documents](large-documents).

## Features that depend on the browser

| Feature | Depends on |
|---|---|
| **Save with file picker…** and **File > Save project with file picker…** | Browsers with the File System Access API, such as Chrome and Edge on desktop. Elsewhere the file downloads normally. |
| Opening HEIC/HEIF photos | Whether the browser can decode HEIC. Many browsers cannot; convert to JPEG if the photo is refused. |
| Exporting WebP | Whether the browser can encode WebP. If it cannot, the export shows an error instead of producing a wrong file. |
| Opening AVIF, GIF, BMP and other images | The browser's own image decoders. |
| **Edit > Paste Image from Clipboard** | Clipboard permission. Some browsers ask, some do not support it; press <kbd>Ctrl</kbd>+<kbd>V</kbd> instead. |
| Pen pressure | Whether the device and browser report pressure. |
| Memory budgets | Chromium browsers report the device's memory, so PixelForge picks a matching budget. Browsers that do not report it get the desktop budget, unless they are on a phone. |
| Offline use and installing as an app | Service worker support, available in current major browsers. See [Use PixelForge offline](offline-use). |

## Browsers inside other apps

Browsers built into other apps (for example links opened inside a messaging or social app) may ignore downloads, block storage or clear it when closed. Open PixelForge in your regular browser instead.

## Private browsing

Private or incognito windows work, but they delete your drafts when you close them. Download a project file before closing the window.
