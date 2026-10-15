/**
 * Bounded local OpenType presentation flags for editable text layers.
 *
 * Canvas font shaping remains browser/font dependent. These flags expose the
 * portable subset PixelForge can request without embedding fonts or claiming
 * Adobe's complete shaping engine.
 */
export type OpenTypeKerning = 'auto' | 'normal' | 'none';

export type OpenTypeSettings = {
  ligatures: boolean;
  discretionaryLigatures: boolean;
  contextualAlternates: boolean;
  kerning: OpenTypeKerning;
  smallCaps: boolean;
};

export const DEFAULT_OPEN_TYPE: Readonly<OpenTypeSettings> = Object.freeze({
  ligatures: true,
  discretionaryLigatures: false,
  contextualAlternates: true,
  kerning: 'auto' as const,
  smallCaps: false,
});

export function validOpenType(value: unknown): value is OpenTypeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ligatures === 'boolean' &&
    typeof candidate.discretionaryLigatures === 'boolean' &&
    typeof candidate.contextualAlternates === 'boolean' &&
    (candidate.kerning === 'auto' || candidate.kerning === 'normal' || candidate.kerning === 'none') &&
    typeof candidate.smallCaps === 'boolean'
  );
}

export function normalizeOpenType(value: Partial<OpenTypeSettings> | undefined): OpenTypeSettings {
  const candidate = value && typeof value === 'object' ? value : {};
  return {
    ligatures: candidate.ligatures ?? DEFAULT_OPEN_TYPE.ligatures,
    discretionaryLigatures: candidate.discretionaryLigatures ?? DEFAULT_OPEN_TYPE.discretionaryLigatures,
    contextualAlternates: candidate.contextualAlternates ?? DEFAULT_OPEN_TYPE.contextualAlternates,
    kerning: candidate.kerning === 'normal' || candidate.kerning === 'none' ? candidate.kerning : DEFAULT_OPEN_TYPE.kerning,
    smallCaps: candidate.smallCaps ?? DEFAULT_OPEN_TYPE.smallCaps,
  };
}

/** Return browser Canvas2D typography values without exposing font files. */
export function openTypeCanvasValues(value: Partial<OpenTypeSettings> | undefined) {
  const settings = normalizeOpenType(value);
  const features = [
    settings.contextualAlternates ? '"calt"' : '"calt" 0',
    settings.discretionaryLigatures ? '"dlig"' : '"dlig" 0',
  ];
  return {
    fontKerning: settings.kerning,
    fontVariantLigatures: settings.ligatures
      ? settings.discretionaryLigatures ? 'common-ligatures discretionary-ligatures' : 'common-ligatures'
      : 'none',
    fontFeatureSettings: features.join(', '),
    fontVariantCaps: settings.smallCaps ? 'small-caps' : 'normal',
  } as const;
}
