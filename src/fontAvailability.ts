/** Browser-local font availability checks used for explicit fallback disclosure. */

export const FONT_AVAILABILITY = ['available', 'fallback'] as const;
export type FontAvailability = (typeof FONT_AVAILABILITY)[number];

const MAX_FONT_FAMILY_LENGTH = 160;

export function normalizeFontFamily(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const family = value.trim();
  if (!family || family.length > MAX_FONT_FAMILY_LENGTH) return undefined;
  for (const character of family) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return undefined;
  }
  return family;
}

export function fontCheckShorthand(family: unknown): string | undefined {
  const normalized = normalizeFontFamily(family);
  return normalized ? `16px "${normalized.replaceAll('"', '')}"` : undefined;
}

export function checkFontAvailability(
  family: unknown,
  check: (font: string) => boolean,
): FontAvailability {
  const shorthand = fontCheckShorthand(family);
  if (!shorthand) return 'fallback';
  try {
    return check(shorthand) ? 'available' : 'fallback';
  } catch {
    return 'fallback';
  }
}
