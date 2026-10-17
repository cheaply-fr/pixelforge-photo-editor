export type HistogramChannel = 'red' | 'green' | 'blue' | 'luminance';

export type HistogramData = {
  red: number[];
  green: number[];
  blue: number[];
  luminance: number[];
  visiblePixels: number;
  alphaSum: number;
  minimum: number;
  maximum: number;
  mean: number;
};

const bins = () => Array.from({ length: 256 }, () => 0);

/**
 * Build a display-safe histogram from a rendered RGBA composite.
 * Fully transparent pixels are excluded from colour statistics because their
 * RGB bytes are intentionally hidden implementation detail. Partial alpha is
 * retained in the alpha total but contributes one visible sample, keeping the
 * result stable across browser premultiplication differences.
 */
export function buildHistogram(pixels: Uint8Array | Uint8ClampedArray): HistogramData {
  if (pixels.length === 0 || pixels.length % 4 !== 0)
    throw new Error('Histogram input must contain complete RGBA pixels');
  const red = bins(), green = bins(), blue = bins(), luminance = bins();
  let visiblePixels = 0;
  let alphaSum = 0;
  let minimum = 255;
  let maximum = 0;
  let sum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const alpha = pixels[index + 3];
    alphaSum += alpha;
    if (alpha === 0) continue;
    const y = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    red[r] += 1;
    green[g] += 1;
    blue[b] += 1;
    luminance[y] += 1;
    minimum = Math.min(minimum, y);
    maximum = Math.max(maximum, y);
    sum += y;
    visiblePixels += 1;
  }
  return {
    red,
    green,
    blue,
    luminance,
    visiblePixels,
    alphaSum,
    minimum: visiblePixels ? minimum : 0,
    maximum: visiblePixels ? maximum : 0,
    mean: visiblePixels ? sum / visiblePixels : 0,
  };
}

export function histogramPeak(values: readonly number[]): number {
  if (values.length !== 256) throw new Error('Histogram channels must contain 256 bins');
  return values.reduce((peak, value) => Math.max(peak, value), 0);
}

