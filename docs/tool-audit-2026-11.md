# Toolbar audit on production — 2026-11-09

Hands-on test of every toolbar tool and flyout subtool on
https://photoeditor.cheaply.fr/editor, in the Claude desktop app's built-in
browser (Chromium, viewport emulated at 1440×900, mouse input, anonymous,
no sign-in, no cloud save, no downloads).

- Release at start: `0.1.1004`, commit `93fa45a1ac785a93629ccecfd16c0e7fbd232f90`
  (built 2026-11-09T05:22Z). `origin/main` was already `6828cdb` (#250 merged,
  not yet deployed) when the audit started.
- Release changes during the audit: `0.1.1007` / `6828cdb` went live at 10:29Z and was used from then on (see end of report).
- This is an audit only; no code was changed.

Status key: **PASS** works as a Photoshop-style user expects ·
**BUG** broken or wrong result (see Bugs) · **IMPROVEMENT** works but has a UX
gap (see Improvements) · **NOT TESTED** with reason.

## Coverage checklist

28 rail slots, 69 tools (from `src/toolPalette.ts` `TOOL_FLYOUTS`, confirmed in the UI).

| # | Rail slot | Tool | Status | Notes |
|---|---|---|---|---|
| 1 | Move | Move (V) | PASS | Drag moved layer exactly by the drag distance; undo restored identical pixels. Align/Distribute options in sidebar. See I-01 (Background not locked). |
| 2 | Hand | Hand (H) | PASS | Pans 1:1, no history entry, pixels untouched. See B-03 (zoom pill scrolls away). |
| 3 | Zoom | Zoom (Z) | PASS | Click zooms in 50 → 66.67 → 100 % anchored on the click point once the image exceeds the viewport; Alt-click zooms out. See I-02 (no options). |
| 4 | Rotate View | Rotate View (R) | BUG | Drag rotated view to 122.7°, Reset view back to 0°, pixels/history untouched. See B-04 ("Reset view" label overflows). |
| 5 | Eyedropper | Eyedropper (I) | IMPROVEMENT | Sampled sun exactly (#c9814f = 201,129,79). See I-03 (no sample size/layer options, Alt-click does not set background). |
| 6 | Color Sampler | Color Sampler | IMPROVEMENT | Two markers placed, status shows last value, undo removes last marker. See I-04 (no list/readout of all samplers, no clear). |
| 7 | Ruler | Ruler | IMPROVEMENT | 500.8 px · 36.8° for a drag that should measure ≈501 px; line + label persist. See I-05 (no Straighten/Clear). |
| 8 | Note | Note | IMPROVEMENT | Uses native `window.prompt()`; the pane auto-dismisses it, so tested with `window.prompt` temporarily stubbed (restored right after). Note label then drawn at click point. See I-06. |
| 9 | Audio Annotation | Audio Annotation | PASS (partial) | Click opens Record / Attach audio popover at the point. Recording and attaching NOT TESTED (microphone / file upload). See I-07. |
| 10 | Count | Count | IMPROVEMENT | Markers numbered 1, 2 in the overlay; undo removes the last. See I-08 (no options/clear). |
| 11 | Marquee | Rectangular Marquee (M) | BUG | Selection is created and confines paint exactly, but no outline is ever drawn (B-01). Feather slider feathers only the current selection (I-09). Delete does not clear pixels (I-10). |
| 12 | Marquee | Elliptical Marquee | BUG | Paint clipped to an exact ellipse (row 62: 245–555 vs expected 250–550). No outline (B-01). |
| 13 | Marquee | Single Row Marquee | BUG | Selects exactly one row (paint landed only on y=420). No outline (B-01). |
| 14 | Marquee | Single Column Marquee | BUG | Selects exactly one column (x=500). No outline (B-01). |
| 15 | Lasso | Freeform Lasso (L) | BUG | Circle drawn → paint clipped to 280–516 for a 280–520 circle; Subtract mode punched the expected hole. No outline (B-01). Status says "Polygonal selection created" (I-11). |
| 16 | Lasso | Polygonal Lasso | BUG | Triangle by 3 clicks + click on start; clip at y=800 exactly 210–650 (computed 210–650). No outline (B-01). |
| 17 | Lasso | Magnetic Lasso | BUG | Real mouse drag → "Magnetic selection created". No outline (B-01). Curved tracing not possible with the pane's straight drags. |
| 18 | Selection Brush | Selection Brush | BUG | Painted an 18 px selection band matching Size 18. No outline (B-01). |
| 19 | Selection | Quick Selection (W) | BUG | Click or drag creates nothing and leaves the gesture hanging until Escape (B-02). |
| 20 | Selection | Magic Wand | BUG | Click on sun selected exactly the sun disc. No Tolerance/Contiguous/Sample All Layers control in its options (B-05). No outline (B-01). |
| 21 | Crop & Slice | Crop (C) | IMPROVEMENT | Drag → preview 1001×703 (expected ≈1000×700) with thirds grid, Apply/Cancel; Enter applied, Undo restored 1440×960. No options at all (I-12). |
| 22 | Crop & Slice | Perspective Crop | BUG | Corner clicks do nothing; a drag creates a pre-skewed quad with numeric corner fields; Enter applied 922×652, Undo restored. The floating preview panel covers the top-right corner handle (B-06). Pre-skewed default (I-13). |
| 23 | Crop & Slice | Slice | PASS | Drag → slice preview 359×287 with name, Save slice ("Slice saved: slice-1"). Download PNG not tested (download). |
| 24 | Crop & Slice | Slice Select | IMPROVEMENT | Click selects slice-1 with Update/Delete; Delete works. Dragging does not move/resize the slice (I-14). |
| 25 | Crop & Slice | Frame | BUG | Drag → "name and add artboard"; adds an artboard (undo removes it). The artboard control bar above the canvas has no CSS at all (B-07). Naming vs Photoshop Frame tool (I-15). |
| 26 | Stamp | Clone (S) | BUG | Alt-click source + drag copied the sun colour exactly (201,129,79); undo exact. At Opacity 50 % a stroke reached ≈87 % (B-08). No Aligned / Sample-layers options (I-16). |
| 27 | Stamp | Pattern Stamp | IMPROVEMENT | "Stripes" pattern painted red/white stripes from FG/BG; undo exact. Only 5 procedural patterns, no pattern from image/selection (I-17). |
| 28 | Healing | Healing Brush (J) | PASS | Size 40, Alt-click sky source, drag over the red line → replaced with sky tones (76,106,136); undo exact. |
| 29 | Healing | Spot Healing | PASS | Drag over red line → sky tones (62,89,121), "applied nondestructively"; undo exact. No Type (Content-Aware/Proximity/Texture) option (I-18). |
| 30 | Healing | Patch | IMPROVEMENT | Works brush-style: click source, drag destination → sky tones; undo exact. Not Photoshop's select-and-drag patch workflow (I-19). |
| 31 | Healing | Red Eye | BUG | Click on a pure-red (255,0,0) stroke says "Red Eye correction applied" but no pixel changes and an empty history step is added (B-09). |
| 32 | Retouch | Smudge (R) | PASS | Drag from sky into sun smeared blue into orange with falloff (95,114,132 → 152,124,108); undo exact. Rich options. |
| 33 | Retouch | Blur | PASS | Drag across sun edge mixed the edge pixel (146,120,105); undo exact. |
| 34 | Retouch | Sharpen | PASS | Drag across sun edge raised edge contrast (201 → 229 red); undo exact. |
| 35 | Tone | Dodge (O) | PASS | Lightened sun 201,129,79 → 232,202,182; Range/Exposure options; undo exact. |
| 36 | Tone | Burn | PASS | Exposure changed to 20 %, darkened → 135,87,53; undo exact. |
| 37 | Tone | Sponge | PASS | Saturate mode → 231,124,49; undo exact. |
| 38 | History | History Brush (Y) | IMPROVEMENT | After choosing the pre-stroke state it partially restored sky under a red stroke (flow 75 %); undo exact. Source defaults to the current state, so out of the box it paints nothing; entries are "Snapshot N" (I-20). |
| 39 | History | Art History Brush | PASS | Stylised strokes from the chosen state; undo exact. |
| 40 | Brush | Brush (B) | BUG | Paints FG exactly; confined by selections; undo exact; dropdowns now styled after #250. Opacity 50 %: single dab = exactly 50 % (145,29,33) but a stroke = 93.75 % (B-08). Silk strands: 16 discrete fine strands at Size 2; at Size 80 they merge into blobs because Size becomes strand thickness (I-21). |
| 41 | Brush | Pencil | PASS | Size 12 → exactly 12 rows of pure red, no anti-aliased edge pixels; undo exact. |
| 42 | Brush | Color Replace | IMPROVEMENT | Replaced sun orange within tolerance 24, sky untouched; undo exact. Paints the flat FG colour (per contract) instead of keeping luminance; no Mode/Sampling/Limits (I-22). |
| 43 | Brush | Mixer Brush | BUG | Two strokes from sky into the sun: status "Mixer Brush stroke applied", a history step is added, but no pixel changes (B-10). |
| 44 | Fill | Gradient (G) | IMPROVEMENT | Linear red→transparent and Radial (option changed) both correct; undo exact. No Angle/Diamond types (I-23). |
| 45 | Fill | Fill / Paint Bucket | BUG | Click filled the contiguous sea only; undo exact. Sidebar shows no options although it uses the shared tolerance (B-05). |
| 46 | Eraser | Eraser (E) | PASS | Erased to transparent (0,0,0,0) under the stroke only; undo exact. On Background see I-01. |
| 47 | Eraser | Background Eraser | PASS | Size 60, drag from sky across sun edge → sky erased, sun kept; undo exact. |
| 48 | Eraser | Magic Eraser | PASS | Click on sea removed the contiguous sea only; tolerance option shown; undo exact. |
| 49 | Mask Brush | Mask Brush (K) | PASS | Without a mask: clear notice. After Select All → "Mask from selection": revealed previously concealed pixels; undo exact. |
| 50 | Mask Brush | Mask Eraser | PASS | Concealed the stroke area to transparent; undo exact. |
| 51 | Mask Brush | Adjustment Brush | BUG | On a raster layer: clear notice. On a fresh adjustment layer (Layer → New Adjustment Layer, Saturation 0) every stroke is refused with "Create a layer mask or remove a background before refining" (B-11). |
| 52 | Pen | Pen (P) | IMPROVEMENT | 4 clicks (one dragged smooth) + click on first → "Path 1" layer, filled with FG. No Path/Shape mode or Auto Add/Delete; closing immediately fills (I-24). |
| 53 | Pen | Freeform Pen | PASS | Drag → "Freeform Path 2" layer. |
| 54 | Pen | Curvature Pen | PASS | 3 clicks + close → smooth "Curvature Path 3"; closing segment stays straight (minor, I-24). |
| 55 | Pen | Add Anchor Point | PASS | Click on Path 1 top edge → "Path anchor added" (anchor then draggable). |
| 56 | Pen | Delete Anchor Point | PASS | Click on that anchor → "Path anchor deleted", peak gone. |
| 57 | Pen | Convert Point | PASS | Drag on corner → "converted to smooth", outline changed. |
| 58 | Path Selection | Path Selection (A) | PASS | Drag moved the whole path 30 px; undo restored. |
| 59 | Path Selection | Direct Selection | PASS | Dragged the added anchor up, shape peaked accordingly. |
| 60 | Type | Horizontal Type (T) | BUG | Click + type "Audit" + ✓ → layer "Audit", tool switched to Move as designed. Changing **Layer font** restyled it. Changing the Text-section **Font** picker did not restyle the existing layer — fixed on main by #249 (merged 11:03Z, not yet deployed). Three separate font pickers (I-25). |
| 61 | Type | Vertical Type | PASS | Click + "VERT" + Ctrl+Enter → stacked V-E-R-T layer, switched to Move. |
| 62 | Type | Horizontal Type Mask | BUG | On empty canvas: "Horizontal Type Mask selection created". Clicking on existing text instead opens that text layer for editing and inserts the typed characters into it (B-12). |
| 63 | Type | Vertical Type Mask | PASS | Click + "VM" + Ctrl+Enter → selection; a 60 px brush stroke over it only painted the glyph areas. |
| 64 | Shape | Rectangle (U) | IMPROVEMENT | Drag → "Shape 6" outline-only rectangle (stroke = Size/3). Labelled "Shape" in the flyout/status; no fill/stroke/W×H options (I-26). |
| 65 | Shape | Rounded Rectangle | IMPROVEMENT | Corner radius changed to 60 → filled "Rounded Rectangle 7" with correct rounded corners. Filled while Rectangle/Ellipse are outlines (I-26). |
| 66 | Shape | Ellipse | IMPROVEMENT | Drag → outline ellipse, layer named "Shape 8" (I-26). |
| 67 | Shape | Line | PASS | Drag → "Line 9". |
| 68 | Shape | Polygon | PASS | Variant changed to Star → 5-point star outline "Polygon 10". |
| 69 | Shape | Custom Shape | PASS | 15-shape picker; picked check-mark → filled "Checkmark 11"; undo removed it. Picker buttons expose no pressed state (I-27). |
| — | (toggle) | Quick Mask (Q) | IMPROVEMENT | Enter, paint, Exit → "Quick Mask converted to selection". The "Reveal selection while painting" label is unstyled 16 px text next to 9 px buttons (part of B-07). |

### Totals

69 tools (plus the Quick Mask toggle, not counted). One status per row; when a tool has both a bug and gaps it is counted as BUG.

| Status | Count |
|---|---|
| PASS | 32 (Audio Annotation counted PASS for placement only; recording/attach not tested) |
| BUG | 21 |
| IMPROVEMENT | 16 |
| NOT TESTED | 0 tools (sub-steps not tested: Audio record/attach, Slice "Download PNG") |

8 of the BUG rows (11–18) are BUG only because of B-01 (no selection outline); their selection logic itself was exact.

## Bugs

All bugs were reproduced at least twice and re-verified on `0.1.1007` / `6828cdb` (live from 10:29Z); some were first seen on `93fa45a`.

### Blocker

None. Every tool family has a working path, but three tools are no-ops (B-02, B-09, B-10).

### Major

**B-01 · All selection tools · No selection outline (marching ants) is ever drawn.**
Steps: Rectangular Marquee, drag on the image (same for Elliptical, Single Row/Column, all Lassos, Selection Brush, Magic Wand, Type Mask, Quick Mask exit).
Expected: an animated dashed outline. Actual: status "Rectangular selection created" and the selection works (paint is confined exactly), but nothing is drawn. Screenshots after 1 s show the untouched image; the stage has no overlay element for selections and canvas pixels are unchanged; no selection-outline renderer exists in `app/` or `src/`.
Impact: users cannot see what is selected or whether a selection exists. Release `93fa45a` and `6828cdb`.

**B-02 · Quick Selection · Click or drag creates nothing and leaves the tool stuck.**
Steps: Quick Selection (W), Size 18, tolerance 24; click or drag inside the sea.
Expected: a connected selection grows over the sea. Actual: no notice, no selection; pressing Escape then reports "Quick Selection cancelled", so the gesture never finished. Until Escape, further drags are silently ignored. Reproduced 4× from a clean state. No console error. Release `6828cdb`.

**B-05 · Magic Wand and Fill · No tolerance control.**
Expected: Tolerance, Contiguous, Anti-alias, Sample All Layers. Actual: Magic Wand shows only selection mode/feather; Fill shows "Fill has no sidebar options". Both use the shared `colorTolerance`, which is only exposed while Quick Selection, Color Replace or the erasers are active (tolerance slider condition in `app/page.tsx`). Release `6828cdb`.

**B-08 · Brush, Clone (stamp tools) · Opacity is not a per-stroke maximum.**
Steps: Brush, Opacity 50 %, Flow 100 %, Build-up 0, Spacing 25 %; click once, then drag a stroke over a flat (34,59,66) area with red.
Expected (and per `docs/brush-tool-contract.md`: "Maximum alpha for Brush, Eraser, Clone and Healing stamps"): 50 % everywhere ≈ (145,30,33). Actual: single dab exactly 50 % (145,29,33), but the stroke is (242,3,4) = 93.75 % = 1 − 0.5⁴: overlapping dabs compound. Clone at 50 % gave ≈ 87 %. Release `6828cdb`.

**B-09 · Red Eye · Reports success but changes nothing.**
Steps: Red Eye, Size 40, threshold 36, amount 100 %; click on a pure red (255,0,0) stroke.
Expected: red neutralised toward (0,0,0) per `src/redEye.ts`. Actual: "Red Eye correction applied", pixels stay (255,0,0) after 2.5 s, the red line is visibly unbroken, and an empty history step is added. Reproduced 2×. Release `6828cdb`.

**B-10 · Mixer Brush · Reports success but changes nothing.**
Steps: Mixer Brush (Wet 45, Load 55, Mix 50, Flow 65); drag from sky into the sun, twice on different rows.
Expected: sky colour mixed into the sun. Actual: "Mixer Brush stroke applied", canvas hash identical, sampled pixels unchanged, empty history step added. Release `6828cdb`.

**B-11 · Adjustment Brush · Unusable on a new adjustment layer.**
Steps: Layer → New Adjustment Layer ("Adjustment 1"), Saturation 0 (image turns grey), Adjustment Brush, drag.
Expected: paint the adjustment's mask. Actual: every stroke is refused with "Create a layer mask or remove a background before refining" (the Mask Brush message). New adjustment layers have no mask and the brush requires one; it also only ever reveals. Release `6828cdb`.

**B-12 · Horizontal Type Mask · Clicking on existing type edits that text layer.**
Steps: create text layer "Audit"; choose Horizontal Type Mask; click on "Audit"; type "MASK"; Ctrl+Enter.
Expected: a new type-mask selection, existing layers untouched. Actual: "Editing type…", the layer becomes "AudMASKit", no selection. Reproduced 2×. Works on empty canvas. Release `6828cdb`.

### Minor

**B-03 · Zoom control · Scrolls away with the image.** The zoom pill is `position:absolute; bottom:16px` inside the scrolling `.stage`, so when zoomed in and scrolled it floats mid-canvas or leaves the view (at 100 % after a Hand pan: pill at y≈533 of 780, stage `scrollTop` 161). Release `93fa45a`, `6828cdb`.

**B-04 · Rotate View · "Reset view" label overflows its button.** 32 px button, 16 px text wrapping to two lines (41 px), so "view" hangs below. Still present after #250. Release `93fa45a`, `6828cdb`.

**B-06 · Perspective Crop · Preview panel covers a corner handle.** After a drag over doc (200,100)–(1200,800) the top-right corner is at (1119,154); `elementFromPoint` there hits the `perspective-crop-controls` fieldset, so that handle cannot be dragged (numeric fields still work). Release `6828cdb`.

**B-07 · Frame (artboards) and Quick Mask · Unstyled controls.** After adding an artboard the `.artboard-controls` bar above the canvas has no CSS: 16 px default text, transparent buttons reading as run-together text ("Fit active layer to artboardReplace smart object and fitExport renders…"), pushing the canvas down. No `artboard-controls` rule exists in `app/globals.css`. The Quick Mask "Reveal selection while painting" label is also unstyled 16 px. Release `6828cdb`.

Not a product bug (test harness): synthetic pointer events failed on Magnetic Lasso because `setPointerCapture` rejects synthetic pointer ids; real mouse drags work.

## Improvements

- **I-01 Move / Eraser · Background is an ordinary layer.** Move shifts it leaving transparency; Eraser erases it to transparency. Photoshop locks Background position and erases to the background colour.
- **I-02 Zoom · No options** (Fit/Fill/100 %/Scrubby zoom). Ctrl+0 can be swallowed by the browser; Fit to screen is only in the View menu.
- **I-03 Eyedropper · No Sample Size or Sample (current/all layers); Alt-click does not set the background colour.**
- **I-04 Color Sampler · Only the last sample is shown (status bar);** no Info-style list of all samplers, no delete/clear except Undo.
- **I-05 Ruler · No Straighten Layer, Clear or measurement scale;** angle sign differs from Photoshop (down-right reads +36.8°).
- **I-06 Note · Uses native `window.prompt()`;** where prompts are blocked it throws an uncaught "prompt() is not supported" with no feedback. Notes cannot be opened, edited, moved, coloured or deleted.
- **I-07 Audio Annotation · Sidebar header says "Tool options" instead of the tool name.**
- **I-08 Count · No options** (groups, colour, label size, Clear).
- **I-09 Marquee/Lasso · Feather slider feathers only the current selection and resets to 0 for each new one** (Photoshop's options-bar Feather applies to the next selection). No Style (Fixed Ratio/Size) or Anti-alias.
- **I-10 Edit · Delete/Backspace do nothing with an active selection** (no Clear).
- **I-11 Naming · Freeform Lasso and Lasso Subtract report "Polygonal selection created"; flyout mixes "Rectangular Marquee" and "Single Row marquee"; rail labels "Select"/"Shape" differ from flyout names.** Flyout items expose no checked state for the active variant.
- **I-12 Crop · No options** (ratio, W×H×resolution, straighten, overlay, Delete Cropped Pixels).
- **I-13 Perspective Crop · Corner clicks do nothing; a drag creates a pre-skewed quad (8 % insets) instead of a rectangle to adjust;** choosing it from the toolbar gives no hint (only the menu command does).
- **I-14 Slice Select · Cannot move or resize slices by dragging.**
- **I-15 Frame · Creates artboards,** unlike Photoshop's image-placeholder Frame tool; also "Artboard nameArtboard 1" label/input spacing.
- **I-16 Clone · No Aligned toggle or Sample (current / below / all layers).**
- **I-17 Pattern Stamp · Only 5 procedural FG/BG patterns;** no pattern from a selection, no Aligned/Impressionist.
- **I-18 Spot Healing · No Type (Content-Aware / Create Texture / Proximity Match).**
- **I-19 Patch · Brush-style (click source, paint destination)** rather than select-then-drag; no Source/Destination switch.
- **I-20 History Brush · Source defaults to the current state, so it paints nothing until an older one is chosen; states are "Snapshot 1…43" without step names.**
- **I-21 Brush Silk strands · Size silently becomes each strand's line width,** so a normal size (80) paints solid blobs.
- **I-22 Color Replace · Paints the flat foreground colour (per contract);** Photoshop's default Color mode keeps luminance. No Mode, Sampling or Limits.
- **I-23 Gradient · No Angle or Diamond types.**
- **I-24 Pen family · No Path/Shape mode, Auto Add/Delete or Rubber Band; closing a path immediately makes a filled layer; Curvature Pen's closing segment stays straight.** All pen/path tools share the same two options.
- **I-25 Type · Three font pickers (Text tool font, Character font family, Layer font);** unclear which affects existing text.
- **I-26 Shapes · Inconsistent fill:** Rectangle/Ellipse/Polygon draw outlines (stroke = Size/3), Rounded Rectangle/Custom Shape draw filled. No fill/stroke colour, stroke width or W×H options. Rectangle is called "Shape"; Ellipse layers are named "Shape N".
- **I-27 Accessibility · Custom-shape picker buttons and flyout items expose no selected/checked state.**

## Method notes

- Inspection: status bar, Layers list, canvas pixels via `getImageData` (read-only) and screenshots. Undo checked with Ctrl+Z (real key and the same key event dispatched in-page) against a canvas hash.
- Freeform paths (lasso circle, some brush strokes) used dispatched pointer events because the pane only offers straight drags; tools that call `setPointerCapture` were tested with real mouse drags.
- `window.prompt` was stubbed once for the Note test and restored immediately.
- Some option values were set through the native input setter plus `input`/`change` events after a real slider drag missed the thumb.
- The test draft was a fresh one the editor created (another session's draft open in a different tab was not touched). No sign-in, cloud save or downloads.

## Release changes during the audit

- 10:29Z: `0.1.1007` / `6828cdb` (#250, tool-option styling) went live mid-audit; the editor was reloaded and everything from the Rectangular Marquee feather test onward ran on it. Navigation/Measure styling findings were re-checked on it.
- #249 (Text-section Font picker restyles existing type) merged at 11:03Z but was not deployed by the end of the audit (live still `6828cdb`).
