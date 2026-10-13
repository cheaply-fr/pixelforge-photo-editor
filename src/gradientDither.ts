/** Bounded deterministic dithering for gradient rasterization. */
export const GRADIENT_DITHER_MIN = 0;
export const GRADIENT_DITHER_MAX = 100;
export const GRADIENT_DITHER_DEFAULT = 0;

export function normalizeGradientDither(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GRADIENT_DITHER_DEFAULT;
  return Math.max(GRADIENT_DITHER_MIN, Math.min(GRADIENT_DITHER_MAX, Math.round(value)));
}

function noise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

/** Return a detached RGBA buffer with bounded RGB dither and unchanged alpha. */
export function applyGradientDither(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4) {
    throw new Error('Invalid gradient dither buffer');
  }
  const dither = normalizeGradientDither(amount);
  const result = new Uint8ClampedArray(pixels);
  if (dither === 0) return result;
  const amplitude = (dither / GRADIENT_DITHER_MAX) * 6;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (result[offset + 3] === 0) continue;
      const value = noise(x, y) * amplitude;
      result[offset] = Math.max(0, Math.min(255, Math.round(result[offset] + value)));
      result[offset + 1] = Math.max(0, Math.min(255, Math.round(result[offset + 1] + value)));
      result[offset + 2] = Math.max(0, Math.min(255, Math.round(result[offset + 2] + value)));
    }
  }
  return result;
}
