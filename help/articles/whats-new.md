---
title: What's new
summary: Recent changes to the PixelForge editor, newest first.
category: getting-started
order: 90
level: beginner
keywords: [release notes, changelog, updates, new features, version]
related: [welcome-to-pixelforge, report-a-problem]
updated: 2026-11-14
---

PixelForge updates automatically. When a new version is published while the editor is open, a **New version available** notice appears in the top bar: choose **Reload** to switch (your draft is saved first) or **Later** to keep working. The version you are running is shown in the top bar.

## November 14, 2026

- Menus on phones open in full below their name and scroll, instead of showing only their first command. See [Use PixelForge on a phone](using-pixelforge-on-a-phone).
- The usage statistics notice has clear **No thanks** and **Allow** buttons you can reach with the keyboard. Menus and flyouts open over it, and on phones it is a compact bar along the bottom. See [Privacy and your data](privacy-and-your-data).
- The **Move** tool moves all selected layers and linked layers together, in one undo step. See [Move and align layers](move-and-align).
- **Puppet Warp** pins bend only the area around them: a single pin no longer shifts the whole layer. See [Perspective and Puppet Warp](perspective-and-puppet-warp).
- **Content-Aware Fill**, **Content-Aware Move** and **Content-Aware Scale** search as far as the selection needs instead of following the brush Size, always apply at full strength, and Content-Aware Fill tells you when it could fill nothing or only part of the selection. See [Content-Aware Fill and Move](content-aware-fill-and-move).
- **Edit > Stroke Selection…** is about twice as fast on large selections, and explains why **Select > All** with an **Outside** stroke draws nothing.
- SVG text: multi-line text written as evenly spaced `tspan` rows opens as one text layer, and letter-spaced text exports with `letter-spacing` so it reopens as a text layer. See [SVG import and export](svg-import-and-export).
- The **Background Eraser** follows its **Hardness** setting. **Add image layer** places the image in the centre of the document. Project files saved as plain data by early versions open again.
- Phones: the **Opening draft…** progress is visible, the save time is no longer cut off, the document bar buttons are easier to tap and the toolbar's family triangle sits in the top-right corner, clear of the tool names.
- Reloading or closing the editor a few seconds after an edit still keeps the fast reopen preview of large drafts in most cases.

- Every toolbar key now selects its tool: <kbd>V</kbd> Move, <kbd>H</kbd> Hand, <kbd>Z</kbd> Zoom, <kbd>T</kbd> the Type tools, and <kbd>Shift</kbd>+<kbd>R</kbd> (shown as **⇧R**) for Smudge, Blur and Sharpen; <kbd>R</kbd> stays Rotate View. See [Keyboard shortcuts](keyboard-shortcuts).
- Menu shortcuts match their modifiers exactly: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> is **Edit > Fade…**, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> **Find Layers**, <kbd>Ctrl</kbd>+<kbd>,</kbd> **Hide Layers**, and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Z</kbd> **Toggle Last State**, which now switches between the current and the previous state.
- A **Help** menu and <kbd>F1</kbd> open this Help Center.
- **Edit > Keyboard Shortcuts…** shows a readable table that includes Search commands. **Find and Replace Text…** has clearly visible text boxes.
- **Check Spelling…** uses a list of about 3,700 common English words and accepts their regular forms, so far fewer correct words are listed. See [Find, replace and check spelling](find-replace-and-spellcheck).
- Rounded Rectangle and Custom Shape have **Tool presets**.
- **Edit > Fade…** works right after a live filter: the fade is stored on the filter and stays editable with a **Faded to (Edit → Fade)** slider. See [Fade an edit](fade).
- Filter controls now say what they do: Twirl and Spherize radius set the affected area, Tree has **Trunk length**, relative sizes read "% of shorter side" or "% of half diagonal", thresholds read "n / 255", and filters without a radius (Average, Blur, Despeckle, Sharpen, Solarize) no longer show one. Lens Correction and Adaptive Wide Angle now scale with the image.
- **Liquify** Bloat now enlarges and **Pinch** pulls inwards. **Sharpen** is a fixed sharpening kernel, distinct from Unsharp Mask, and Camera Raw **Clarity** now adds midtone local contrast. The Filter menu has a **Sharpen** heading.

## November 13, 2026

