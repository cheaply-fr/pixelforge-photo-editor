# Navigation, sampling, measurement and crop tool options

Zoom, Eyedropper, Color Sampler, Ruler, Note, Count, Crop and Perspective
Crop show their options in the properties sidebar's Tool options section,
titled with the tool's name (for example "Ruler options"; Audio Annotation
uses the same naming). These tools never show the painting Size control.
Settings live in one bounded `navigationTools` record in the draft settings
(`src/navigationOptions.ts`): every key is optional, absent keys use the
defaults below, and a present but invalid value rejects the draft like the
other tool settings. Options are view or tool settings only; nothing here
changes pixels until the user applies an edit, and every edit is undoable.

These are bounded local approximations of the Photoshop tools of the same
name, not a claim of parity.

| Setting | Values | Default |
|---|---|---|
| `zoomMode` | `in`, `out` | `in` |
| `scrubbyZoom` | boolean | `false` |
| `eyedropperSize` | 1 (Point), 3, 5, 11, 31, 51, 101 | 1 |
| `eyedropperSample` | `all` (rendered image), `current` (active layer pixels) | `all` |
| `countGroup` | 1–40 printable characters | `Count 1` |
| `countColor`, `noteColor` | `#rrggbb` | `#ff5c35`, `#ffb347` |
| `countLabelSize` | whole px, 8–72 | 12 |
| `cropRatio` | `free`, `original`, `1:1`, `4:5`, `5:7`, `2:3`, `3:4`, `16:9`, `ratio`, `size` | `free` |
| `cropWidth`, `cropHeight` | whole numbers 1–16,000 | 1600, 900 |
| `cropResolution` | whole ppi 0–2,400 (0 keeps the document's) | 0 |
| `cropOverlay` | `thirds`, `grid`, `none` | `thirds` |
| `cropDeletePixels` | boolean | `false` |

## Zoom

Zoom In / Zoom Out mode sets the click direction and Alt inverts it. 100%,
Fit Screen and Fill Screen buttons sit beside an opt-in Scrubby Zoom (drag
right to zoom in, left to zoom out). `Ctrl/⌘+0` and `Ctrl/⌘+1` are handled
with `preventDefault`. See [view zoom](./view-zoom-contract.md).

## Eyedropper and Color Sampler

Sample Size averages a square centred on the click, clipped to the image;
colour is alpha-weighted so transparent pixels do not darken it
(`averageSample`). Sample: All Layers reads the rendered composite, Current
Layer reads the active raster layer's own pixels (other layer kinds report
that they cannot be sampled). Click sets the foreground colour and Alt-click
the background colour, including when sampling a reference image.

The Color Sampler options list every sampler with its RGB, hex and alpha.
Values are live: after each render settles the composite under each marker
is read again, so edits update the list. Each sampler has a delete button and
Clear All removes every sampler; both are single undoable steps.

## Ruler

The readout shows length, angle, Δx and Δy for the drag in progress or the
latest ruler. Angles use Photoshop's convention: a line rising to the right is
positive (`photoshopAngle`); Δy follows image coordinates (down is positive).
Clear removes the ruler lines. Straighten Layer rotates the active (unlocked,
non-adjustment) layer about the ruler's midpoint by the smallest turn that
levels the line (`straightenRotation`, in (−90°, 90°]), turns its layer mask
with it, and clears the ruler — one undoable step.

## Note and Count

Notes use an in-app editor (see [measurements](./measurement-contract.md)).
The options set the colour of new notes and clear all notes.

Count markers are numbered per count group and carry the group's colour.
The options edit the group name (with the document's existing groups offered
as suggestions) and colour, the label size used to draw every marker, list
the totals per group and Clear count removes the current group's markers in
one undoable step.

## Crop

* Ratio presets constrain the drag (`constrainCropEnd`), using whole pixels
  so the staged crop keeps the ratio exactly (within one pixel for
  non-integer ratios) and never leaves the canvas. "Custom ratio" uses W : H;
  "W × H px" also resamples the applied crop to exactly W × H pixels and
  scales annotations with it.
* A non-zero resolution is written to the image size metadata on apply.
* Overlay draws the rule of thirds, an 8 × 8 grid or nothing over the
  preview.
* Delete Cropped Pixels off (default) keeps pixels outside the crop on their
  layers, as the document model is non-destructive; they can be moved back
  into view. On, plain raster layers placed on whole pixels are trimmed to
  the crop losslessly (`planCropTrim`); type, shape, smart object, scaled or
  rotated layers and layers carrying cleanup metadata keep their content.
* Straighten arms a one-shot line drag: the whole document rotates about the
  canvas centre so the line is level (one undoable step), then a crop preview
  of the largest centred rectangle without empty corners is staged
  (`inscribedCropAfterRotation`).

## Perspective Crop

A drag stages a rectangle; four clicks stage the clicked quad. Corner handles
are dragged on the canvas and the numeric panel is docked in the sidebar, so
it never covers a handle. See [crop, frame and slice](./crop-slice-contract.md).

## Evidence

* `tests/navigation-tool-options.test.mjs`: Photoshop angle, ruler readout,
  straighten rotation and matrices, sample averaging, count groups, note
  colours, settings validation/normalisation, Fill/Scrubby zoom.
* `tests/crop-slice-options.test.mjs`: ratio presets and constrained drags,
  inscribed straighten crop, crop trimming plans, scaled annotations,
  perspective rectangle/click ordering/corner hit testing, slice hit testing,
  moves and resizes.
* Desktop and mobile Playwright: `tests/browser/audit-nav-zoom-view.spec.ts`,
  `tests/browser/audit-nav-measure.spec.ts`,
  `tests/browser/audit-nav-crop.spec.ts`.
