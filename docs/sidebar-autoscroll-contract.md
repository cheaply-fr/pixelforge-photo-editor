# Properties sidebar auto-scroll contract

When the user activates something whose controls live in the right-hand
properties sidebar (the `aside.inspector`), the sidebar brings **that exact
section** into view, expands it if it is collapsed, and briefly highlights it.
It never moves the canvas, never interrupts a stroke or drag, and never takes
focus away from where the user is working.

> **Contextual sidebar.** Since the contextual sidebar
> ([`contextual-sidebar-contract.md`](contextual-sidebar-contract.md)), the
> sidebar renders only the active tool's sections, Layers, a "More panels"
> strip and at most one open panel. A reveal whose target lives in a panel
> (Filters, Adjust selected layer, Layer styles, …) **opens that panel first**
> (and expands the phone sheet); the coordinator below then lands on the
> section once the panel has committed. Placement comes from
> `src/sidebarPanels.ts` (`sectionPlacement` / `panelForSection`). Because the
> sidebar is now short, many reveals end `visible` instead of `scrolled`.

## Architecture

| Layer | File | Responsibility |
| --- | --- | --- |
| Registry | `src/sidebarSections.ts` | Section ids and metadata; exhaustive maps tool → section, filter → section, layer style → section, command → section; collapsed-state persistence parsing. DOM- and React-free. |
| Arithmetic | `src/sidebarScrollMath.ts` | Pure scroll-target computation in container content coordinates: visibility band with sticky/scroll-padding insets, `start` / `nearest` alignment, clamping, tolerance, keep-visible control, easing, duration, external-scroll detection. |
| Coordinator | `src/sidebarAutoScroll.ts` | Framework-free state machine (pending → deferred → animating → settling → idle) behind injected ports: last-trigger-wins generations, bounded retries, expansion, deferral, interruption, reduced-motion branch, focus policy, announcements. |
| DOM adapter | `src/sidebarAutoScrollDom.ts` | Measures sections in `aside.inspector`, writes `scrollTo({behavior: 'instant'})`, tracks pointers / HTML drag / wheel / touch / scroll keys, renders the highlight attribute, the polite live region and the diagnostic attributes. |
| React glue | `src/useSidebarAutoScroll.ts`, `src/SidebarSection.tsx`, `app/page.tsx` | One coordinator per editor; a layout effect after every commit; collapsible section component; trigger wiring. |

### The registry is the single source of truth

* `TOOL_SECTIONS` is `satisfies Record<Tool, SidebarSectionId | null>`: adding a
  tool without deciding where its controls live fails `npm run typecheck`.
  A `null` entry means the tool has no inline sidebar controls (canvas overlay,
  status-bar controls) and **must** carry a reason in `TOOLS_WITHOUT_SECTION`
  (typed over exactly the `null` tools). Today: Hand, Fill, Slice, Slice
  Select and Frame. Zoom, Eyedropper, Color Sampler, Ruler, Note, Count, Crop
  and Perspective Crop reveal Tool options
  ([navigation tool options](./navigation-tool-options-contract.md)).
* The page renders the tool options area from `TOOL_SIDEBAR` in
  `src/sidebarPanels.ts`, whose first section per tool must equal
  `TOOL_SECTIONS[tool]` (checked by `tests/sidebar-panels.test.mjs`), so
  "which sections a tool shows" and "where a tool click reveals" cannot
  disagree. The pure suite pins the exact 35-tool Tool options set that
  existed before the registry.
* `FILTER_SECTIONS` is derived from `FILTER_EFFECT_TYPES`; every filter
  effect's controls render in *Filter effects*.
* `STYLE_SECTIONS` is `satisfies Record<keyof LayerStyles, SidebarSectionId>`;
  each style has its own block inside *Layer styles*.
* `COMMAND_SECTIONS` lists the menu commands whose purpose is to show inline
  controls (Levels, Curves, Hue/Saturation, Color Balance, Sharpen/Noise →
  *Adjust selected layer*; Layer Style → *Layer styles*; Rename Layer →
  *Layer properties*; Find Layers → *Layers*). `app/page.tsx` constrains the
  keys to its `Command` union at compile time.
* Every registered section is anchored exactly once by
  `data-sidebar-section="<id>"` (directly, or through `<SidebarSection id>`),
  checked statically by `tests/sidebar-sections.test.mjs` and in the browser.

## Triggers (audited)

Only user activations reveal. Programmatic paths — draft restore, action
playback, presets applied from inside a section, *Add paint layer*, Quick
Mask's internal tool switch — run without a trigger and never scroll.

