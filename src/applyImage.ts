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
