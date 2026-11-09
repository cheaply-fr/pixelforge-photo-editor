# Contextual properties sidebar contract

The right-hand properties sidebar (`aside.inspector`) shows the settings that
belong to the **selected tool**, plus a small fixed set of always-relevant
controls. Every other tool's or feature's settings are not rendered (hidden,
not merely collapsed). Large, rarely used panels are one click away in a
compact "More panels" strip, and at most one of them is open at a time. The
goal is a short sidebar instead of one long scroll.

## Layout

Top to bottom:

1. **Quick Mask options** — only while Quick Mask mode is active.
2. **Tool options area** — `<section data-testid="tool-options-area"
   aria-label="<Tool> tool options" tabindex="-1">`. It renders exactly the
   sections the active tool registers, in table order. A tool with no inline
   options shows a one-line hint (`data-testid="tool-options-empty"`).
3. **Layers** — the layer list (with #237's drag-and-drop, per-row trash and
   ⋯ / right-click menu) and, **directly under the list, a Photoshop-style
   footer** (`role="toolbar"` "Layer actions", `data-testid="layer-footer"`)
   of icon buttons with accessible names and tooltips: Add paint layer, Add
   adjustment layer, Group active layer (new folder), Mask from selection,
   Create clipping mask, Release clipping mask, Raise layer, Lower layer,
   Duplicate layer and Delete layer (trash). These actions appear nowhere
   else in the sidebar. One row on desktop; on phones every button is at
   least 32 × 36 px and the row wraps rather than overflowing at 375 px.
   Below it: layer selection, Find layers, visibility and lock, the remaining
   mask / vector-mask actions, name, opacity, fill colour, blend mode and the
   selected text/shape/line/path layer's own properties. Secondary actions are
   compact wrapping chips.
4. **More panels** strip — a `<fieldset>` named "More panels" with one
   disclosure button per panel (`aria-expanded`, `aria-controls`, accessible
   name "<Panel> panel", visible short label and icon, tooltip).
5. **Open panel** — `<div id="sidebar-open-panel"
   data-sidebar-open-panel="<id>">`, at most one. It is not a landmark of its
   own: the sections inside keep their existing region names (*Adjust selected
   layer*, *Filter effects*, *History*, *Reference image*, …), so names stay
   unique.

| Panel (strip label) | Contents (registered sections) |
| --- | --- |
| Layer details (Details) | position X/Y, arrange (Bring to front/forward, Send backward/to back), Layer folder — `layer-details` |
| Adjust selected layer (Adjust) | `adjustments` |
| Filters | `quick-filters`, `filter-effects` (incl. filter stack) |
| Layer styles (Styles) | `layer-styles` and its nine style blocks |
| History | `history` |
| Saved selections (Selections) | `saved-selections` |
| Transform | `transform` (rotate / flip document) |
| Reference image (Reference) | `reference` |
| My projects (Projects) | `cloud-projects` (optional sign-in / cloud save; explicit action only) |

## The registry is the single source of truth

`src/sidebarPanels.ts` (DOM- and React-free):

* `TOOL_SIDEBAR` is `satisfies Record<Tool, ToolSidebarSpec>`: every tool
  declares its tool-area sections (subset of `TOOL_AREA_SECTIONS`:
  `tool-options`, `text`, `rotate-view`, `layer-alignment`,
  `selection-options`) and an optional default panel. Adding a tool without
  an entry fails `npm run typecheck`. The first section equals
  `TOOL_SECTIONS[tool]` from `src/sidebarSections.ts` (the #224 reveal
  target); the unit suite checks this.
  * Paint, retouch, shape and pen tools → Tool options.
  * Move → Align to canvas (+ distribute). Text → Text. Rotate View → Rotate
    View.
  * Marquee and lasso → Selection options (mode, options-bar Feather for new
    selections, marquee Style, current-selection feather, invert/clear
    selection). Selection Brush, Quick Selection and Magic Wand → Tool
    options + Selection options.
  * Fill → Tool options (Tolerance, Contiguous, Sample All Layers; see
    `docs/color-region-contract.md`).
  * Hand, Zoom, measurement tools, Crop / Perspective Crop, Slice /
    Slice Select and Frame → none (their controls are on the canvas, status
    bar or toolbar).
  * History Brush and Art History Brush open History by default.
* `toolSidebar(tool)` falls back to `DEFAULT_TOOL_SIDEBAR` (no sections, no
  panel) for unknown values such as a stale persisted tool.
* `SIDEBAR_PANELS` lists the panels and their sections; `FIXED_SECTIONS` the
  always-visible ones. Every id in `SIDEBAR_SECTION_IDS` has exactly one
  placement (`sectionPlacement`), so any reveal can resolve what to open.
* The page renders the tool area by mapping `toolSidebar(tool).sections`, and
  renders each panel body from `openSidebarPanel`. `LayersPanel` renders one
  slice per instance (`part`: `layers`, `alignment`, `selection`, `details`,
  `styles`).

