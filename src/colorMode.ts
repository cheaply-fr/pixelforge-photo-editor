export const COLOR_MODES = ['rgb', 'grayscale'] as const;
export type ColorMode = (typeof COLOR_MODES)[number];
export const DEFAULT_COLOR_MODE: ColorMode = 'rgb';

export function normalizeColorMode(value: unknown): ColorMode {
  return COLOR_MODES.includes(value as ColorMode)
    ? (value as ColorMode)
    : DEFAULT_COLOR_MODE;
}

/** Convert a rendered RGBA buffer to a bounded grayscale working mode. */
export function applyColorModePixels(
  source: Uint8ClampedArray,
  mode: unknown,
): Uint8ClampedArray {
  if (source.length % 4 !== 0) throw new Error('Invalid RGBA buffer');
  const normalized = normalizeColorMode(mode);
  const output = new Uint8ClampedArray(source);
  if (normalized === 'rgb') return output;
  for (let pixel = 0; pixel < output.length; pixel += 4) {
    const luminance = Math.round(
      output[pixel] * 0.2126 +
        output[pixel + 1] * 0.7152 +
        output[pixel + 2] * 0.0722,
    );
    output[pixel] = luminance;
    output[pixel + 1] = luminance;
    output[pixel + 2] = luminance;
  }
  return output;
}
