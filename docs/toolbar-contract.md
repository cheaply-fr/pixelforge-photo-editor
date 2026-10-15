# Compact toolbar and tool-family contract

The left palette keeps every implemented tool reachable in a compact two-column
layout, expanding to three columns on wide editor viewports. Tools are grouped
under Navigate, Measure, Marquee, Lasso, Selection, Crop & Slice, Retouch,
Paint & Fill, and Draw & Type headings. Category grids use the same two/three
column geometry as the palette, so each category stays aligned at desktop and
wide desktop breakpoints. Each repeated-key/flyout family occupies one compact
category slot; the active variant replaces that slot's label and icon while the
other variants remain in the press-and-hold menu. This removes duplicate
toolbar buttons without hiding a tool or changing its persisted `Tool`
identifier.

Tool buttons with Photoshop-style subtools expose `aria-haspopup="menu"` and a
stable `id`. There is one flyout at a time, rendered against the viewport so
the palette's scrolling/overflow cannot clip it. Its `aria-labelledby` points
to the trigger id and its menu items expose explicit accessible names.

A pointer or touch press held for 420 ms opens a flyout without selecting the
parent tool. Releasing a short click, or pressing Enter/Space on a trigger,
selects the trigger. Arrow Up/Down and the context menu open the flyout. A
flyout owns focus on open: Home/End move to the first/last item, Up/Down rove
between items, and Escape or an outside pointer dismisses it and returns focus
to its trigger. Flyout items are ordinary menu buttons, retain the existing
tool IDs and shortcuts, display the same Lucide icon vocabulary as the toolbar,
and can be activated by touch, mouse or keyboard.

Repeated Photoshop keys continue to cycle the existing keyboard families:
`M` marquee, `L` lasso, `W` selection, `C` crop, `G` fill, `B` paint, `U`
shapes, `I` measurement, `E` eraser, `O` tonal, `S` stamp, and `J` healing.
The Selection category keeps `Selection Brush` as an independent slot and the
Selection flyout presents the implemented `Quick Selection` and `Magic Wand`
names. It does not relabel Selection Brush as Quick Selection. `W` cycles the
three implemented selection tools, while `L` retains the legacy lasso family.
The Pen, Freeform Pen and Curvature Pen variants likewise occupy one `P`
family slot with a visible arrow and icon-bearing flyout; the active variant
replaces that representative slot and the remembered choice survives reload.
Measurement tools remain independent slots so Eyedropper, Color Sampler, Ruler,
Note and Count are visible without being incorrectly collapsed into one family.

Coverage lives in `src/toolPalette.ts`, `tests/tool-palette.test.mjs`, and the
desktop/mobile `tests/browser/toolbar-layout.spec.ts` acceptance tests. The
tests assert category completeness, family cycling, explicit menu names,
single-popup anchoring, viewport bounds, short activation, press-and-hold and
touch selection, roving menu focus, Escape/outside dismissal, and preservation
of two/three-column touch targets.
