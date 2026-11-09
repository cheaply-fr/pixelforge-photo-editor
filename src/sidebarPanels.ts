/**
 * Tool-contextual properties sidebar: which registered sections are shown for
 * the active tool, which sections are always shown, and which large, rarely
 * used sections live behind the "More panels" strip (one open at a time).
 *
 * Layout (top to bottom):
 *   1. Tool options area — only the sections the active tool registers in
 *      `TOOL_SIDEBAR` (a tool with none shows a one-line hint).
 *   2. Fixed area — Layers with the active layer's essentials (name, opacity,
 *      blend, visibility, lock, masks, order) and Quick Mask while active.
 *   3. "More panels" strip — one toggle per `SIDEBAR_PANELS` entry; at most
 *      one panel is open, remembered per tool in localStorage.
 *
 * Every section in `sidebarSections.ts` has exactly one placement here, so a
 * reveal (tool click, menu command, command search) can always resolve the
 * panel to open before scrolling. DOM- and React-free; see
 * docs/contextual-sidebar-contract.md.
 */
import type { Tool } from './drafts.ts';
import { TOOL_SECTIONS, type SidebarSectionId } from './sidebarSections.ts';

export const SIDEBAR_PANEL_IDS = [
  'layer-details',
  'adjustments',
  'filters',
  'layer-styles',
  'history',
  'saved-selections',
  'transform',
  'reference',
  'projects',
] as const;

export type SidebarPanelId = (typeof SIDEBAR_PANEL_IDS)[number];

export type SidebarPanelSpec = {
  /** Accessible name of the open panel region and its strip toggle. */
  readonly label: string;
  /** Visible text of the compact strip toggle. */
  readonly short: string;
  /** Registered sections rendered inside the panel, in order. */
  readonly sections: readonly SidebarSectionId[];
};

export const SIDEBAR_PANELS: Readonly<Record<SidebarPanelId, SidebarPanelSpec>> = {
  'layer-details': { label: 'Layer details', short: 'Details', sections: ['layer-details'] },
  adjustments: { label: 'Adjust selected layer', short: 'Adjust', sections: ['adjustments'] },
  filters: { label: 'Filters', short: 'Filters', sections: ['quick-filters', 'filter-effects'] },
  'layer-styles': {
    label: 'Layer styles',
    short: 'Styles',
    sections: [
      'layer-styles',
      'layer-style-drop-shadow',
      'layer-style-outer-glow',
      'layer-style-inner-shadow',
      'layer-style-inner-glow',
      'layer-style-bevel-emboss',
      'layer-style-outline',
      'layer-style-color-overlay',
      'layer-style-gradient-overlay',
      'layer-style-pattern-overlay',
    ],
  },
  history: { label: 'History', short: 'History', sections: ['history'] },
  'saved-selections': { label: 'Saved selections', short: 'Selections', sections: ['saved-selections'] },
  transform: { label: 'Transform', short: 'Transform', sections: ['transform'] },
  reference: { label: 'Reference image', short: 'Reference', sections: ['reference'] },
  projects: { label: 'My projects', short: 'Projects', sections: ['cloud-projects'] },
};

/** Sections rendered only in the tool options area, for tools that list them. */
export const TOOL_AREA_SECTIONS = [
  'tool-options',
  'text',
  'rotate-view',
  'layer-alignment',
  'selection-options',
] as const satisfies readonly SidebarSectionId[];

export type ToolAreaSectionId = (typeof TOOL_AREA_SECTIONS)[number];

/** Sections that are always on screen (Quick Mask only while it is active). */
export const FIXED_SECTIONS = ['layers', 'layer-properties', 'quick-mask'] as const satisfies readonly SidebarSectionId[];

export type ToolSidebarSpec = {
  /** Tool-area sections in display order; the first is the reveal target. */
  readonly sections: readonly ToolAreaSectionId[];
  /** Panel opened the first time the tool is used on this device. */
  readonly panel: SidebarPanelId | null;
};

