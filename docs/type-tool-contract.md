# Type tool contract

PixelForge's Type tools are a bounded, local approximation of Photoshop's
type workflow. They run entirely in the browser with Canvas 2D; no text,
font or image data is uploaded. They do not claim Photoshop parity: shaping,
bidi and hyphenation come from the browser and are approximated as noted.

## Tools and creation

The toolbar's **Draw & Type** category has one Type slot with a flyout and the
`T` keyboard family: **Horizontal Type** (`text`), **Vertical Type**
(`vertical-text`), **Horizontal Type Mask** (`text-mask`) and **Vertical Type
Mask** (`vertical-text-mask`). Each has its own icon.

- **Click without dragging** creates *point type*: one line that never wraps;
  Enter adds a line break. The click point is the first baseline.
- **Drag** creates *paragraph type* inside a box (`textMode: 'paragraph'`,
  `boxWidth`, `boxHeight`). Text wraps at spaces (or anywhere in a word
  longer than the box, and between CJK characters).
- New layers start with the sidebar's *New type text* (empty by default is
  fine; a starter is selected so typing replaces it) and are named from their
  first characters, like Photoshop. Layers show the `T` badge in the Layers
  panel.
- Type Mask tools edit an uncommitted preview and, on commit, create a
  selection from the glyphs through the existing Type Mask pipeline; no layer
  is kept.

## Editing session

Clicking existing type with Horizontal or Vertical Type (or double-clicking
it with Move) starts an on-canvas editing session. Horizontal and Vertical
Type Mask never open or change an existing text layer: a click on existing
type starts a new type-mask entry at that point, exactly as on empty canvas. The session mirrors the layer text in a
hidden `<textarea>` (`aria-label="Type layer text editor"`), so typing, IME
composition, plain-text clipboard, browser spell check (`spellcheck`) and the
mobile virtual keyboard come from the browser. The canvas shows the caret,
selection highlight, box and handles.

- Mouse/touch: click places the caret, drag selects, Shift+click extends,
  double-click selects a word, triple-click a paragraph.
- Keys: arrows; Up/Down/Home/End follow the visual (wrapped) lines;
  Ctrl+arrows, Shift-selection, Ctrl+A, copy/cut/paste are native.
- Styling shortcuts: Ctrl+B/I/U, Ctrl+Shift+> / < (±2 px; with Alt ±10),
  Alt+←/→ tracking (±20, with Ctrl ±100), Alt+↑/↓ leading, Shift+Alt+↑/↓
  baseline shift, Ctrl+Shift+L/C/R alignment, Ctrl+Shift+J justify.
- Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo inside the session.
- **Commit**: ✓ button, Ctrl+Enter (or numpad Enter), clicking outside the
  type, choosing another tool, opening a menu, or page hide. A commit writes
  **one** history entry (a new layer's creation and its typing are one undo
  step). Committing empty type removes the layer.
- **Cancel**: ✕ button or Escape restores the layer (a new layer is removed).
- Paragraph box handles rewrap without scaling; Ctrl/Cmd+drag on a handle
  scales the type; point type handles scale. Ctrl/Cmd+drag inside the box
  moves it. When paragraph text overflows its box, the bottom-right handle
  shows a red `+` and the overlay sets `data-overflow="true"`. Rotation and
  numeric transforms use the existing layer transform commands.

## Character and paragraph formatting

Text layers keep the plain `text` plus an optional versioned rich record:

```json
"rich": { "version": 1, "runs": [{ "length": 6 }, { "length": 5, "style": { "fontWeight": 700 } }] }
```

Run lengths are UTF-16 units and must sum to `text.length`. A run stores only
overrides of the layer base style: `fontFamily`, `fontSize`, `fontWeight`,
`italic`, `underline`, `strikethrough`, `color`, `tracking` (1/1000 em),
`baselineShift`, `script` (super/subscript), `caps` (all/small caps),
`scaleX`/`scaleY` (%), `leading` (× size) and `kerning`
(auto/metrics/none). A layer without `rich` is the legacy single run and
renders exactly as before.

Layer-wide paragraph settings live in `paragraph`: `justify`
(`none` or justified with last line `left`/`center`/`right`/`all`), indents
(left, right, first line), space before/after and lists
(`none`/`bullet`/`number`). Alignment stays in `textAlign`. Direction uses
`languageOptions.direction`; RTL paragraph text right-aligns lines but is
not a full Unicode bidi implementation. Other fields: `antiAlias`
(`none`/`sharp`/`crisp`/`strong`/`smooth`, an alpha transfer-curve
approximation of Photoshop's methods), and `fit` (bounded *dynamic text*:
`shrink` or `fit` scales type uniformly between 0.1× and 4× so paragraph text
fills its box).

The options bar (font family, style, size, anti-aliasing, alignment, colour,
Warp, Character/Paragraph panel toggles, ✓ and ✕) and the sidebar Character
and Paragraph panels edit the selection while editing, the whole active type
layer otherwise (base fields update and matching overrides are cleared), or
the defaults for new type. Type presets save character + paragraph settings
locally (`localStorage`, at most 40, never synced).

Find & Replace and the Layers panel text field rebase the runs so styles stay
attached to their characters (replacement text takes the style of the text it
replaces and is inserted literally). Update All Text Layers changes base
fields only; run overrides are kept.

## Fonts and glyphs

The engine takes a font family string. Before measuring or drawing it waits
(bounded to 1.5 s) for `document.fonts.load` of every family a layer uses,
clears its width cache and re-lays out when fonts finish loading. Run
families accept any safe family name (letters, digits, spaces, `_.,&()+-`, at
most 64 characters), so a font library can supply families; the layer-level
`fontFamily` keeps its allow-list. The **Glyphs…** button dispatches a
cancelable `pixelforge:open-glyph-picker` event (a glyph picker that handles
it calls `preventDefault()`); otherwise a small built-in special-character
palette is shown. Glyph pickers insert at the caret with
`window.pixelforgeType.insertTextAtCaret(text)` or
`window.dispatchEvent(new CustomEvent('pixelforge:insert-text', { detail: { text } }))`.

## Limits and validation

Text is at most 10,000 UTF-16 units and 2,000 runs. Draft/project validation
rejects unknown run keys, out-of-range values, a wrong rich version or a run
total that differs from the text length; malformed projects fail closed.
Layout uses a bounded glyph-width cache so editing a 2,000-character
paragraph stays responsive.

Warp, text on path and vertical type keep working: warp and vertical type
honour per-run fonts and colours; type on a path uses the base style.
Export flattens type into pixels (PNG/JPEG/WebP/PSD/PDF) as before; the
`.pixelforge` project keeps every field.

## Evidence

Pure tests: `tests/rich-text.test.mjs` (runs, validation, layout, wrapping,
justify, lists, caret model, fit, performance) and
`tests/text-session.test.mjs` (session typing/undo, styling, conversion,
find & replace, presets). Desktop and mobile Playwright:
`tests/browser/type-tool.spec.ts`.
