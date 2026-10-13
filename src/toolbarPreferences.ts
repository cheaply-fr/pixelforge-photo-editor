import type { ToolbarColumns } from './ToolbarSettingsDialog';

export type ToolbarPreferences = {
  columns: ToolbarColumns;
  hiddenCategories: string[];
  categoryOrder: string[];
};

export const TOOLBAR_PREFERENCES_VERSION = 1;

export function defaultToolbarPreferences(categoryIds: readonly string[]): ToolbarPreferences {
  return { columns: 'auto', hiddenCategories: [], categoryOrder: [...categoryIds] };
}

/**
 * Normalize an untrusted local-storage record against the current category
 * inventory. Unknown/duplicate IDs are discarded, order is completed with
 * newly introduced categories, and hiding every category is prevented.
 */
export function normalizeToolbarPreferences(
  value: unknown,
  categoryIds: readonly string[],
): ToolbarPreferences {
  const defaults = defaultToolbarPreferences(categoryIds);
  if (!value || typeof value !== 'object') return defaults;
  const candidate = value as Partial<ToolbarPreferences>;
  const allowed = new Set(categoryIds);
  const unique = (items: unknown): string[] => {
    if (!Array.isArray(items)) return [];
    const seen = new Set<string>();
    return items.filter((item): item is string => {
      if (typeof item !== 'string' || !allowed.has(item) || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  };
  const categoryOrder = [...unique(candidate.categoryOrder), ...categoryIds.filter((id) => !unique(candidate.categoryOrder).includes(id))];
  const hidden = unique(candidate.hiddenCategories).filter((id) => id !== 'navigation');
  const hiddenCategories = hidden.length >= categoryIds.length - 1
    ? hidden.slice(0, Math.max(0, categoryIds.length - 2))
    : hidden;
  return {
    columns: candidate.columns === '2' || candidate.columns === '3' ? candidate.columns : defaults.columns,
    hiddenCategories,
    categoryOrder,
  };
}
