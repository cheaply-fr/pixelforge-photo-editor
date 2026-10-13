export const COLOR_PROFILES = ['srgb', 'display-p3'] as const;
export type ColorProfile = (typeof COLOR_PROFILES)[number];

export function validColorProfile(value: unknown): value is ColorProfile {
  return COLOR_PROFILES.includes(value as ColorProfile);
}

export function normalizeColorProfile(value: unknown): ColorProfile {
  return validColorProfile(value) ? value : 'srgb';
}
