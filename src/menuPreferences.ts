/** Bounded local preference for reducing disabled roadmap menu noise. */

export const MENU_PREFERENCES_VERSION = 1 as const;
export const MENU_PREFERENCES_STORAGE_KEY = 'pixelforge.menu-preferences';

export type MenuPreferences = {
  version: typeof MENU_PREFERENCES_VERSION;
  showDisabled: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function normalizeMenuPreferences(value: unknown): MenuPreferences {
  if (!isRecord(value) || value.version !== MENU_PREFERENCES_VERSION) {
    return { version: MENU_PREFERENCES_VERSION, showDisabled: true };
  }
  return {
    version: MENU_PREFERENCES_VERSION,
    showDisabled: value.showDisabled !== false,
  };
}
