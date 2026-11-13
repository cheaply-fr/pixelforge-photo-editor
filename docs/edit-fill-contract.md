# Edit > Fill… contract

Edit > Fill… (`Shift+F5`) fills the active visible, unlocked raster layer:
the selection when there is one, otherwise the whole layer. It refuses an
empty selection before opening (see
[`selection-composition-contract.md`](./selection-composition-contract.md)).
Sources: `src/editFill.ts` (pure options, pattern tiling and masking),
`src/EditFillDialog.tsx` (dialog), `fillActiveLayer` in `app/page.tsx`.

## Contents

* Foreground Color, Background Color, Color…, Black, White, 50% Gray.
* **Pattern**: repeats a pattern across the layer, phase-anchored at the layer
  origin.
  * The procedural Pattern Stamp patterns (`PATTERN_IDS` in
    `src/patternStamp.ts`: Checker, Stripes, Dots, Grid, Diagonal, Mesh), drawn
    in the foreground colour over the background colour exactly as Pattern
    Stamp draws them. **Transparent background (lines only)** is on by default,
    so gaps leave the layer untouched (for example a fishnet over skin); off,
    gaps take the background colour. Tile size is a whole number of pixels from
    4 to 128 (the Pattern Stamp range) and is refused outside it.
  * Selection-defined image patterns (Pattern Stamp "Define pattern from
    selection") are offered too, used at their defined size and colours.
  * The dialog starts on the Pattern Stamp's current pattern and tile size.
* **Mesh** is an original diamond (fishnet) lattice: lines along both
  diagonals, half-width `floor(tile / 16)` px, seamless across tiles. It is
  also available to Pattern Stamp and the Pattern Overlay layer style, which
  share one predicate (`patternUsesForeground`).

## Guarantees

* Mode is a Canvas-native blend mode; opacity is a whole 1–100%.
* The selection mask (including feather) confines the fill: pattern alpha is
  multiplied by the rendered selection coverage, the same result as the colour
  fill's `destination-in` mask. Unselected pixels never change.
* One fill is one history step; Undo restores the original pixels. Options are
  not stored in drafts, projects or Actions. Normalization refuses unknown
  pattern ids, image patterns that no longer exist and out-of-range sizes
  rather than guessing.
* Everything runs locally; no pattern or pixel data leaves the browser.
  This is a bounded local fill, not Photoshop pattern-library parity.

## Tests

`tests/edit-fill.test.mjs` and `tests/edit-fill-pattern.test.mjs`
(normalization, deterministic and seamless tiles, colours, selection and
feather confinement); `tests/browser/edit-fill-pattern.spec.ts` on desktop and
mobile (mesh inside vs outside a marquee, opaque background, feathered edge,
one-step undo) alongside `tests/browser/tool-selection-bugs.spec.ts`.
