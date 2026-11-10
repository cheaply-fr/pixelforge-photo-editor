# Tool presets contract

Branch `feat/tool-presets`. A bounded, device-local take on tool presets in
the tool options area. It is not Photoshop's Tool Presets panel: there is no
cloud sync, no `.tpl` interchange and no preset for the Move, Hand, Zoom,
Crop, Slice, Frame, Eyedropper/measuring, Fill or Pen tools (they have no
stored options here).

## Behaviour

- Tools with options (Brush, Pencil, Eraser, Background/Magic Eraser, Color
  Replace, Mixer/History/Art History Brush, Smudge, Blur, Sharpen, Dodge, Burn,
  Sponge, Clone, Healing, Spot Healing, Patch, Pattern Stamp, Red Eye,
  Mask/Adjustment brushes, Gradient, Text, Shape/Ellipse/Line/Polygon, the
  marquee and lasso tools, Magic Wand, Selection Brush and Quick Selection)
  show a **Tool presets** disclosure button above their options. Its status
  line names the tool and the applied preset, and a **Modified** badge
  appears when the current options differ from that preset.
- The panel lists the current tool's presets; **All tools** shows every
  preset and **Search tool presets** filters by preset or tool name. Picking
  another tool's preset switches to that tool, then applies it.
- **Save preset** captures the current tool's options under a name (1–80
  characters). **Include colour** (foreground/background swatches; only for
  tools that use them) is off by default; **Include size** (brush size or
  Text font size) is on by default. Excluded values are neither stored nor
  changed on apply.
- The action bar acts on the selected (focused/clicked, else applied)
  preset: **Update preset from current options** (same tool only), **Rename**
  (inline), **Duplicate** (inserted after the original as “… copy”), **Move
  up/down**, and **Delete** (confirmation). Presets can also be reordered by
  drag and drop on desktop or with Alt+Up/Down; Up/Down/Home/End move focus
  through the list; Escape cancels a rename, then closes the panel and
  returns focus to the button. Touch targets are at least 44 px on phones.
- **Export** downloads `pixelforge-tool-presets.json`
  (`{ format: "pixelforge-tool-presets", version: 1, presets }`, settings
  only). **Import…** accepts that file (or a device-library envelope) up to
  512 KB; invalid presets are skipped and counted, presets whose id already
  exists get a new id (nothing on the device is overwritten), and presets
  over the limit are skipped.
- **Reset Tool** restores the current tool's options to their defaults;
  **Reset All Tools** restores every tool's options. Both ask for
  confirmation, keep saved presets and never change the swatch colours.
- Options are shared between related tools in PixelForge (Size, Hardness,
  Opacity, tip shape, pressure…), so applying or resetting one tool's preset
  also changes those shared values for its siblings. The panel says so.
- Applying, saving or resetting changes settings only: the document, its
  layers and its undo history are untouched, so there is nothing to undo.

## Storage and validation

Presets live in `localStorage` under `pixelforge.tool-presets.v1` as
`{ version: 1, presets: [...] }`, in list order. At most 100 presets and
256 KB are stored; unavailable, full or corrupt storage falls back to an
empty library, and a failed write is reported in the status bar without
blocking editing. Presets are not part of drafts or `.pixelforge` projects.

Each preset is `{ id, label, tool, includeColor, includeSize, settings }`.
`parseToolPreset` rejects the whole preset for unknown preset keys, unknown
tools, settings the tool does not use, colour/size values whose include flag
is off, and any out-of-range or malformed value (validators are reused from
the brush preset, brush dynamics, blend-mode, symmetry, gradient, pattern,
tonal, mixer/history and font modules). Text content is capped at 1,000
characters. Presets contain no pixels, credentials or remote references.

## Extending the table (for example new Smudge options)

`src/toolPresets.ts` is the single source of truth:

1. Add the key and type to `ToolSettingValues`.
2. Add a `TOOL_SETTING_FIELDS` entry with a label, category (`option`,
   `color` or `size`), the editor's initial value as `default`, and a strict
   `parse` returning `undefined` for invalid input.
3. Append the key to each tool's list in `TOOL_PRESET_FIELDS` (for example
   `smudge: [...BASIC, 'smudgeFingerPainting', 'smudgeSampleAllLayers', …]`).
4. Bind the getter and setter in `app/page.tsx` (`toolSettingValues` and
   `toolSettingSetters`); the mapped type makes a missing binding a type
   error.

Presets saved before an option existed omit it and apply its default.
Presets naming a key this build does not know are rejected rather than
partially applied.

## Evidence

- Pure: `tests/tool-presets.test.mjs` (round trip for every tool, defaults,
  include flags, legacy defaults, validation, modified detection, Reset Tool
  and Reset All Tools, rename/duplicate/update/delete, limits, reordering,
  filtering, storage envelope/size bound/failures, export/import and merge).
- Browser (desktop and mobile): `tests/browser/tool-presets.spec.ts` (Brush
  save → change → apply → Reset Tool with confirm, Reset All Tools with
  confirm, reload persistence and the all-tools view switching tools, search,
  rename/duplicate/move/update/delete, drag reordering on desktop,
  export/import with invalid files, keyboard use and mobile layout fit).
