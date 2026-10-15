export type CommandShortcutPreferences = {
  version: number;
  bindings: Record<string, string>;
};

export const COMMAND_SHORTCUTS_VERSION = 1;

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

/**
 * Normalize a command shortcut while retaining the small punctuation and
 * function-key vocabulary used by the Photoshop-style menu definitions.
 * Command bindings are intentionally explicit: an empty value removes an
 * override and never shadows the built-in shortcut.
 */
export function normalizeCommandShortcutChord(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const tokens = value.trim().toLowerCase().split('+').map((token) => token.trim()).filter(Boolean);
  if (!tokens.length) return undefined;
  const rawKey = tokens.pop();
  const key = rawKey === '−' ? '-' : rawKey;
  if (!key || !/^(?:[a-z0-9]|f(?:[1-9]|1[0-2])|[=\-−,+])$/.test(key)) return undefined;
  const modifiers = new Set<string>();
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token];
    if (!modifier || modifiers.has(modifier)) return undefined;
    modifiers.add(modifier);
  }
  return [...['ctrl', 'meta', 'alt', 'shift'].filter((modifier) => modifiers.has(modifier)), key].join('+');
}

export function commandShortcutMatches(
  binding: string,
  event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
): boolean {
  const chord = normalizeCommandShortcutChord(binding);
  if (!chord) return false;
  const parts = chord.split('+');
  const expected = parts.at(-1);
  const actual = event.key.toLowerCase() === '−' ? '-' : event.key.toLowerCase();
  return expected === actual &&
    parts.includes('shift') === Boolean(event.shiftKey) &&
    parts.includes('alt') === Boolean(event.altKey) &&
    parts.includes('ctrl') === Boolean(event.ctrlKey) &&
    parts.includes('meta') === Boolean(event.metaKey);
}

export function normalizeCommandShortcutPreferences(
  value: unknown,
  commandIds: readonly string[],
): CommandShortcutPreferences {
  const allowed = new Set(commandIds);
  const bindings: Record<string, string> = {};
  if (!value || typeof value !== 'object') return { version: COMMAND_SHORTCUTS_VERSION, bindings };
  const candidate = value as { version?: unknown; bindings?: unknown };
  if (candidate.version !== undefined && candidate.version !== COMMAND_SHORTCUTS_VERSION)
    return { version: COMMAND_SHORTCUTS_VERSION, bindings };
  if (!candidate.bindings || typeof candidate.bindings !== 'object')
    return { version: COMMAND_SHORTCUTS_VERSION, bindings };
  const used = new Set<string>();
  for (const [command, rawChord] of Object.entries(candidate.bindings as Record<string, unknown>)) {
    if (!allowed.has(command) || typeof rawChord !== 'string') continue;
    const chord = normalizeCommandShortcutChord(rawChord);
    if (!chord || used.has(chord)) continue;
    bindings[command] = chord;
    used.add(chord);
  }
  return { version: COMMAND_SHORTCUTS_VERSION, bindings };
}
