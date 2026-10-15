/**
 * Composite a rendered source image into the active raster target.
 *
 * Apply Image is intentionally bounded to source-over in the first release:
 * callers can provide a selection-clipped source and an opacity, while the
 * document layer remains the single undoable target. The helper is detached
 * and source-safe so it can also be used by workers or batch actions later.
 */
export function applyImagePixels(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  opacity = 100,
): Uint8ClampedArray {
  if (target.length !== source.length || target.length === 0 || target.length % 4 !== 0)
    throw new Error('Apply Image requires matching RGBA buffers');
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100)
    throw new Error('Apply Image opacity must be between 0 and 100');
  const factor = opacity / 100;
  const output = new Uint8ClampedArray(target);
  for (let i = 0; i < output.length; i += 4) {
    const sourceAlpha = (source[i + 3] / 255) * factor;
    const targetAlpha = output[i + 3] / 255;
    const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
    if (outAlpha <= 0) {
      output[i] = 0;
      output[i + 1] = 0;
      output[i + 2] = 0;
      output[i + 3] = 0;
      continue;
    }
    for (let channel = 0; channel < 3; channel++) {
      const sourcePremultiplied = source[i + channel] * sourceAlpha;
      const targetPremultiplied = output[i + channel] * targetAlpha * (1 - sourceAlpha);
      output[i + channel] = Math.round((sourcePremultiplied + targetPremultiplied) / outAlpha);
    }
    output[i + 3] = Math.round(outAlpha * 255);
  }
  return output;
}

export const CALCULATION_MODES = [
  'multiply',
  'screen',
  'add',
  'subtract',
  'difference',
  'overlay',
] as const;
export type CalculationMode = (typeof CALCULATION_MODES)[number];

function calculationChannel(target: number, source: number, mode: CalculationMode): number {
  switch (mode) {
    case 'multiply':
      return (target * source) / 255;
    case 'screen':
      return 255 - ((255 - target) * (255 - source)) / 255;
    case 'add':
      return Math.min(255, target + source);
    case 'subtract':
      return Math.max(0, target - source);
    case 'difference':
      return Math.abs(target - source);
    case 'overlay':
      return target < 128
        ? (2 * target * source) / 255
        : 255 - (2 * (255 - target) * (255 - source)) / 255;
  }
}

/** Apply a bounded local channel calculation without mutating either input. */
export function calculateImagePixels(
  target: Uint8ClampedArray,
  source: Uint8ClampedArray,
  mode: CalculationMode,
  opacity = 100,
): Uint8ClampedArray {
  if (!CALCULATION_MODES.includes(mode)) throw new Error('Unsupported Calculations blend mode');
  if (target.length !== source.length || target.length === 0 || target.length % 4 !== 0)
    throw new Error('Calculations requires matching RGBA buffers');
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100)
    throw new Error('Calculations opacity must be between 0 and 100');
  const factor = opacity / 100;
  const output = new Uint8ClampedArray(target);
  for (let i = 0; i < output.length; i += 4) {
    const sourceAlpha = (source[i + 3] / 255) * factor;
    const targetAlpha = output[i + 3] / 255;
    const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
    if (outAlpha <= 0) {
      output[i] = 0;
      output[i + 1] = 0;
      output[i + 2] = 0;
      output[i + 3] = 0;
      continue;
    }
    for (let channel = 0; channel < 3; channel++) {
      const calculated = calculationChannel(output[i + channel], source[i + channel], mode);
      output[i + channel] = Math.round(
        (calculated * sourceAlpha + output[i + channel] * targetAlpha * (1 - sourceAlpha)) /
          outAlpha,
      );
    }
    output[i + 3] = Math.round(outAlpha * 255);
  }
  return output;
}
