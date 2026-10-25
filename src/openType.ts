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
  /** Bounded CSS font-variation-settings axes for variable fonts. */
  variableAxes: {
    wght: number;
    wdth: number;
    opsz: number;
  };
};

export const DEFAULT_OPEN_TYPE: Readonly<OpenTypeSettings> = Object.freeze({
  ligatures: true,
  discretionaryLigatures: false,
  contextualAlternates: true,
  kerning: 'auto' as const,
  smallCaps: false,
  variableAxes: Object.freeze({ wght: 400, wdth: 100, opsz: 14 }),
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
    && candidate.variableAxes !== undefined
    && typeof candidate.variableAxes === 'object'
    && candidate.variableAxes !== null
    && Number.isFinite((candidate.variableAxes as Record<string, unknown>).wght)
    && Number.isFinite((candidate.variableAxes as Record<string, unknown>).wdth)
    && (candidate.variableAxes as Record<string, number>).wght >= 100
    && (candidate.variableAxes as Record<string, number>).wght <= 900
    && (candidate.variableAxes as Record<string, number>).wdth >= 50
    && (candidate.variableAxes as Record<string, number>).wdth <= 200
    && Number.isFinite((candidate.variableAxes as Record<string, unknown>).opsz)
    && (candidate.variableAxes as Record<string, number>).opsz >= 8
    && (candidate.variableAxes as Record<string, number>).opsz <= 144
  );
}

export function normalizeOpenType(value: Partial<OpenTypeSettings> | undefined): OpenTypeSettings {
  const candidate = value && typeof value === 'object' ? value : {};
  const axes = candidate.variableAxes && typeof candidate.variableAxes === 'object' ? candidate.variableAxes as Partial<OpenTypeSettings['variableAxes']> : {};
  return {
    ligatures: candidate.ligatures ?? DEFAULT_OPEN_TYPE.ligatures,
    discretionaryLigatures: candidate.discretionaryLigatures ?? DEFAULT_OPEN_TYPE.discretionaryLigatures,
    contextualAlternates: candidate.contextualAlternates ?? DEFAULT_OPEN_TYPE.contextualAlternates,
    kerning: candidate.kerning === 'normal' || candidate.kerning === 'none' ? candidate.kerning : DEFAULT_OPEN_TYPE.kerning,
    smallCaps: candidate.smallCaps ?? DEFAULT_OPEN_TYPE.smallCaps,
    variableAxes: {
      wght: Math.max(100, Math.min(900, Number.isFinite(axes.wght) ? axes.wght! : 400)),
      wdth: Math.max(50, Math.min(200, Number.isFinite(axes.wdth) ? axes.wdth! : 100)),
      opsz: Math.max(8, Math.min(144, Number.isFinite(axes.opsz) ? axes.opsz! : 14)),
    },
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
    fontVariationSettings: `"wght" ${settings.variableAxes.wght}, "wdth" ${settings.variableAxes.wdth}, "opsz" ${settings.variableAxes.opsz}`,
  } as const;
}
