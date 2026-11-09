# Type tools contract

PixelForge's toolbar exposes Photoshop's `T` family as four real tools that
share one compact Draw & Type slot:

| Tool id | Label | Icon (Lucide) | Click result |
| --- | --- | --- | --- |
| `text` | Text (flyout: Horizontal Type) | `Type` | Editable horizontal text layer |
| `vertical-text` | Vertical Type | `ArrowDownAZ` | Editable text layer with `orientation: 'vertical'` |
| `text-mask` | Horizontal Type Mask | `SquareDashedText` | Horizontal glyph selection, no layer |
| `vertical-text-mask` | Vertical Type Mask | `TypeOutline` | Vertical glyph selection, no layer |

The family is defined once as `TYPE_TOOLS` in `src/toolPalette.ts` and used for
the `t` keyboard family, the `type` flyout and the editor's repeated-key group.
`T` cycles Horizontal Type → Vertical Type → Horizontal Type Mask → Vertical
Type Mask and wraps; `Shift+T` cycles backwards. The slot shows a subtool arrow,
press-and-hold/right-click/Arrow-key flyout with one icon per variant, and the
chosen variant replaces the representative and is remembered across reload
like other flyouts. All four tools open the Text settings section, persist as
the draft's selected tool, and use the Text content, font and size settings.

## Vertical Type

A click creates the same editable text layer as the Text tool (content, font,
size, colour, bold, box width and transform at the click point) with
`orientation: 'vertical'`. Glyph layout follows
[`vertical-type-contract.md`](./vertical-type-contract.md): one code point per
row, newlines start a new column. The layer stays editable and can be switched
back to horizontal flow from the Type menu or Layers panel; undo removes it.

## Horizontal and Vertical Type Mask

A click opens a temporary, accessible text entry ("Horizontal Type Mask" /
"Vertical Type Mask" dialog, prefilled from Text content). Commit with
**Create selection** or `Ctrl/Cmd+Enter`; plain Enter adds a line. Committing
renders a temporary text layer, built exactly as the Text tool would at the
click point, through the existing Type Mask pipeline in
[`text-mask-contract.md`](./text-mask-contract.md): the glyph alpha becomes a
full-canvas `Selection.mask`, composed with the current Replace, Add, Subtract
or Intersect selection mode as one undoable history step. No text layer is
created and no source pixels change. **Cancel**, `Escape` or dismissing the
dialog leaves the document, selection and history untouched. Blank text and
text over 10,000 characters are rejected before any canvas is allocated
(`typeMaskEntryText` in `src/textMask.ts`).

## Bounds and limits

This is a bounded local Canvas 2D approximation. Unlike Photoshop, mask entry
happens in a dialog rather than live on canvas, there is no red quick-mask
overlay while typing, and the text cannot be moved or restyled before commit;
use the Text tool and Type → Horizontal/Vertical Type Mask when the mask text
needs positioning first. Vertical layout is a deterministic one-glyph-per-row
column without OpenType vertical shaping or punctuation alternates. Drag-to-
create paragraph boxes are not implemented for any type tool; a click places
point text.

## Evidence

Pure tests (`tests/type-tools.test.mjs`) cover family membership, flyout and
category slots, forward/reverse cycling, tool modes, remembered choices, icon
uniqueness, sidebar sections, entry validation and draft persistence; the
existing palette, icon and sidebar suites cover taxonomy completeness. Desktop
and mobile browser acceptance (`tests/browser/type-tools.spec.ts`) covers the
flyout, icons, `T`/`Shift+T` cycling and reload memory; vertical layers that
render taller than wide with undo; mask selections whose bounds match the Text
tool's glyphs at the same point, no added layers, undo, Subtract composition,
blank-text rejection and Cancel/Escape leaving the selection unchanged.
