/**
 * Built-in menu shortcuts that the editor routes through its command
 * dispatcher (docs/keyboard-shortcuts.md, docs/command-shortcuts-contract.md).
 *
 * Every modifier must match exactly, so Ctrl+F (Search commands),
 * Ctrl+Shift+F (Fade…) and Ctrl+Alt+Shift+F (Find Layers) stay distinct.
 * "Ctrl" in a menu label means Ctrl on Windows/Linux and Cmd on macOS.
 */

export type MenuShortcutEvent = {
  key: string;
  code?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

const ORDER = ['ctrl', 'alt', 'shift'] as const;

/** 'Alt+Shift+Ctrl+F' → 'ctrl+alt+shift+f'; Cmd/Meta fold into ctrl. */
export function normalizeMenuShortcutLabel(label: string): string | undefined {
  // The '+' key itself ("+" or "Ctrl++") would split into empty tokens.
  const plusKey = label === '+' || label.endsWith('++');
  const body = plusKey ? label.slice(0, -2) : label;
  const tokens = body ? body.split('+').map((token) => token.trim()) : [];
  const key = plusKey ? '+' : tokens.pop();
  if (!key) return undefined;
  const modifiers = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const modifier = lower === 'cmd' || lower === 'meta' || lower === 'control' ? 'ctrl'
      : lower === 'option' ? 'alt' : lower;
    if (!(ORDER as readonly string[]).includes(modifier)) return undefined;
    modifiers.add(modifier);
  }
  const normalizedKey = key === '−' ? '-' : key.toLowerCase();
  return [...ORDER.filter((modifier) => modifiers.has(modifier)), normalizedKey].join('+');
}

/** The same chord form for a keydown event. */
export function menuShortcutChord(event: MenuShortcutEvent): string {
  const modifiers = new Set<string>();
  if (event.ctrlKey || event.metaKey) modifiers.add('ctrl');
  if (event.altKey) modifiers.add('alt');
  if (event.shiftKey) modifiers.add('shift');
  // Alt/Option can turn a letter into another character (macOS); fall back
  // to the physical key only then, so non-QWERTY layouts keep their letters.
  let key = event.key.toLowerCase();
  const physical = /^Key([A-Z])$/.exec(event.code ?? '')?.[1];
  if (physical && !/^[a-z]$/.test(key)) key = physical.toLowerCase();
  return [...ORDER.filter((modifier) => modifiers.has(modifier)), key].join('+');
}

/** Advertised chords dispatched as menu commands with exact modifiers. */
export const ROUTED_MENU_SHORTCUTS: Readonly<Record<string, string>> = {
  'ctrl+f': 'search-commands',
  'ctrl+shift+f': 'fade',
  'ctrl+alt+shift+f': 'find-layers',
  'ctrl+,': 'hide-layer',
  'ctrl+alt+z': 'toggle-last-state',
};

export function routedMenuCommand(event: MenuShortcutEvent): string | undefined {
  return ROUTED_MENU_SHORTCUTS[menuShortcutChord(event)];
}

/**
 * Every built-in shortcut the menus advertise, with the commands it serves.
 * Single letters are tool keys (src/toolKeys.ts) and list the menu commands
 * that name a tool of that family. The pure test cross-checks this table
 * against the menu definitions in app/page.tsx, and the keydown handler
 * implements each chord (browser tests cover the routed ones).
 */
export const BUILT_IN_MENU_SHORTCUTS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.entries(ROUTED_MENU_SHORTCUTS).map(([chord, command]) => [chord, [command]])),
  'ctrl+n': ['new-white'],
  'ctrl+o': ['open'],
  'ctrl+s': ['png'],
  'ctrl+z': ['undo'],
  'ctrl+y': ['redo'],
  'ctrl+c': ['copy-layer'],
  'ctrl+x': ['cut-layer'],
  'ctrl+v': ['paste-layer'],
  'ctrl+shift+c': ['copy-merged'],
  'shift+f5': ['fill-layer'],
  f1: ['help-center'],
  'alt+backspace': ['fill-foreground'],
  'ctrl+backspace': ['fill-background'],
  'ctrl+t': ['free-transform'],
  'ctrl+shift+l': ['auto-tone'],
  'ctrl+alt+i': ['resize'],
  'ctrl+j': ['duplicate-layer'],
  'ctrl+g': ['group-layer'],
  'ctrl+shift+g': ['ungroup-layer'],
  'ctrl+a': ['select-all'],
  'ctrl+d': ['deselect'],
  'ctrl+shift+i': ['invert-selection'],
  '+': ['zoom-in'],
  '-': ['zoom-out'],
  '0': ['fit'],
  '1': ['actual'],
  f: ['screen-standard'],
  j: ['patch-tool'],
  b: ['mixer-brush-tool'],
  y: ['history-brush-tool', 'art-history-brush-tool'],
  c: ['crop', 'slice', 'slice-select'],
  k: ['frame'],
  t: ['text-tool'],
};
