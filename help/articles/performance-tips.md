---
title: Performance tips
summary: Practical ways to keep PixelForge fast with big images and many layers, on desktops and phones.
category: performance
order: 20
level: intermediate
keywords: [slow, lag, speed, fast, freeze, performance, memory, crash, responsive]
related: [large-documents, browser-storage-and-limits, browser-support, troubleshooting]
updated: 2026-11-14
---

PixelForge does all its work on your device, so speed depends on your computer or phone and on the size of your document. These tips help when the editor feels slow.

## Work at the size you need

- The number of pixels matters most. If your result is for the web or social media, reduce a large photo early with **Image > Image Size…**. A 2000-pixel-wide image has about a quarter of the pixels of a 4000-pixel-wide one.
- Crop away parts you will not use before applying heavy filters.
- See [Large documents](large-documents) for the limits.

## Keep the layer stack lean

- Merge layers you have finished with (**Layer > Merge Layers**, **Merge Visible**), or **Flatten Image** when you no longer need layers.
- Delete hidden layers you do not need.
- Use **Layer > Trim Layer to Content** on layers with large transparent areas.
- Prefer adjustment layers, text and shapes over pixel copies where possible: they use no pixel budget.

## Heavy effects

- Blurs with large radii, Lens Blur, Smart Blur, Reduce Noise, Liquify and similar filters do much more work on big layers. Try settings on a smaller copy or a selection first; filters apply only inside the active selection.
- Several live filters stacked on large layers take longer to redraw. Remove the ones you do not need.

## Free memory

- **Edit > Purge Undo History…** releases all undo steps except the current state. Use it only when you are sure you do not need to go back; it cannot be undone.
- Close other browser tabs and apps you are not using, especially on phones.
- If the editor becomes unresponsive, reload the page. Your draft reopens from the last save.

## Browser settings

- Use a current version of your browser. PixelForge is tested on Chromium-based browsers; see [Browser support](browser-support).
- Keep your browser's hardware (graphics) acceleration turned on.
- Make sure the site can store data, so reopened drafts can reuse saved renders instead of rebuilding them.

## On a phone

Phones have smaller budgets for pixels and undo history. Work on smaller canvases, keep fewer pixel layers and download a project file regularly. See [Use PixelForge on a phone](using-pixelforge-on-a-phone).
