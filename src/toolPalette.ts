/**
 * Shared palette taxonomy and Photoshop-style tool-family navigation.
 *
 * The editor keeps every implemented tool reachable in the compact palette,
 * while these definitions provide stable category labels and subtool groups
 * for the press-and-hold flyouts.  Keeping the model DOM-independent makes
 * keyboard cycling and category coverage easy to test without a browser.
 */

export type PaletteToolId =
  | 'move' | 'hand' | 'zoom' | 'rotate-view' | 'eyedropper' | 'color-sampler' | 'ruler' | 'note' | 'count'
  | 'fill' | 'gradient' | 'clone' | 'heal' | 'spot-heal' | 'patch' | 'red-eye' | 'pattern-stamp' | 'mixer-brush' | 'history-brush' | 'art-history-brush'
  | 'crop' | 'perspective-crop' | 'slice' | 'slice-select' | 'frame' | 'brush' | 'pencil' | 'color-replace' | 'eraser'
  | 'background-eraser' | 'magic-eraser' | 'dodge' | 'burn' | 'sponge' | 'smudge' | 'pen'
  | 'mask-brush' | 'mask-eraser' | 'adjustment-brush'
  | 'direct-select' | 'text' | 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'freeform-pen' | 'curvature-pen' | 'select'
  | 'ellipse-select' | 'row-select' | 'column-select' | 'lasso' | 'polygonal-lasso'
  | 'magnetic-lasso' | 'selection-brush' | 'quick-selection' | 'magic-wand';

export type ToolCategory = {
  id: string;
  label: string;
  tools: readonly PaletteToolId[];
};

export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  { id: 'navigation', label: 'Navigate', tools: ['move', 'hand', 'zoom', 'rotate-view'] },
  { id: 'measure', label: 'Measure', tools: ['eyedropper', 'color-sampler', 'ruler', 'note', 'count'] },
  { id: 'marquee', label: 'Marquee', tools: ['select', 'ellipse-select', 'row-select', 'column-select'] },
  { id: 'lasso', label: 'Lasso', tools: ['lasso', 'polygonal-lasso', 'magnetic-lasso'] },
  { id: 'selection', label: 'Selection', tools: ['selection-brush', 'quick-selection', 'magic-wand'] },
  { id: 'crop', label: 'Crop & Slice', tools: ['crop', 'perspective-crop', 'slice', 'slice-select', 'frame'] },
  { id: 'retouch', label: 'Retouch', tools: ['clone', 'pattern-stamp', 'heal', 'spot-heal', 'patch', 'red-eye', 'smudge', 'dodge', 'burn', 'sponge', 'history-brush', 'art-history-brush'] },
  { id: 'paint', label: 'Paint & Fill', tools: ['brush', 'pencil', 'color-replace', 'mixer-brush', 'gradient', 'fill', 'eraser', 'background-eraser', 'magic-eraser'] },
  { id: 'mask', label: 'Mask Refinement', tools: ['mask-brush', 'mask-eraser', 'adjustment-brush'] },
  { id: 'draw', label: 'Draw & Type', tools: ['pen', 'freeform-pen', 'curvature-pen', 'direct-select', 'text', 'rectangle', 'ellipse', 'line', 'polygon'] },
] as const;

/** Photoshop's repeated-key families. Singletons are intentionally omitted. */
export const TOOL_FAMILIES: Readonly<Record<string, readonly PaletteToolId[]>> = {
  c: ['crop', 'perspective-crop', 'slice', 'slice-select'],
  g: ['gradient', 'fill'],
  b: ['brush', 'pencil', 'color-replace', 'mixer-brush'],
  u: ['rectangle', 'ellipse', 'line', 'polygon'],
  m: ['select', 'ellipse-select', 'row-select', 'column-select'],
  i: ['eyedropper', 'color-sampler', 'ruler', 'note', 'count'],
  l: ['lasso', 'polygonal-lasso', 'magnetic-lasso'],
  w: ['selection-brush', 'quick-selection', 'magic-wand'],
  e: ['eraser', 'background-eraser', 'magic-eraser'],
  o: ['dodge', 'burn', 'sponge'],
  s: ['clone', 'pattern-stamp'],
  j: ['heal', 'spot-heal', 'patch', 'red-eye'],
  y: ['history-brush', 'art-history-brush'],
  p: ['pen', 'freeform-pen', 'curvature-pen'],
};

/** Pointer/touch flyouts use Photoshop's visible tool families. Selection
 * Brush stays in the L keyboard family for backward compatibility, but remains
 * an independent toolbar slot beside the W-style Selection flyout. */