- **Edit > Stroke Selection…** now opens a full dialog: width, colour (with **Use foreground**), location (Inside, Center or Outside), opacity and blend mode. The stroke is one undo step and no longer wipes the rest of the layer.
- **Edit > Fill…** has **Pattern** contents, including a new seamless **Mesh** pattern that is also available in Pattern Stamp and Pattern Overlay.
- New quick fills: **Edit > Fill with Foreground Color** (<kbd>Alt</kbd>+<kbd>Backspace</kbd>) and **Edit > Fill with Background Color** (<kbd>Ctrl</kbd>+<kbd>Backspace</kbd>).
- The document bar has a **Save draft** button that saves to this browser immediately. "Save local copy" is now called **Duplicate draft**. See [Drafts and saving](drafts-and-saving).
- Large drafts reopen much faster: a saved preview appears at once and an "Opening draft…" progress bar counts the layers as they load.
- Soft-edged (feathered) selections on large canvases are faster to apply and paint inside.
- **Filter > Render > Light Rays…** shows guides for where rays start, end and fade (turn them off with **Show ray extent guide**), and now renders on a transparent layer by default.
- Gaussian Blur radius and selection feather go up to 1000 px.
- A Lasso or Marquee drawn entirely outside the canvas now makes an empty selection, so Fill, Clear, Delete and Stroke no longer affect the whole layer.
- Painting fixes: strokes keep previewing while the tab is hidden, and separate dabs no longer join into one line when the browser misses a pointer release.

## November 12, 2026

- SVG support: **File > Export as SVG** keeps shapes, paths, text and groups as vector elements, and opening or placing an SVG turns its shapes, paths, simple text and groups into editable layers. See [SVG import and export](svg-import-and-export).
- Filters apply only inside the active selection. The Filters panel has **Whole layer** and **Use current selection** buttons.
- New **Layer > Move to Position…** command, also in each layer row's menu.
- Toolbar buttons with more tools show a small corner triangle; right-click or press and hold to see them.
- Faster reopening and first strokes on large drafts, and Lens Flare renders faster. Lens Flare can render on an empty layer with **Fill transparent pixels**.

## November 10, 2026

- Layers panel rows show thumbnails.
- The Move tool has **Auto-select layer**, and right-click or long-press on the canvas selects the layer under the pointer without moving it.
- Painting on low layers in tall layer stacks is faster on large canvases.

## November 9, 2026

- The properties sidebar shows only the active tool's options; other panels are under **More panels**, and phones get a bottom sheet.
- A new Type tool family: type directly on the canvas with point and paragraph text, vertical type and type masks, Character and Paragraph panels and type presets.
- A built-in library of 146 open-licensed font families with a searchable font picker and a **Glyphs, Icons & Symbols** panel.
- **Tool presets** save, apply, import and export each tool's settings.
- New tools: **Audio Annotation**, **Rounded Rectangle**, **Custom Shape**, **Path Selection**, **Add Anchor Point**, **Delete Anchor Point** and **Convert Point**.
- New **Silk strands** brush mode with a **Silk smoke** preset.
- Smudge carries paint along the stroke and gains Strength, blend modes, Finger Painting and Sample All Layers.
- **Curves** supports several editable points per channel.
- The Layers panel supports drag-and-drop reordering, a delete button and a menu on each row, and accepts image files dropped onto it.
- Animated selection outlines for every selection type; Red Eye and Mixer Brush fixed; more options for Magic Wand, Fill, Crop, Clone, Spot Healing, Patch, Gradient, Pen and the shape tools.
- Thinner auto-hiding scrollbars and fewer visual glitches when using flyouts and clicking the canvas.

## November 8, 2026

- **Paint Symmetry** also works with Stroke Path with Brush, the Mixer, History and Art History brushes, Clone Stamp and Healing.
- New and duplicated layers appear above the selected layer.
- Brush and Pencil have a **Mode** (blend mode) option.
- **Filter > Render > Difference Clouds** works on transparent layers and has a **Cloud size** slider.
- Blur filters soften the edges of brush-stroke layers.
- Clipping masks survive Rasterize, Merge and Arrange, and clipped layers are indented in the Layers panel.
- **Select > Save Selection…** asks for a name; **Download Selection File…** and **Load Selection File…** are separate commands.
- **Edit > Fill…** (<kbd>Shift</kbd>+<kbd>F5</kbd>) opens a Fill dialog.
- The "New version available" notice was added.
- Faster painting with retouching brushes and in documents with many layers.

## November 7, 2026

- Much larger projects: up to 512 layers and 128 groups, with pixel budgets based on your device's memory. See [Large documents](large-documents).
- Undo history is about ten times larger: up to 240 steps.
- **Paint Symmetry** for Brush, Pencil and Eraser, and **Layer > Stroke Path with Brush…**.
- **Filter > Render > Light Rays…** for rays and starbursts.
- Brush colour jitter and a brush preset library with four space-art presets.
- A reference image overlay that is never exported: **File > Place reference image…**.
- **Edit > Paste Image from Clipboard**, and more reliable export downloads.
- Filters can be stacked on a layer, then hidden, reordered or removed.
- 26 layer blend modes, and **Outer Glow** and **Inner Glow** layer styles.
- Retouching tools stay inside the selection, and Clone Stamp shows its source on the canvas.
- Many large-document speed improvements for filters, strokes and reopening projects.
