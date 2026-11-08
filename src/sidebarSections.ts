/**
 * Properties-sidebar section registry: the single source of truth that maps
 * every tool, filter effect, layer style and section-targeting menu command
 * to the inline sidebar section that owns its controls.
 *
 * The maps are typed as exhaustive `Record`s over the editor's own unions
 * (`Tool`, `FilterEffectType`, `keyof LayerStyles`), so adding a tool, filter
 * or style without deciding where its controls live fails `npm run
 * typecheck`. Tools that intentionally have no inline sidebar controls are
 * mapped to `null` *and* must carry a documented reason in
 * `TOOLS_WITHOUT_SECTION`; the unit suite fails when the two disagree.
 *
 * The module is DOM-free and React-free so it can be exhaustively tested in
 * Node. See docs/sidebar-autoscroll-contract.md.
 */
import type { Tool } from './drafts.ts';
import { FILTER_EFFECT_TYPES, type FilterEffectType } from './filterEffects.ts';
import type { LayerStyles } from './layerStyles.ts';

/** Where a section's markup is rendered; used by docs and DOM tests. */
export type SidebarSectionOwner = 'page' | 'layers-panel';

export type SidebarSectionSpec = {
  /** Human label used for the polite screen-reader announcement. */
  readonly label: string;
  readonly owner: SidebarSectionOwner;
  /** True when the section header is a disclosure button that can collapse it. */
  readonly collapsible: boolean;
  /** Enclosing registered section, when this is a nested sub-block. */
  readonly parent?: SidebarSectionId;
  /** True when the section only renders for some editor states (tool, mode). */
  readonly conditional: boolean;
};

export const SIDEBAR_SECTION_IDS = [
  'layers',
  'layer-alignment',
  'selection-options',
  'layer-properties',
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
  'saved-selections',
  'quick-mask',
  'adjustments',
  'rotate-view',
  'transform',
  'tool-options',
  'text',
  'quick-filters',
  'filter-effects',
] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];

