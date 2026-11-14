/**
 * Built-in single-key tool shortcuts (docs/keyboard-shortcuts.md).
 *
 * The toolbar badges, tooltips and flyouts advertise a key for every tool;
 * this table is the one place that decides what each key press selects, so a
 * pure test can check that every advertised letter reaches its tool.
 *
 * - A family key selects the family's first tool, then cycles through it on
 *   repeated presses; Shift cycles backwards.
 * - V, H and Z are single-tool keys (Move, Hand, Zoom).
 * - R selects Rotate View. Shift+R selects the last used of Smudge, Blur and
 *   Sharpen (Smudge at first), and cycles Smudge → Blur → Sharpen while one of
 *   them is already active.
 */

export const TOOL_KEY_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  c: ['crop', 'perspective-crop', 'slice', 'slice-select'],
  g: ['gradient', 'fill'],
  b: ['brush', 'pencil', 'color-replace', 'mixer-brush'],
  u: ['rectangle', 'rounded-rectangle', 'ellipse', 'line', 'polygon', 'custom-shape'],
  m: ['select', 'ellipse-select', 'row-select', 'column-select'],
  i: ['eyedropper', 'color-sampler', 'ruler', 'note', 'audio-note', 'count'],
  l: ['lasso', 'polygonal-lasso', 'magnetic-lasso', 'selection-brush'],
  w: ['selection-brush', 'quick-selection', 'magic-wand'],
  e: ['eraser', 'background-eraser', 'magic-eraser'],
  k: ['frame', 'mask-brush', 'mask-eraser', 'adjustment-brush'],
  o: ['dodge', 'burn', 'sponge'],
  s: ['clone', 'pattern-stamp'],
  y: ['history-brush', 'art-history-brush'],
  j: ['heal', 'spot-heal', 'patch', 'red-eye'],
  p: ['pen', 'freeform-pen', 'curvature-pen'],
  a: ['path-select', 'direct-select'],
  t: ['text', 'vertical-text', 'text-mask', 'vertical-text-mask'],
};

/** Keys that always select one tool. */
export const TOOL_KEY_SINGLES: Readonly<Record<string, string>> = {
  v: 'move',
  h: 'hand',
  z: 'zoom',
  r: 'rotate-view',
};

/** Reached with Shift+R (R alone is Rotate View). */
export const RETOUCH_KEY_FAMILY: readonly string[] = ['smudge', 'blur', 'sharpen'];

export type ToolKeyPress = {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

/**
 * Tool selected by a plain key press, or undefined when the key is not a tool
 * key. Presses with Ctrl, Cmd or Alt never select tools.
 */
export function resolveToolKey(
  event: ToolKeyPress,
  currentTool: string,
  lastRetouchTool: string = RETOUCH_KEY_FAMILY[0],
): string | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  const key = event.key.toLowerCase();
  if (key.length !== 1) return undefined;
  if (key === 'r' && event.shiftKey) {
    const index = RETOUCH_KEY_FAMILY.indexOf(currentTool);
    if (index >= 0) return RETOUCH_KEY_FAMILY[(index + 1) % RETOUCH_KEY_FAMILY.length];
    return RETOUCH_KEY_FAMILY.includes(lastRetouchTool) ? lastRetouchTool : RETOUCH_KEY_FAMILY[0];
  }
  const single = TOOL_KEY_SINGLES[key];
  if (single) return single;
  const family = TOOL_KEY_FAMILIES[key];
  if (!family) return undefined;
  const index = family.indexOf(currentTool);
  if (index < 0) return family[0];
  const direction = event.shiftKey ? -1 : 1;
  return family[(index + direction + family.length) % family.length];
}

/** The key the toolbar should advertise for a tool ('' when it has none). */
export function toolKeyLabel(tool: string): string {
  if (RETOUCH_KEY_FAMILY.includes(tool)) return 'Shift+R';
  const single = Object.entries(TOOL_KEY_SINGLES).find(([, id]) => id === tool)?.[0];
  if (single) return single.toUpperCase();
  const family = Object.entries(TOOL_KEY_FAMILIES).find(([, tools]) => tools.includes(tool))?.[0];
  return family ? family.toUpperCase() : '';
}

/** Compact form for the small toolbar badge (Shift+R → ⇧R). */
export function compactToolKeyLabel(label: string): string {
  return label.replace(/^Shift\+/, '⇧');
}
