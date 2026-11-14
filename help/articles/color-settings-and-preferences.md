---
title: Color settings and preferences
summary: Set the document's working colour profile with Edit > Color Settings, and see which editor preferences are kept in your browser and which travel with your documents.
category: workflow
order: 70
level: intermediate
keywords: [color settings, colour settings, working space, srgb, display p3, profile, preferences, settings, reset preferences]
related: [color-modes-and-profiles, customise-menus-and-toolbar, keyboard-shortcuts, tool-presets, privacy-and-your-data]
updated: 2026-11-14
---

## Color Settings

**Edit > Color Settings…** sets the working colour profile recorded with the document.

![The Color Settings dialog with the Working profile set to sRGB IEC 61966-2.1](img/color-settings-dialog.jpg "Edit > Color Settings…")

1. Choose **Edit > Color Settings…**.
2. Choose a **Working profile**: **sRGB IEC 61966-2.1** (the default) or **Display P3**.
3. Click **Apply**.

The working profile is a label stored in the document. Choosing it does **not** change any pixels, and it can be undone. **Edit > Assign Profile…** sets the same label.

To actually convert the colours of the image from one profile to the other, use **Edit > Convert to Profile…**. See [Colour modes and profiles](color-modes-and-profiles).

> [!NOTE]
> Exported images do not include an embedded colour profile. Most browsers and apps then display them as sRGB.

## Where your preferences are kept

PixelForge saves two kinds of settings.

**With the document** (in the draft, and in [project files](project-files)):

- tool options such as brush size, shape fill and stroke, Pen mode and the font for new type;
- foreground and background colours;
- the working colour profile;
- default type styles, custom shape presets and saved path presets.

**In this browser only** (not in documents, not synced):

- toolbar layout and menu visibility (see [Customise the menus and toolbar](customise-menus-and-toolbar));
- your custom keyboard shortcuts (see [Keyboard shortcuts](keyboard-shortcuts));
- [tool presets](tool-presets), type presets and [action recipes](actions);
- favourite and recent fonts.

Browser-only settings are kept per browser and per device. Clearing this site's data in your browser resets them to the defaults, and a private window starts with the defaults. See [Browser storage and limits](browser-storage-and-limits).

> [!TIP]
> To move tool presets to another browser, use **Export** and **Import…** in the Tool presets panel.
