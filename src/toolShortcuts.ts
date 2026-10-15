export type ToolShortcutPreferences = {
  version: number;
  bindings: Record<string, string>;
};

export const TOOL_SHORTCUTS_VERSION = 1;

const MODIFIER_ALIASES: Record<string, string> = {
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  ctrl: 'ctrl',
  control: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
};

/** Normalize a user-entered key chord to a canonical modifier order. */
export function normalizeToolShortcutChord(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const tokens = value.trim().toLowerCase().split('+').map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) return undefined;
  const key = tokens.pop();
  if (!key || !/^[a-z0-9]$/.test(key)) return undefined;
  const modifiers = new Set<string>();
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token];
    if (!modifier || modifiers.has(modifier)) return undefined;
    modifiers.add(modifier);
  }
  return [...['ctrl', 'meta', 'alt', 'shift'].filter((modifier) => modifiers.has(modifier)), key].join('+');
}

export function toolShortcutMatches(
  binding: string,
  event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
): boolean {
  const chord = normalizeToolShortcutChord(binding);
  if (!chord) return false;
  const parts = chord.split('+');
  const key = parts.at(-1);
  return key === event.key.toLowerCase() &&
    parts.includes('shift') === Boolean(event.shiftKey) &&
    parts.includes('alt') === Boolean(event.altKey) &&
    parts.includes('ctrl') === Boolean(event.ctrlKey) &&
    parts.includes('meta') === Boolean(event.metaKey);
}

export function normalizeToolShortcutPreferences(
  value: unknown,
  toolIds: readonly string[],
): ToolShortcutPreferences {
  const allowed = new Set(toolIds);
  const bindings: Record<string, string> = {};
  if (!value || typeof value !== 'object') return { version: TOOL_SHORTCUTS_VERSION, bindings };
  const candidate = value as { version?: unknown; bindings?: unknown };
  if (candidate.version !== undefined && candidate.version !== TOOL_SHORTCUTS_VERSION) return { version: TOOL_SHORTCUTS_VERSION, bindings };
  if (!candidate.bindings || typeof candidate.bindings !== 'object') return { version: TOOL_SHORTCUTS_VERSION, bindings };
  const used = new Set<string>();
  for (const [toolId, rawKey] of Object.entries(candidate.bindings as Record<string, unknown>)) {
    if (!allowed.has(toolId) || typeof rawKey !== 'string') continue;
    const key = normalizeToolShortcutChord(rawKey);
    if (!key || used.has(key)) continue;
    bindings[toolId] = key;
    used.add(key);
  }
  return { version: TOOL_SHORTCUTS_VERSION, bindings };
}
