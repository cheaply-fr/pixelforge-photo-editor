export type ToolShortcutPreferences = {
  version: number;
  bindings: Record<string, string>;
};

export const TOOL_SHORTCUTS_VERSION = 1;

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
    const key = rawKey.trim().toLowerCase();
    if (!/^[a-z0-9]$/.test(key) || used.has(key)) continue;
    bindings[toolId] = key;
    used.add(key);
  }
  return { version: TOOL_SHORTCUTS_VERSION, bindings };
}