| Trigger | Source / origin | Target | Alignment |
| --- | --- | --- | --- |
| Toolbar tool click (pointer or keyboard activation) | `toolbar` | `TOOL_SECTIONS[tool]` | start |
| Tool flyout pick (pointer, touch hold, keyboard) | `flyout` | `TOOL_SECTIONS[tool]` | start |
| Tool shortcuts: custom bindings, family keys (B, M, L, …), R / Shift+R, aliases | `shortcut` / keyboard | `TOOL_SECTIONS[tool]` | start |
| Menu tool commands (Crop, Perspective Crop, Slice, Slice Select, Frame, Patch, Mixer / History / Art History Brush, Text, OpenType) | `menu` | `TOOL_SECTIONS[tool]` | start |
| Filter menu, Filter Gallery, Last Filter, Clear filter, custom filter shortcuts | `menu` / `dialog` / `shortcut` | *Filter effects* | start |
| Quick filter commands (Filter → Vivid, Mono, …) | `menu` | *Quick filters* | start |
| Adjustment commands (Levels, Curves, Hue/Saturation, Color Balance, Sharpen/Noise) incl. the Adjustments dialog | `menu` / `dialog` | *Adjust selected layer* | start |
| Layer → Layer Style | `menu` | *Layer styles*, keeping the focused *Enable outline* visible | start + keep |
| Layer → Rename Layer, Select → Find Layers | `menu` | *Layer properties* / *Layers*, keeping the focused field visible | start + keep |
| Quick Mask toggle (toolbar button, Q, menu) when entering | `toolbar` / `shortcut` / `menu` | *Quick Mask options* | start |
| Plain layer-row click (no Ctrl/Cmd/Shift) | `sidebar` | *Layer properties* | nearest |
| Enabling exactly one layer style checkbox | `sidebar` | that style's block | nearest |
| Command search | `command-search` | whatever the command targets | start |

A section-less tool (e.g. Hand) is still a trigger: it supersedes any reveal in
flight and leaves the sidebar where it is (outcome `no-section`). Ctrl/Cmd or
Shift layer clicks build a multi-selection and do not move the list.

## Behaviour

1. **Exact section.** `start` puts the section header at the top of the
   visible band: the on-screen part of the sidebar's scrollport, minus
   max(`scroll-padding-top`, height of `[data-sidebar-sticky]` elements that
   are `position: sticky|fixed`) at the top (and the bottom equivalents).
   When less than 64 px of the sidebar is on screen, its own box is the band.
   `nearest` (triggers from inside the sidebar) makes the smallest move that
   shows the section without pushing its header out of view, so the row or
   checkbox the user just clicked stays visible. Targets are clamped to
   `[0, scrollHeight − clientHeight]`; ≤ 1 px moves are skipped.
2. **Already visible ⇒ no move.** A section fully inside the visible band
   (±1 px) is not scrolled (outcome `visible`). A section taller than the
   sidebar is satisfied once its header is aligned (`aligned`).
3. **Collapsed ⇒ expand.** Collapsible sections (header disclosure button,
   `aria-expanded` / `aria-controls`) are expanded once, then measured after
   the expansion commits. Expansion is persisted like a manual toggle
   (`localStorage['pixelforge.sidebar-collapsed-sections']`, validated, per
   device, never synced).
4. **Highlight.** The landed section gets `data-sidebar-highlight="true"` for
   1.4 s: a fading accent ring with motion, a static ring under reduced
   motion. Only one section is highlighted at a time.
5. **Motion.** With motion allowed the coordinator animates `scrollTop` itself
   (ease-out cubic, 140–320 ms by distance, ≤ 90 frames), re-measuring the
   target every frame so layout shifts are tracked. With
   `prefers-reduced-motion: reduce` it writes the final offset once — inside
   the commit that rendered the section, before the next paint.
6. **Layout shifts.** The first attempt runs after React commits (layout
   effect) or in a microtask; if the section is not rendered or still
   collapsed, it retries on later commits/frames — at most 40 attempts and
   1.2 s, then gives up (`missing`). After landing, two settle frames correct
   a late shift at most twice, unless the user has scrolled.
7. **Last trigger wins.** Every request increments a generation; the active
   reveal is superseded (its highlight removed, its frames ignored).
8. **User scroll wins.** A wheel, touch start, pointer press or scroll key
   inside the sidebar, or any `scrollTop` change the animation did not write,
   stops the reveal immediately (`interrupted`) and nothing is written after.
9. **Never during a stroke or drag.** While any pointer button is pressed
   anywhere, or an HTML drag is active, the reveal is deferred (no polling)
   and runs when the interaction ends; it is dropped after 8 s (`expired`). A
   press that starts during an animation freezes the sidebar. Stale pointer
   state is cleared by button-less moves and window blur. (Existing editor
   rules additionally ignore tool shortcuts while a canvas gesture is active.)
