---
title: Colour modes and profiles
summary: Switch a document between RGB Color and Grayscale, and assign or convert between the sRGB and Display P3 colour profiles.
category: adjustments
order: 90
level: intermediate
keywords: [grayscale, greyscale, rgb, colour mode, color mode, profile, icc, srgb, display p3, convert profile, assign profile, colour management]
related: [color-settings-and-preferences, other-adjustments, adjustments-overview, export-images]
updated: 2026-11-14
---

PixelForge documents are RGB images. You can show and export a document in grey with **Image > Mode**, and label or convert its colours between two colour profiles, sRGB and Display P3.

## Switch between RGB and Grayscale

Choose **Image > Mode**. Each time you choose it, the document switches between **RGB Color** and **Grayscale**, and the status bar shows the new mode (for example "Image mode: Grayscale").

![The night city sample in Grayscale mode](img/image-mode-grayscale.jpg "Image > Mode set to Grayscale")

In Grayscale mode the whole composite is shown in greys, based on the brightness of each colour. Transparency is kept.

- The change is nondestructive. Your layers keep their colours, so switching back to RGB Color brings them back.
- The mode is saved with the draft and in project files, and can be undone.
- To make only one layer black and white, use the **Black and White** option in the Adjust panel instead ([Other adjustments](other-adjustments)).

> [!NOTE]
> PixelForge only has RGB Color and Grayscale. CMYK, Lab, Indexed Color and 16- or 32-bit modes are not available.

## Colour profiles

A colour profile tells other software how to interpret a document's RGB numbers. PixelForge supports two: **sRGB IEC 61966-2.1** (the standard for the web and most screens) and **Display P3** (a wider gamut used by many recent phones and laptops).

### Assign a profile

**Edit > Assign Profile…** changes only the profile label of the document. The RGB numbers stay the same, so colours may be interpreted differently.

1. Choose **Edit > Assign Profile…**.
2. Pick a **Target profile**.
3. Click **Assign Profile**.

### Convert to a profile

**Edit > Convert to Profile…** recalculates the pixels so colours keep their appearance in the new profile.

1. Choose **Edit > Convert to Profile…**.
2. Pick a **Target profile**.
3. Click **Convert to Profile**.

![The Convert to Profile dialog](img/convert-to-profile-dialog.jpg "Edit > Convert to Profile…")

The conversion is one undo step and the original pixels can be restored with Undo. It converts image layers and the contents of embedded smart objects. Transparency and masks are not changed.

> [!WARNING]
> Text and shape colours are not converted, so they may shift slightly against converted photos. Exported files do not embed an ICC profile; see [Export images](export-images).

The working profile for the document can also be set in **Edit > Color Settings…** ([Colour settings and preferences](color-settings-and-preferences)).

This is a bounded local conversion between two RGB profiles. It is not full colour management: there is no soft-proofing, printer profile, HDR or rendering-intent choice.