export const SIDEBAR_SECTIONS: Readonly<Record<SidebarSectionId, SidebarSectionSpec>> = {
  layers: { label: 'Layers', owner: 'layers-panel', collapsible: false, conditional: false },
  'layer-alignment': { label: 'Align to canvas', owner: 'layers-panel', collapsible: false, parent: 'layers', conditional: false },
  'selection-options': { label: 'Selection options', owner: 'layers-panel', collapsible: false, parent: 'layers', conditional: false },
  'layer-properties': { label: 'Layer properties', owner: 'layers-panel', collapsible: false, parent: 'layers', conditional: false },
  'layer-styles': { label: 'Layer styles', owner: 'layers-panel', collapsible: false, parent: 'layers', conditional: false },
  'layer-style-drop-shadow': { label: 'Drop shadow', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-outer-glow': { label: 'Outer glow', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-inner-shadow': { label: 'Inner shadow', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-inner-glow': { label: 'Inner glow', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-bevel-emboss': { label: 'Bevel emboss', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-outline': { label: 'Outline', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-color-overlay': { label: 'Color overlay', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-gradient-overlay': { label: 'Gradient overlay', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'layer-style-pattern-overlay': { label: 'Pattern overlay', owner: 'layers-panel', collapsible: false, parent: 'layer-styles', conditional: false },
  'saved-selections': { label: 'Saved selections', owner: 'page', collapsible: true, conditional: false },
  // Not collapsible: its header title ("Quick Mask mode") would duplicate the
  // toolbar's exact "Quick Mask mode" button name.
  'quick-mask': { label: 'Quick Mask options', owner: 'page', collapsible: false, conditional: true },
  adjustments: { label: 'Adjust selected layer', owner: 'page', collapsible: true, conditional: false },
  'rotate-view': { label: 'Rotate View', owner: 'page', collapsible: true, conditional: true },
  transform: { label: 'Transform', owner: 'page', collapsible: true, conditional: false },
  'tool-options': { label: 'Tool options', owner: 'page', collapsible: true, conditional: true },
  text: { label: 'Text', owner: 'page', collapsible: true, conditional: true },
  'quick-filters': { label: 'Quick filters', owner: 'page', collapsible: true, conditional: false },
  'filter-effects': { label: 'Filter effects', owner: 'page', collapsible: true, conditional: false },
};

/**
 * Tool → section. `null` means the tool has no inline sidebar controls (its
 * interaction is on the canvas or in the status bar) and a click on it must
 * not move the sidebar; each such tool must be justified below.
 *
 * The page renders the Tool options / Text / Rotate View sections from this
 * same map, so "which tools show Tool options" and "where a tool click
 * scrolls" can never disagree.
 */
export const TOOL_SECTIONS = {
  move: 'layer-alignment',
  hand: null,
  zoom: null,
  'rotate-view': 'rotate-view',
  eyedropper: null,
  'color-sampler': null,
  ruler: null,
  note: null,
  count: null,
  fill: null,
  gradient: 'tool-options',
  clone: 'tool-options',
  heal: 'tool-options',
  'spot-heal': 'tool-options',
  patch: 'tool-options',
  'red-eye': 'tool-options',
  'pattern-stamp': 'tool-options',
  crop: null,
  'perspective-crop': null,
  slice: null,
  'slice-select': null,
  frame: null,
  brush: 'tool-options',
  'mixer-brush': 'tool-options',
  'history-brush': 'tool-options',
  'art-history-brush': 'tool-options',
  pencil: 'tool-options',
  'color-replace': 'tool-options',
  eraser: 'tool-options',
  'background-eraser': 'tool-options',
  'magic-eraser': 'tool-options',
  'mask-brush': 'tool-options',
  'mask-eraser': 'tool-options',
  'adjustment-brush': 'tool-options',
  dodge: 'tool-options',
  burn: 'tool-options',
  sponge: 'tool-options',
  smudge: 'tool-options',
  blur: 'tool-options',
  sharpen: 'tool-options',
  text: 'text',
  pen: 'tool-options',
  'freeform-pen': 'tool-options',
  'curvature-pen': 'tool-options',
  'direct-select': 'tool-options',
  rectangle: 'tool-options',
  'rounded-rectangle': 'tool-options',
  'custom-shape': 'tool-options',
  ellipse: 'tool-options',
  line: 'tool-options',
  polygon: 'tool-options',
  select: 'selection-options',
  'ellipse-select': 'selection-options',
  'row-select': 'selection-options',
  'column-select': 'selection-options',
  lasso: 'selection-options',
  'polygonal-lasso': 'selection-options',
  'magnetic-lasso': 'selection-options',
  'selection-brush': 'tool-options',
  'quick-selection': 'tool-options',
  'magic-wand': 'selection-options',
} as const satisfies Record<Tool, SidebarSectionId | null>;

/** Tools whose registry entry is `null`. */
export type ToolWithoutSection = {
  [K in Tool]: (typeof TOOL_SECTIONS)[K] extends null ? K : never;
}[Tool];

/** Why each section-less tool leaves the sidebar where it is. */
export const TOOLS_WITHOUT_SECTION: Readonly<Record<ToolWithoutSection, string>> = {
  hand: 'Pans the canvas viewport; it has no inline options.',
  zoom: 'Zoom controls live in the canvas status bar, not the sidebar.',
  eyedropper: 'Samples into the toolbar colour swatches; no inline options.',
  'color-sampler': 'Sample readouts are drawn on the canvas overlay.',
  ruler: 'Measurements are drawn on the canvas overlay.',
  note: 'Notes are placed and edited on the canvas overlay.',
  count: 'Count markers are placed on the canvas overlay.',
  fill: 'Uses the toolbar foreground colour; no inline options.',
  crop: 'Crop is staged and committed with on-canvas controls.',
  'perspective-crop': 'Perspective crop is staged with on-canvas controls.',
  slice: 'Slices are drawn and committed with on-canvas controls.',
  'slice-select': 'Saved slices are selected and edited on the canvas.',
  frame: 'Artboard frames are drawn with on-canvas controls.',
};

/** Every filter effect renders its controls inside the Filter effects section. */
export const FILTER_SECTIONS: Readonly<Record<FilterEffectType, SidebarSectionId>> =
  Object.freeze(
    Object.fromEntries(FILTER_EFFECT_TYPES.map((type) => [type, 'filter-effects'])),
  ) as Readonly<Record<FilterEffectType, SidebarSectionId>>;

export type LayerStyleId = keyof LayerStyles;

/** Layer style → its own block inside the Layer styles fieldset. */
export const STYLE_SECTIONS = {
  dropShadow: 'layer-style-drop-shadow',
  outerGlow: 'layer-style-outer-glow',
  innerShadow: 'layer-style-inner-shadow',
  innerGlow: 'layer-style-inner-glow',
  bevelEmboss: 'layer-style-bevel-emboss',
  outline: 'layer-style-outline',
  colorOverlay: 'layer-style-color-overlay',
  gradientOverlay: 'layer-style-gradient-overlay',
  patternOverlay: 'layer-style-pattern-overlay',
} as const satisfies Record<LayerStyleId, SidebarSectionId>;

export const LAYER_STYLE_IDS = Object.keys(STYLE_SECTIONS) as LayerStyleId[];

/**
 * Menu / command-search commands whose purpose is to show inline sidebar
 * controls (other than tool and filter commands, which resolve through the
 * tool and filter maps). The page type-checks these keys against its
 * `Command` union.
 */
export const COMMAND_SECTIONS = {
  levels: 'adjustments',
  'hue-saturation': 'adjustments',
  curves: 'adjustments',
  'color-balance': 'adjustments',
  'sharpen-noise': 'adjustments',
  'layer-style': 'layer-styles',
  'rename-layer': 'layer-properties',
  'find-layers': 'layers',
} as const satisfies Record<string, SidebarSectionId>;

export type SidebarCommandId = keyof typeof COMMAND_SECTIONS;

/** Section that a plain (non-additive) layer selection reveals. */
export const LAYER_SELECTION_SECTION: SidebarSectionId = 'layer-properties';

/** Section shown when Quick Mask mode is entered. */
export const QUICK_MASK_SECTION: SidebarSectionId = 'quick-mask';

/** Section for the Quick filters presets (Filter → Vivid, Mono, …). */
export const QUICK_FILTER_SECTION: SidebarSectionId = 'quick-filters';

export function sectionForTool(tool: Tool): SidebarSectionId | null {
  return (TOOL_SECTIONS as Record<Tool, SidebarSectionId | null>)[tool] ?? null;
}

export function sectionForFilter(type: FilterEffectType): SidebarSectionId {
  return FILTER_SECTIONS[type];
}

export function sectionForStyle(style: LayerStyleId): SidebarSectionId {
  return STYLE_SECTIONS[style];
}

export function sectionForCommand(command: string): SidebarSectionId | null {
  return Object.prototype.hasOwnProperty.call(COMMAND_SECTIONS, command)
    ? COMMAND_SECTIONS[command as SidebarCommandId]
    : null;
}

export function isSidebarSectionId(value: unknown): value is SidebarSectionId {
  return typeof value === 'string' && (SIDEBAR_SECTION_IDS as readonly string[]).includes(value);
}

/** Tools that render the shared "Tool options" section. */
export function toolShowsSection(tool: Tool, section: SidebarSectionId): boolean {
  return sectionForTool(tool) === section;
}

/** The DOM attribute that marks a registered section's root element. */
export const SECTION_ATTRIBUTE = 'data-sidebar-section';

export function sectionSelector(section: SidebarSectionId): string {
  return `[${SECTION_ATTRIBUTE}="${section}"]`;
}

/** Collapsed-section persistence (per device, never synced to the cloud). */
export const COLLAPSED_SECTIONS_STORAGE_KEY = 'pixelforge.sidebar-collapsed-sections';

export function parseCollapsedSections(raw: string | null | undefined): SidebarSectionId[] {
  if (!raw || raw.length > 4096) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SidebarSectionId[] = [];
  for (const value of parsed)
    if (isSidebarSectionId(value) && SIDEBAR_SECTIONS[value].collapsible && !out.includes(value))
      out.push(value);
  return out;
}

export function serializeCollapsedSections(sections: Iterable<SidebarSectionId>): string {
  const out: SidebarSectionId[] = [];
  for (const id of sections)
    if (isSidebarSectionId(id) && SIDEBAR_SECTIONS[id].collapsible && !out.includes(id)) out.push(id);
  out.sort((a, b) => SIDEBAR_SECTION_IDS.indexOf(a) - SIDEBAR_SECTION_IDS.indexOf(b));
  return JSON.stringify(out);
}