export const TOOL_FLYOUTS: Readonly<Record<string, readonly PaletteToolId[]>> = {
  marquee: ['select', 'ellipse-select', 'row-select', 'column-select'],
  lasso: ['lasso', 'polygonal-lasso', 'magnetic-lasso'],
  // Selection Brush is an independent toolbar tool. Quick Selection and
  // Magic Wand share the Photoshop-style W flyout.
  selection: ['quick-selection', 'magic-wand'],
  crop: ['crop', 'perspective-crop', 'slice', 'slice-select', 'frame'],
  fill: ['gradient', 'fill'],
  brush: ['brush', 'pencil', 'color-replace', 'mixer-brush'],
  shape: ['rectangle', 'ellipse', 'line', 'polygon'],
  eraser: ['eraser', 'background-eraser', 'magic-eraser'],
  tone: ['dodge', 'burn', 'sponge'],
  stamp: ['clone', 'pattern-stamp'],
  healing: ['heal', 'spot-heal', 'patch', 'red-eye'],
  history: ['history-brush', 'art-history-brush'],
  mask: ['mask-brush', 'mask-eraser', 'adjustment-brush'],
  // Pen variants share one Photoshop-style hold/keyboard flyout. The active
  // variant replaces the representative slot while the remaining variants
  // stay reachable from the flyout and P cycling.
  pen: ['pen', 'freeform-pen', 'curvature-pen'],
};

export function familyForTool(tool: string): string | undefined {
  return Object.entries(TOOL_FAMILIES).find(([, tools]) => tools.includes(tool as PaletteToolId))?.[0];
}

export function flyoutForTool(tool: string): string | undefined {
  return Object.entries(TOOL_FLYOUTS).find(([, tools]) => tools.includes(tool as PaletteToolId))?.[0];
}

export function flyoutTools(toolOrId: string): readonly PaletteToolId[] {
  if (TOOL_FLYOUTS[toolOrId]) return TOOL_FLYOUTS[toolOrId];
  const flyout = flyoutForTool(toolOrId);
  return flyout ? TOOL_FLYOUTS[flyout] : [];
}

export function categoryForTool(tool: string): string | undefined {
  return TOOL_CATEGORIES.find((category) => category.tools.includes(tool as PaletteToolId))?.id;
}

/**
 * Return the compact toolbar representation for a category. Photoshop shows
 * one slot for a tool family and keeps the variants in its press-and-hold
 * flyout; the active variant replaces that representative slot.
 */
export function compactCategoryTools(
  category: ToolCategory,
  activeTool?: string,
  rememberedChoices?: Readonly<Record<string, string>>,
): readonly PaletteToolId[] {
  const result: PaletteToolId[] = [];
  const positions = new Map<string, number>();
  for (const tool of category.tools) {
    const family = flyoutForTool(tool);
    const key = family ? `flyout:${family}` : `tool:${tool}`;
    const existing = positions.get(key);
    if (existing === undefined) {
      positions.set(key, result.length);
      result.push(tool);
    } else if (tool === activeTool) {
      result[existing] = tool;
    }
  }
  // A family keeps the last selected variant when the active tool moves to a
  // different family. This mirrors Photoshop's toolbar and avoids resetting a
  // carefully chosen subtool every time the user returns to its slot.
  if (rememberedChoices) {
    for (const [family, remembered] of Object.entries(rememberedChoices)) {
      const position = positions.get(`flyout:${family}`);
      if (position === undefined || !category.tools.includes(remembered as PaletteToolId)) continue;
      const flyout = TOOL_FLYOUTS[family];
      if (flyout?.includes(remembered as PaletteToolId))
        result[position] = remembered as PaletteToolId;
    }
    const activeFamily = activeTool && flyoutForTool(activeTool);
    if (activeFamily) {
      const position = positions.get(`flyout:${activeFamily}`);
      if (position !== undefined) result[position] = activeTool as PaletteToolId;
    }
  }
  return result;
}

export function familyTools(toolOrKey: string): readonly PaletteToolId[] {
  if (TOOL_FAMILIES[toolOrKey]) return TOOL_FAMILIES[toolOrKey];
  const family = familyForTool(toolOrKey);
  return family ? TOOL_FAMILIES[family] : [];
}

export function cycleFamilyTool(
  current: string,
  key: string,
  reverse = false,
): PaletteToolId | undefined {
  const tools = familyTools(key);
  if (!tools.length) return undefined;
  const index = tools.indexOf(current as PaletteToolId);
  const offset = reverse ? -1 : 1;
  return tools[(index < 0 ? 0 : index + offset + tools.length) % tools.length];
}

export function validatePaletteTaxonomy(toolIds: readonly string[]): boolean {
  const expected = new Set(toolIds);
  const categorized = TOOL_CATEGORIES.flatMap((category) => category.tools);
  return categorized.length === expected.size &&
    new Set(categorized).size === expected.size &&
    categorized.every((tool) => expected.has(tool));
}