10. **Focus.** The sidebar never takes focus from the canvas, a field, the
    toolbar (flyout picks return focus to the toolbar slot) or an active
    pointer interaction. Its only focus move is a *rescue*: when a
    keyboard-activated menu, command-search or dialog command closes and
    leaves focus on `<body>`, focus moves (without scrolling) to the revealed
    section's disclosure button, or to the section itself with
    `tabindex="-1"`. Commands that already focus a control (Layer Style,
    Rename Layer, Find Layers) focus it with `preventScroll` and ask the
    reveal to keep it visible.
11. **Announcement.** When the reveal scrolled or expanded something, the
    polite live region (`data-testid="sidebar-autoscroll-announcer"`) reads
    “<Section> section shown in the properties sidebar”. Already-visible
    reveals stay silent.
12. **Desktop and mobile.** On desktop the sidebar column is the scroll
    container. In the stacked mobile layout (≤ 680 px) the sidebar is a
    collapsible bottom sheet (sticky handle, marked `data-sidebar-sticky`) and a
    bounded scroll region (`max-height: 100svh`), so a reveal scrolls the
    sidebar internally and never moves the page or the canvas under the
    user's finger. Only the top of that region is on screen below the canvas,
    so "visible" means visible on screen, and a `60svh` tail spacer lets
    sections near the end still scroll their header into the on-screen band. A hidden sidebar (Full Screen mode) ends with `hidden`.
    Toolbar families, icons, flyouts and their keyboard behaviour are
    unchanged.

### Diagnostics

`aside.inspector` carries `data-autoscroll-phase` (`idle`, `pending`,
`deferred`, `animating`, `settling`), `data-autoscroll-section`,
`data-autoscroll-outcome` (`scrolled`, `visible`, `aligned`, `unscrollable`,
`missing`, `hidden`, `interrupted`, `superseded`, `cancelled`, `expired`,
`no-section`) and a monotonic `data-autoscroll-sequence`. Browser tests wait
on these instead of sleeping.

## Verification

* Pure (`npm test`): `tests/sidebar-sections.test.mjs` (exhaustive tool,
  filter, style and command coverage; anchors present exactly once; pinned
  Tool options set; persistence parsing), `tests/sidebar-scroll-math.test.mjs`
  (offsets, insets, clamping, tall sections, nearest, keep-visible, degenerate
  input, a 5 000-case seeded property test for clamping/idempotence/landing,
  duration and easing bounds, reduced-motion branch) and
  `tests/sidebar-autoscroll.test.mjs` (fake clock/frames/microtasks: commit
  timing, animation monotonicity and bounds, visible/no-scroll, late render,
  bounded give-up, hidden sidebar, collapse/expand, last-wins before and
  during animation, bursts, section-less cancellation, manual-scroll and
  intent interruption, deferral and expiry, stroke mid-animation, layout-shift
  tracking and bounded correction, focus truth table, nearest, keep-visible,
  sticky insets, dispose, diagnostics).
* Browser (`npm run test:e2e`, desktop and mobile projects):
  `tests/browser/sidebar-autoscroll.spec.ts` — every toolbar tool
  (parameterised, including flyout subtools; canvas and page scroll unchanged),
  keyboard flyout pick, keyboard shortcuts without focus change, Filter menu
  pick with highlight and announcement, keyboard menu focus rescue, Layer
  Style focus kept visible, layer-style enable (nearest), layer selection vs
  multi-selection, collapsed section + persistence, already-visible no-move,
  rapid clicks, section-less cancellation, animated path, reduced motion
  (instant, static highlight), manual-scroll and scrollbar interruption,
  deferral while a pointer is held, an undisturbed canvas stroke, sticky
  headers / scroll-padding, and disclosure semantics.
* The rest of the e2e suite runs with `reducedMotion: 'reduce'`
  (`playwright.config.ts`) so reveals are synchronous with the triggering
  click and never race geometry reads in older specs.

## Limits

* Highlight and announcement are cosmetic; the reveal does not change any
  document state, history or persistence other than the collapsed-section
  preference.
* Sections owned by `LayersPanel` (Layers, Align to canvas, Selection options,
  Layer properties, Layer details, Layer styles and the per-style blocks) are
  not collapsible. History, Reference image and My projects are registered,
  non-collapsible panel sections.
* Tool shortcuts are already ignored by the editor during a canvas gesture,
  so the deferral path is reached through other held pointers (sliders, layer
  drags, presses outside the canvas).