const PAINT: ToolSidebarSpec = { sections: ['tool-options'], panel: null };
const SELECT: ToolSidebarSpec = { sections: ['selection-options'], panel: null };
const NONE: ToolSidebarSpec = { sections: [], panel: null };

/**
 * Tool → sidebar context. Exhaustive over `Tool`, so a new tool must decide
 * which sections it shows (and optionally a default panel) to typecheck.
 * The first section must equal `TOOL_SECTIONS[tool]` (the reveal target).
 */
export const TOOL_SIDEBAR = {
  move: { sections: ['layer-alignment'], panel: null },
  hand: NONE,
  zoom: NONE,
  'rotate-view': { sections: ['rotate-view'], panel: null },
  eyedropper: NONE,
  'color-sampler': NONE,
  ruler: NONE,
  note: NONE,
  'audio-note': PAINT,
  count: NONE,
  fill: NONE,
  gradient: PAINT,
  clone: PAINT,
  heal: PAINT,
  'spot-heal': PAINT,
  patch: PAINT,
  'red-eye': PAINT,
  'pattern-stamp': PAINT,
  crop: NONE,
  'perspective-crop': NONE,
  slice: NONE,
  'slice-select': NONE,
  frame: NONE,
  brush: PAINT,
  'mixer-brush': PAINT,
  'history-brush': { sections: ['tool-options'], panel: 'history' },
  'art-history-brush': { sections: ['tool-options'], panel: 'history' },
  pencil: PAINT,
  'color-replace': PAINT,
  eraser: PAINT,
  'background-eraser': PAINT,
  'magic-eraser': PAINT,
  'mask-brush': PAINT,
  'mask-eraser': PAINT,
  'adjustment-brush': PAINT,
  dodge: PAINT,
  burn: PAINT,
  sponge: PAINT,
  smudge: PAINT,
  blur: PAINT,
  sharpen: PAINT,
  text: { sections: ['text'], panel: null },
  'vertical-text': { sections: ['text'], panel: null },
  'text-mask': { sections: ['text'], panel: null },
  'vertical-text-mask': { sections: ['text'], panel: null },
  pen: PAINT,
  'freeform-pen': PAINT,
  'curvature-pen': PAINT,
  'direct-select': PAINT,
  'path-select': PAINT,
  'add-anchor': PAINT,
  'delete-anchor': PAINT,
  'convert-point': PAINT,
  rectangle: PAINT,
  'rounded-rectangle': PAINT,
  'custom-shape': PAINT,
  ellipse: PAINT,
  line: PAINT,
  polygon: PAINT,
  select: SELECT,
  'ellipse-select': SELECT,
  'row-select': SELECT,
  'column-select': SELECT,
  lasso: SELECT,
  'polygonal-lasso': SELECT,
  'magnetic-lasso': SELECT,
  'selection-brush': { sections: ['tool-options', 'selection-options'], panel: null },
  'quick-selection': { sections: ['tool-options', 'selection-options'], panel: null },
  'magic-wand': SELECT,
} as const satisfies Record<Tool, ToolSidebarSpec>;

/** Context for unknown tools (e.g. a stale draft value): no tool sections. */
export const DEFAULT_TOOL_SIDEBAR: ToolSidebarSpec = NONE;

export function toolSidebar(tool: string): ToolSidebarSpec {
  return Object.prototype.hasOwnProperty.call(TOOL_SIDEBAR, tool)
    ? (TOOL_SIDEBAR as Record<string, ToolSidebarSpec>)[tool]
    : DEFAULT_TOOL_SIDEBAR;
}

/** True when the active tool's options area renders `section`. */
export function toolAreaShows(tool: string, section: SidebarSectionId): boolean {
  return (toolSidebar(tool).sections as readonly SidebarSectionId[]).includes(section);
}

/**
 * Sections the tool options area renders: the tool's own sections, plus the
 * Text section (Type / Character / Paragraph panels, #244) whenever the
 * selected layer is a text layer, whatever the tool.
 */
