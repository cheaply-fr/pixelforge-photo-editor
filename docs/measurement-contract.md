# Sampling and measurement contract

PixelForge's Sampling and Measurement tools are workspace overlays. Eyedropper
changes the foreground color; Color Sampler stores an exact rendered RGB/alpha
sample; Ruler stores pixel distance and angle; Note stores a bounded plain-text
annotation; and Count adds sequential numbered markers. All four annotation
types are kept on the editable frame, survive local/project reloads and remain
undoable. They are omitted from PNG, JPEG, WebP and batch exports so an
annotation cannot accidentally become image content.

Coordinates are validated against the frame dimensions and capped at 512
annotations. Note text is capped at 500 characters and rejects control bytes;
a note may carry an optional `#rrggbb` colour. Count markers may carry a
count `group` (1–40 printable characters; markers without one belong to
"Count 1") and a `#rrggbb` colour, and are numbered per group. Ruler geometry
uses Euclidean pixel distance; the stored `angle` keeps the image-space sign
(down-right positive) for compatibility, while every label and readout shows
Photoshop's convention (a line rising to the right is positive). Color Sampler
reads the rendered composite, including the current layer stack and masks,
without mutating source assets.

Notes are written in an in-app editor anchored at the click (never
`window.prompt`, which can be blocked): clicking a note opens it for editing,
recolouring or deletion, and dragging it moves it. The tool options for
Eyedropper sample size/source, the Color Sampler list, the Ruler readout and
Straighten Layer, and count groups are described in the
[navigation tool options contract](./navigation-tool-options-contract.md).

The pure test contract covers exact color/alpha capture metadata, ruler
distance and both angle conventions, per-group Count indices, coordinate
bounds, note safety and colours, and malformed records. Desktop and mobile
browser tests cover real pointer gestures, in-app notes, project download and
reload persistence. The
overlay is deliberately pointer-transparent and rendering-independent so image
exports remain pixel-identical.
