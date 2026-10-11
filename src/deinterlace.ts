/** Spatial field reconstruction for a single raster, with no temporal inference. */
export type DeinterlaceSettings = {
  /** First field contains zero-based rows 0, 2, 4; second contains 1, 3, 5. */
  keep: 'first' | 'second';
  method: 'interpolate' | 'duplicate';
};

export const DEFAULT_DEINTERLACE_SETTINGS: DeinterlaceSettings = {
  keep: 'first',
  method: 'interpolate',
};

export function validDeinterlaceSettings(value: unknown): value is DeinterlaceSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Partial<DeinterlaceSettings>;
  return (settings.keep === 'first' || settings.keep === 'second') &&
    (settings.method === 'interpolate' || settings.method === 'duplicate');
}

export function effectiveDeinterlaceSettings(
  value?: Partial<DeinterlaceSettings>,
): DeinterlaceSettings {
  return {
    keep: value?.keep === 'second' ? 'second' : 'first',
    method: value?.method === 'duplicate' ? 'duplicate' : 'interpolate',
  };
}

/**
 * Reconstruct discarded rows from immutable adjacent retained rows. At an
 * image boundary use the sole retained neighbour; duplication prefers the
 * upper neighbour. Interpolation weights RGB by source alpha, preserves the
 * destination alpha, and leaves hidden transparent RGB and retained rows
 * untouched. A one-row image with no retained field is a detached identity.
 * Work is O(width * height), with one output buffer and constant scratch space.
 */
export function deinterlacePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  settings: DeinterlaceSettings,
  amount = 100,
): Uint8ClampedArray {
  if (!(source instanceof Uint8ClampedArray)) throw new TypeError('Invalid de-interlace pixels');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    width > 16000 || height > 16000 || width * height > 16000000 ||
    source.length !== width * height * 4)
    throw new RangeError('Invalid de-interlace dimensions');
  if (!validDeinterlaceSettings(settings)) throw new TypeError('Invalid de-interlace settings');
  if (!Number.isFinite(amount) || amount < 0 || amount > 100)
    throw new RangeError('Invalid de-interlace amount');
  const output = new Uint8ClampedArray(source);
  if (amount === 0 || height === 1) return output;
  const discardedParity = settings.keep === 'first' ? 1 : 0;
  const strength = amount / 100;
  for (let y = discardedParity; y < height; y += 2) {
    const above = y > 0 ? y - 1 : y + 1;
    const below = y + 1 < height ? y + 1 : above;
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      const top = (above * width + x) * 4;
      const bottom = (below * width + x) * 4;
      const topAlpha = source[top + 3];
      const bottomAlpha = settings.method === 'duplicate' ? 0 : source[bottom + 3];
      const weight = topAlpha + bottomAlpha;
      if (weight === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const reconstructed = (source[top + channel] * topAlpha +
          source[bottom + channel] * bottomAlpha) / weight;
        output[destination + channel] = Math.round(source[destination + channel] *
          (1 - strength) + reconstructed * strength);
      }
    }
  }
  return output;
}
