---
title: Privacy and your data
summary: What stays on your device, what is stored in your browser, what is sent over the network, and how to remove your data.
category: troubleshooting
order: 30
level: beginner
keywords: [privacy, data, upload, gdpr, metadata, exif, gps, analytics, cookies, tracking, consent, cookie banner, usage statistics, google analytics, delete data]
related: [drafts-and-saving, cloud-projects, browser-storage-and-limits, faq]
updated: 2026-11-14
---

PixelForge is built to work locally. Your images are opened, edited and exported inside your browser, and nothing you edit is uploaded unless you sign in and choose to save a cloud project.

## What stays on your device

- **Images and documents.** Files you open are read by your browser, not sent to a server.
- **Drafts.** Your work autosaves in this browser's storage (IndexedDB), together with a cache of rendered layers that speeds up reopening.
- **Preferences.** Toolbar layout, shortcuts, presets, saved action recipes and similar settings are stored in this browser.
- **Exports and project files.** They are created in the browser and saved straight to your device.
- **Tools with "AI" or "Generative" in their name.** They run locally with built-in methods; your image and any prompt you type are not sent anywhere.

## What is sent over the network

- **Loading the app.** Your browser downloads the editor, fonts and other files from photoeditor.cheaply.fr, like any website.
- **Status checks.** The editor regularly asks the PixelForge server which version is current, to show the status in the top bar and offer updates. These requests contain no document data.
- **Account check.** The editor asks the Cheaply account service whether you are signed in.
- **Cloud projects, only when you choose them.** **Save to my projects** and **Update cloud project** upload the editable document to your private Cheaply library. The **File > File Info / Privacy…** fields and audio annotations are not uploaded. See [Cloud projects](cloud-projects).
- **Usage statistics, only if you allow them.** See below.

## Usage statistics

The first time you visit, a **Help improve Cheaply Photo Editor** notice asks whether to allow anonymous usage statistics. It has two buttons, **No thanks** and **Allow**, which you can also reach with <kbd>Tab</kbd> and press with <kbd>Enter</kbd> or <kbd>Space</kbd>.

![The usage statistics notice in the bottom-left corner of the editor, with No thanks and Allow buttons](img/analytics-consent-banner.jpg "The usage statistics notice")

- The notice does not block the editor. On a computer it sits in the bottom-left corner, above the status line; on a phone it is a compact bar along the bottom of the screen, below the zoom control. Menus and tool flyouts open over it, so you can work before you answer.
- Until you choose, and if you choose **No thanks**, no analytics script is loaded and nothing is sent.
- If you choose **Allow**, Google Analytics is loaded and records a page view of the app. Your photos, projects, file names, account details and draft content are never included.

Your choice is remembered in this browser. To be asked again, clear this site's data, which also deletes your drafts, so download project files first.

## Metadata in your files

- When you open a photo, its EXIF data (camera details, date, GPS location) and embedded colour profile are not kept.
- Exported images contain only pixels: no EXIF, no GPS, no original profile.
- **File > File Info / Privacy…** lets you store a title, description and author with the document. They stay in your draft and project file and are not written into exported images.

![The File Info and Privacy dialog](img/file-info-dialog.jpg "File > File Info / Privacy…")

## Remove your data

- **One draft:** click **Discard draft** in the bar above the canvas and confirm.
- **Everything in this browser:** clear this site's data in your browser settings (for photoeditor.cheaply.fr). This deletes all drafts, cached renders and preferences and cannot be undone.
- **Cloud projects:** open **My projects** and click **Remove** on each project.

See [Browser storage and limits](browser-storage-and-limits).