The tool area renders `toolAreaSectionsFor(tool, { textLayerSelected })`:
the tool's own sections plus the *Text* section (Type / Character /
Paragraph panels, #244) whenever the selected layer is a text layer, with any
tool, so `revealTextSectionFor` still scrolls to it. *Tool presets* (#233)
render at the top of the tool area for tools that support presets.

New tools or tool features slot in by adding/adjusting their `TOOL_SIDEBAR`
entry and rendering their controls inside the matching section.

## Open panel persistence

The panel the user last chose (strip click or a reveal) stays open when
switching to a tool that has no choice of its own; a tool's remembered
choice — including an explicit close — or its default panel wins
(`openPanelForTool(state, tool, carried)`). The choice is remembered **per
tool, per device** in
`localStorage['pixelforge.sidebar-open-panels']` as a JSON object `tool →
panel id | null` (`null` = the user closed every panel for that tool). Reads
and writes are wrapped in `try/catch`; malformed, oversized (> 8 KiB) or
unknown entries are dropped (`parseOpenPanels`), and the tool's default
applies. Nothing is synced to the cloud.

## Reveals (#224) open panels

Every user-triggered reveal (`revealSidebarSection` in `app/page.tsx`) first
opens the panel that owns the target section (and expands the phone sheet),
then hands the reveal to the existing auto-scroll coordinator, which retries
until the panel has committed and then scrolls/highlights/announces exactly as
described in [`sidebar-autoscroll-contract.md`](sidebar-autoscroll-contract.md).
Examples: Filter menu / Filter Gallery / Last Filter → Filters; Levels, Curves,
Hue/Saturation, Color Balance, Sharpen/Noise → Adjust selected layer; Layer →
Layer Style → Layer styles (the panel is committed synchronously so *Enable
outline* can be focused); enabling a style checkbox → its block. Tool clicks
target the tool area, which is always rendered for the active tool.
Opening a panel through a reveal is remembered for the active tool like a
strip click. Adding an adjustment layer (Layers panel button or Layer → New
Adjustment Layer) opens *Adjust selected layer*, where its controls live. Programmatic paths (draft restore, action playback) never open
panels.

## Keyboard and accessibility

* `F6` or `Cmd/Ctrl+.` moves focus to the first enabled control in the tool
  options area, or to the labelled area itself when the tool has no controls
  (ignored during a canvas gesture). A polite notice confirms the move.
* Tab order follows the visual order: tool options, Layers, the strip, the
  open panel.
* The tool area, Layers, the strip and every section inside the open panel
  have accessible names; strip buttons are disclosures whose visible label is part of their
  accessible name.
* Reduced motion: unchanged from the auto-scroll contract (instant reveal,
  static highlight); opening a panel itself is not animated.

## Phones (≤ 680 px)

The sidebar is a bottom **sheet** below the canvas: a sticky handle button
("Properties", with the active tool name, `aria-expanded`, `aria-controls`)
collapses or expands the sheet body. It is expanded by default. Its content is
the same contextual content as desktop in one column; the sheet stays a
bounded scroll region (`max-height: 100svh`) so reveals never move the canvas.
A reveal that opens a panel (menu commands, Layer Style, Rename Layer, Find
Layers, F6) re-expands a collapsed sheet; tool clicks do not. There is no
horizontal overflow at 375 px (page and sidebar).

## Verification

* Pure (`npm test`): `tests/sidebar-panels.test.mjs` — exhaustive tool table,
  reveal-target consistency, canonical order, per-tool isolation (selection
  tools, retouch, Move, Text, Crop), unknown-tool fallback, single placement
  for every section, panel metadata, toggle semantics, per-tool memory and
  storage parsing/round trips; `tests/sidebar-sections.test.mjs` keeps the
  #224 registry checks.
* Browser (desktop + mobile): `tests/browser/contextual-sidebar.spec.ts` —
  Brush, Text, Gradient, Move, Crop, Select and Clone show only their own
  options (others' labels absent, large panels absent), a retouch and
  selection tool show only their sections, bounded sidebar at 1280×800 (three
  visible blocks, ≤ 4 sections, height bounds), strip opens one panel at a time,
  per-tool persistence across reload and corrupt storage, menu commands open
  panels, F6 / Ctrl+. focus, phone sheet collapse/expand without horizontal
  overflow at 375 px. Older specs open panels with `openPanel(page, '<Panel>')`
  from `tests/browser/sidebar-panels.ts`.

## Limits

* Brush-family tool options are still long (presets, dynamics, texture,
  symmetry…); they are the only tall block left and remain inside one
  collapsible *Tool options* section.
* The open panel is per tool once chosen: switching tools shows that tool's
  remembered panel (or none), otherwise the last chosen panel. The carried
  panel is session state and resets on reload.
