/**
 * Gradient tool compositing: how a rendered gradient combines with the
 * layer's existing pixels. "Normal" paints over them (source-over, the
 * behaviour before this option existed), "Replace" discards them, and the
 * remaining modes are the separable W3C Compositing blend modes followed by
 * source-over, so a second gradient can build a glow on top of the first.
 * The arithmetic runs on straight-alpha RGBA bytes so it is deterministic and
 * testable without a canvas; it does not claim Photoshop algorithm parity.
 */
export const GRADIENT_BLEND_MODES = [
  'normal',
  'replace',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'color-dodge',
  'linear-dodge',
  'color-burn',
  'darken',
  'lighten',
  'difference',
  'exclusion',
] as const;
export type GradientBlendMode = (typeof GRADIENT_BLEND_MODES)[number];

export const GRADIENT_BLEND_LABELS: Record<GradientBlendMode, string> = {
  normal: 'Normal (paint over)',
  replace: 'Replace',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  'soft-light': 'Soft light',
  'hard-light': 'Hard light',
  'color-dodge': 'Colour dodge',
  'linear-dodge': 'Linear dodge (add)',
  'color-burn': 'Colour burn',
  darken: 'Darken',
  lighten: 'Lighten',
  difference: 'Difference',
  exclusion: 'Exclusion',
};

export const GRADIENT_BLEND_DEFAULT: GradientBlendMode = 'normal';
export const GRADIENT_OPACITY_MIN = 1;
export const GRADIENT_OPACITY_MAX = 100;
export const GRADIENT_OPACITY_DEFAULT = 100;

export function validGradientBlendMode(value: unknown): value is GradientBlendMode {
  return typeof value === 'string' && (GRADIENT_BLEND_MODES as readonly string[]).includes(value);
}

export function normalizeGradientBlendMode(value: unknown): GradientBlendMode {
  return validGradientBlendMode(value) ? value : GRADIENT_BLEND_DEFAULT;
}

export function validGradientOpacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) &&
    value >= GRADIENT_OPACITY_MIN && value <= GRADIENT_OPACITY_MAX;
}

export function normalizeGradientOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GRADIENT_OPACITY_DEFAULT;
  return Math.max(GRADIENT_OPACITY_MIN, Math.min(GRADIENT_OPACITY_MAX, Math.round(value)));
}

/** Separable blend function B(backdrop, source) on 0…1 channels. */
export function blendGradientChannel(mode: GradientBlendMode, backdrop: number, source: number): number {
  const b = backdrop, s = source;
  switch (mode) {
    case 'multiply':
      return b * s;
    case 'screen':
      return b + s - b * s;
    case 'overlay':
      return b <= 0.5 ? 2 * s * b : 1 - 2 * (1 - s) * (1 - b);
    case 'hard-light':
      return s <= 0.5 ? 2 * s * b : 1 - 2 * (1 - s) * (1 - b);
    case 'soft-light': {
      if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      return b + (2 * s - 1) * (d - b);
    }
    case 'color-dodge':
      if (b === 0) return 0;
      return s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'linear-dodge':
      return Math.min(1, b + s);
    case 'color-burn':
      if (b >= 1) return 1;
      return s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'darken':
      return Math.min(b, s);
    case 'lighten':
      return Math.max(b, s);
    case 'difference':
      return Math.abs(b - s);
    case 'exclusion':
      return b + s - 2 * b * s;
    default:
      return s;
  }
}

/**
 * Composite gradient pixels onto a copy of the layer pixels. Both arrays are
 * straight-alpha RGBA of equal length; neither input is modified. `opacity`
 * is 0…1 and scales the gradient's alpha. Replace keeps none of the original
 * pixels: the result is the gradient at the given opacity.
 */
export function compositeGradientPixels(
  layer: ArrayLike<number>,
  gradient: ArrayLike<number>,
  mode: GradientBlendMode,
  opacity = 1,
): Uint8ClampedArray {
  if (layer.length !== gradient.length || layer.length % 4 !== 0)
    throw new Error('Gradient and layer pixels must be RGBA data of equal size');
  if (!validGradientBlendMode(mode)) throw new Error('Gradient blend mode is invalid');
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new Error('Gradient opacity must be between 0 and 1');
  const output = new Uint8ClampedArray(layer.length);
  for (let offset = 0; offset < layer.length; offset += 4) {
    const sourceAlpha = (gradient[offset + 3] / 255) * opacity;
    if (mode === 'replace') {
      output[offset] = gradient[offset];
      output[offset + 1] = gradient[offset + 1];
      output[offset + 2] = gradient[offset + 2];
      output[offset + 3] = Math.round(sourceAlpha * 255);
      if (output[offset + 3] === 0) output[offset] = output[offset + 1] = output[offset + 2] = 0;
      continue;
    }
    const backdropAlpha = layer[offset + 3] / 255;
    if (sourceAlpha <= 0) {
      output[offset] = layer[offset];
      output[offset + 1] = layer[offset + 1];
      output[offset + 2] = layer[offset + 2];
      output[offset + 3] = layer[offset + 3];
      continue;
    }
    const outputAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
    for (let channel = 0; channel < 3; channel += 1) {
      const s = gradient[offset + channel] / 255,
        b = layer[offset + channel] / 255,
        // W3C: the source colour is mixed with the blend result by backdrop alpha.
        mixed = mode === 'normal' ? s : (1 - backdropAlpha) * s + backdropAlpha * blendGradientChannel(mode, b, s),
        premultiplied = mixed * sourceAlpha + b * backdropAlpha * (1 - sourceAlpha);
      output[offset + channel] = Math.round((premultiplied / outputAlpha) * 255);
    }
    output[offset + 3] = Math.round(outputAlpha * 255);
  }
  return output;
}
