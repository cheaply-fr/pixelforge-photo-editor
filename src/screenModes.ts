/**
 * Workspace screen modes are UI-only preferences. They never alter a frame,
 * its pixels, or the undo history. Keeping the vocabulary in a small pure
 * module makes menu/shortcut behavior deterministic and safe to persist.
 */

export const SCREEN_MODE_STORAGE_KEY = 'pixelforge.screen-mode.v1';

export const SCREEN_MODES = ['standard', 'full-menu', 'full'] as const;

export type ScreenMode = (typeof SCREEN_MODES)[number];

export function isScreenMode(value: unknown): value is ScreenMode {
  return SCREEN_MODES.includes(value as ScreenMode);
}

export function normalizeScreenMode(value: unknown): ScreenMode {
  return isScreenMode(value) ? value : 'standard';
}

export function cycleScreenMode(mode: ScreenMode): ScreenMode {
  const index = SCREEN_MODES.indexOf(mode);
  return SCREEN_MODES[(index + 1) % SCREEN_MODES.length];
}

export function screenModeLabel(mode: ScreenMode): string {
  switch (mode) {
    case 'full-menu':
      return 'Full Screen with Menu';
    case 'full':
      return 'Full Screen';
    default:
      return 'Standard Screen Mode';
  }
}

export function screenModeClass(mode: ScreenMode): string {
  return mode === 'standard' ? '' : `screen-mode-${mode}`;
}
