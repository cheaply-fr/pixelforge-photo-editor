import type { ToolbarColumns } from './ToolbarSettingsDialog';

export type ToolbarPreferences = {
  version: number;
  columns: ToolbarColumns;
  hiddenCategories: string[];
  categoryOrder: string[];
  toolOrder: Record<string, string[]>;
};

export const TOOLBAR_PREFERENCES_VERSION = 1;

export function defaultToolbarPreferences(categoryIds: readonly string[]): ToolbarPreferences {
  return {
    version: TOOLBAR_PREFERENCES_VERSION,
    columns: 'auto',
    hiddenCategories: [],
    categoryOrder: [...categoryIds],
    toolOrder: {},
  };
}

/**
 * Normalize an untrusted local-storage record against the current category
 * inventory. Unknown/duplicate IDs are discarded, order is completed with
 * newly introduced categories, and hiding every category is prevented.
 */
export function normalizeToolbarPreferences(
  value: unknown,
  categoryIds: readonly string[],
  categoryTools: Readonly<Record<string, readonly string[]>> = {},
): ToolbarPreferences {
  const defaults = defaultToolbarPreferences(categoryIds);
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<ToolbarPreferences>;
  if (candidate.version !== undefined && candidate.version !== TOOLBAR_PREFERENCES_VERSION) return defaults;
  const allowed = new Set(categoryIds);
  const unique = (items: unknown, permitted = allowed): string[] => {
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items.filter((item): item is string => {
      if (typeof item !== 'string' || !permitted.has(item) || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  };
  const storedCategoryOrder = unique(candidate.categoryOrder);
  const categoryOrder = [...storedCategoryOrder, ...categoryIds.filter((id) => !storedCategoryOrder.includes(id))];
  const hidden = unique(candidate.hiddenCategories).filter((id) => id !== 'navigation');
  const hiddenCategories = hidden.length >= categoryIds.length - 1
    ? hidden.slice(0, Math.max(0, categoryIds.length - 2))
    : hidden;
  const toolOrder: Record<string, string[]> = {};
  const storedTools = candidate.toolOrder && typeof candidate.toolOrder === 'object'
    ? candidate.toolOrder as Record<string, unknown>
    : {};
  for (const categoryId of categoryIds) {
    const allowedTools = categoryTools[categoryId] ?? [];
    if (!allowedTools.length) continue;
    const storedOrder = unique(storedTools[categoryId], new Set(allowedTools));
    toolOrder[categoryId] = [...storedOrder, ...allowedTools.filter((id) => !storedOrder.includes(id))];
  }
  return {
    version: TOOLBAR_PREFERENCES_VERSION,
    columns: candidate.columns === '2' || candidate.columns === '3' ? candidate.columns : defaults.columns,
    hiddenCategories,
    categoryOrder,
    toolOrder,
  };
}
