/**
 * Portable language and paragraph-direction metadata for editable text.
 *
 * The browser remains responsible for glyph shaping.  PixelForge stores only
 * a bounded, local preference so projects can retain author intent without
 * embedding fonts, contacting a provider, or claiming full Adobe shaping
 * parity.
 */
export const TEXT_LANGUAGES = ['auto', 'en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'ar', 'he', 'ja', 'ko', 'zh'] as const;
export type TextLanguage = (typeof TEXT_LANGUAGES)[number];
export const TEXT_DIRECTIONS = ['auto', 'ltr', 'rtl'] as const;
export type TextDirection = (typeof TEXT_DIRECTIONS)[number];

export type TextLanguageSettings = {
  language: TextLanguage;
  direction: TextDirection;
  hyphenation: boolean;
};

export const DEFAULT_TEXT_LANGUAGE: Readonly<TextLanguageSettings> = Object.freeze({
  language: 'auto' as const,
  direction: 'auto' as const,
  hyphenation: false,
});

export function validTextLanguageSettings(value: unknown): value is TextLanguageSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    TEXT_LANGUAGES.includes(candidate.language as TextLanguage) &&
    TEXT_DIRECTIONS.includes(candidate.direction as TextDirection) &&
    typeof candidate.hyphenation === 'boolean'
  );
}

export function normalizeTextLanguage(
  value: Partial<TextLanguageSettings> | undefined,
): TextLanguageSettings {
  const candidate = value && typeof value === 'object' ? value : {};
  return {
    language: TEXT_LANGUAGES.includes(candidate.language as TextLanguage)
      ? candidate.language as TextLanguage
      : DEFAULT_TEXT_LANGUAGE.language,
    direction: TEXT_DIRECTIONS.includes(candidate.direction as TextDirection)
      ? candidate.direction as TextDirection
      : DEFAULT_TEXT_LANGUAGE.direction,
    hyphenation: candidate.hyphenation === true,
  };
}

/** Resolve the browser direction without changing the persisted authoring mode. */
export function resolvedTextDirection(value: Partial<TextLanguageSettings> | undefined): 'ltr' | 'rtl' {
  const settings = normalizeTextLanguage(value);
  if (settings.direction === 'ltr' || settings.direction === 'rtl') return settings.direction;
  return settings.language === 'ar' || settings.language === 'he' ? 'rtl' : 'ltr';
}

