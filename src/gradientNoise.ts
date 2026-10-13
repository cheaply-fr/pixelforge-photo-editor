/** Bounded deterministic colour noise for gradient rasterization. */
export const GRADIENT_NOISE_MIN = 0;
export const GRADIENT_NOISE_MAX = 100;
export const GRADIENT_NOISE_DEFAULT = 0;

export function normalizeGradientNoise(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GRADIENT_NOISE_DEFAULT;
  return Math.max(GRADIENT_NOISE_MIN, Math.min(GRADIENT_NOISE_MAX, Math.round(value)));
}

function noise(x: number, y: number, channel: number): number {
  const value = Math.sin(x * (12.9898 + channel * 17.131) + y * (78.233 + channel * 9.713) + channel * 37.719) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

/** Return detached RGBA pixels with bounded independent RGB variation. */
export function applyGradientNoise(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4) {
    throw new Error('Invalid gradient noise buffer');
  }
  const noiseAmount = normalizeGradientNoise(amount);
  const result = new Uint8ClampedArray(pixels);
  if (noiseAmount === 0) return result;
  const amplitude = (noiseAmount / GRADIENT_NOISE_MAX) * 42;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (result[offset + 3] === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        result[offset + channel] = Math.max(0, Math.min(255, Math.round(result[offset + channel] + noise(x, y, channel) * amplitude)));
      }
    }
  }
  return result;
}