export function toolAreaSectionsFor(
  tool: string,
  context: { textLayerSelected?: boolean } = {},
): readonly ToolAreaSectionId[] {
  const sections = toolSidebar(tool).sections;
  return context.textLayerSelected && !sections.includes('text') ? [...sections, 'text'] : sections;
}

export function isSidebarPanelId(value: unknown): value is SidebarPanelId {
  return typeof value === 'string' && (SIDEBAR_PANEL_IDS as readonly string[]).includes(value);
}

/** Where a registered section is rendered. */
export type SectionPlacement =
  | { readonly area: 'tool' }
  | { readonly area: 'fixed' }
  | { readonly area: 'panel'; readonly panel: SidebarPanelId };

const PANEL_BY_SECTION = new Map<SidebarSectionId, SidebarPanelId>(
  SIDEBAR_PANEL_IDS.flatMap((panel) => SIDEBAR_PANELS[panel].sections.map((section) => [section, panel] as const)),
);

export function sectionPlacement(section: SidebarSectionId): SectionPlacement {
  const panel = PANEL_BY_SECTION.get(section);
  if (panel) return { area: 'panel', panel };
  if ((TOOL_AREA_SECTIONS as readonly SidebarSectionId[]).includes(section)) return { area: 'tool' };
  return { area: 'fixed' };
}

/** Panel that must be open for `section` to render, or null. */
export function panelForSection(section: SidebarSectionId): SidebarPanelId | null {
  return PANEL_BY_SECTION.get(section) ?? null;
}

// ---------------------------------------------------------------------------
// Per-tool open panel persistence (per device, never synced to the cloud).

export const OPEN_PANELS_STORAGE_KEY = 'pixelforge.sidebar-open-panels';

/** Tool → last open panel; `null` records "the user closed every panel". */
export type OpenPanels = Readonly<Partial<Record<Tool, SidebarPanelId | null>>>;

const KNOWN_TOOLS = new Set<string>(Object.keys(TOOL_SECTIONS));

export function parseOpenPanels(raw: string | null | undefined): OpenPanels {
  if (!raw || raw.length > 8192) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Partial<Record<Tool, SidebarPanelId | null>> = {};
  for (const [tool, panel] of Object.entries(parsed as Record<string, unknown>))
    if (KNOWN_TOOLS.has(tool) && (panel === null || isSidebarPanelId(panel)))
      out[tool as Tool] = panel;
  return out;
}

export function serializeOpenPanels(state: OpenPanels): string {
  const out: Record<string, SidebarPanelId | null> = {};
  for (const tool of Object.keys(state).sort()) {
    const panel = state[tool as Tool];
    if (KNOWN_TOOLS.has(tool) && (panel === null || isSidebarPanelId(panel))) out[tool] = panel;
  }
  return JSON.stringify(out);
}

/**
 * The panel shown for `tool`: the choice remembered for that tool, else the
 * tool's default panel, else `carried` — the panel the user last chose (with
 * any tool), so an open panel follows tool switches until a tool has its own
 * remembered choice.
 */
export function openPanelForTool(
  state: OpenPanels,
  tool: string,
  carried: SidebarPanelId | null = null,
): SidebarPanelId | null {
  if (KNOWN_TOOLS.has(tool) && Object.prototype.hasOwnProperty.call(state, tool)) {
    const remembered = state[tool as Tool];
    if (remembered === null || isSidebarPanelId(remembered)) return remembered;
  }
  return toolSidebar(tool).panel ?? (isSidebarPanelId(carried) ? carried : null);
}

/** Record `panel` (or null for none) as the open panel for `tool`. */
export function withOpenPanel(state: OpenPanels, tool: string, panel: SidebarPanelId | null): OpenPanels {
  if (!KNOWN_TOOLS.has(tool)) return state;
  if (Object.prototype.hasOwnProperty.call(state, tool) && state[tool as Tool] === panel) return state;
  return { ...state, [tool]: panel };
}

/** Toggle from the strip: opening `panel`, or closing it when already open. */
export function togglePanel(current: SidebarPanelId | null, panel: SidebarPanelId): SidebarPanelId | null {
  return current === panel ? null : panel;
}
