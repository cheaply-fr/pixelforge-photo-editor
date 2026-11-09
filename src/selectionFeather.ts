/**
 * Selection feather radius helpers shared by Select > Modify > Feather, the
 * Select and Mask dialog and the Layers panel slider.
 *
 * The radius is stored in the document as a plain number of pixels from 0 to
 * 1,000 with 0.1 px precision, and rendered as the standard deviation of a
 * Gaussian alpha blur: featherAlpha below 16 px, so 1.2 px is visibly
 * between 1 and 2 px, and the canvas blur() filter from 16 px up. No migration is needed: older documents hold whole numbers, which
 * remain valid.
 */
import { selectionDecimal } from './document.ts';

export const MAX_SELECTION_FEATHER = 1000;
export const SELECTION_FEATHER_STEP = 0.1;

/** Round to 0.1 px; NaN when outside 0–1,000 px or not finite. */
export function normalizeSelectionFeather(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_SELECTION_FEATHER)
    return NaN;
  // Rounding through tenths keeps 1.2 stored as 1.2 rather than 1.2000000000000002.
  return Math.round(value * 10) / 10;
}

/**
 * Parse a typed radius. Accepts a decimal point or comma ("1.2" or "1,2");
 * returns null for empty, malformed or out-of-range input.
 */
export function parseSelectionFeather(text: string): number | null {
  const value = normalizeSelectionFeather(selectionDecimal(text));
  return Number.isNaN(value) ? null : value;
}

export function validSelectionFeather(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_SELECTION_FEATHER
  );
}

/** Human-readable radius: "18", "1.2". */
export function formatSelectionFeather(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Radii at or above this use the canvas `blur()` filter, whose box
 * quantisation is small relative to the radius and whose output existing
 * documents already rely on. Smaller (and all fractional sub-16 px) radii use
 * featherAlpha so 1.2 px is distinct from 1 and 2 px.
 */
export const CANVAS_FEATHER_THRESHOLD = 16;

/** Number of extended-box passes per axis; three closely approximate a Gaussian. */
export const FEATHER_BOX_PASSES = 3;

/**
 * Extended box filter for one pass (Gwosdek et al., "Theoretical foundations
 * of Gaussian convolution by extended box filtering", 2011). An ordinary box
 * of integer `radius` is widened by a fractional `alpha` tap on each side so
 * the pass variance is exactly sigma²/passes. A plain integer box cannot do
 * that, and Chromium's canvas `blur()` quantises (1.0–1.3 px render alike),
 * which is why feathering does not use the canvas filter.
 */
export function extendedBoxKernel(
  sigma: number,
  passes = FEATHER_BOX_PASSES,
): { radius: number; alpha: number } {
  const variance = (sigma * sigma) / passes;
  const radius = Math.max(
    0,
    Math.floor(0.5 * Math.sqrt(12 * variance + 1) - 0.5),
  );
  const next = (radius + 1) * (radius + 1);
  const alpha =
    ((2 * radius + 1) * ((radius * (radius + 1)) / 3 - variance)) /
    (2 * (variance - next));
  return { radius, alpha: Math.max(0, Math.min(1, alpha)) };
}

/** One extended-box pass over `length` samples spaced `stride` apart (zero outside). */
function boxPass(
  source: Float32Array,
  target: Float32Array,
  start: number,
  length: number,
  stride: number,
  radius: number,
  alpha: number,
) {
  const weight = 1 / (2 * radius + 1 + 2 * alpha);
  let sum = 0;
  for (let index = 0; index <= Math.min(radius, length - 1); index += 1)
    sum += source[start + index * stride];
  for (let index = 0; index < length; index += 1) {
    const before = index - radius - 1,
      after = index + radius + 1;
    const outer =
      (before >= 0 ? source[start + before * stride] : 0) +
      (after < length ? source[start + after * stride] : 0);
    target[start + index * stride] = weight * (sum + alpha * outer);
    // Slide the inner window: gain `after`, lose `index - radius`.
    if (after < length) sum += source[start + after * stride];
    const leaving = index - radius;
    if (leaving >= 0) sum -= source[start + leaving * stride];
  }
}

/**
 * Gaussian-blur an 8-bit alpha plane with a fractional standard deviation
 * (`sigma` = the feather radius in px). Cost is independent of the radius.
 * Pixels outside the plane count as transparent, like canvas `blur()`.
 */
export function featherAlpha(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  sigma: number,
): Uint8ClampedArray {
  const size = width * height,
    output = new Uint8ClampedArray(size);
  if (!(sigma > 0) || !Number.isFinite(sigma)) {
    for (let index = 0; index < size; index += 1) output[index] = alpha[index];
    return output;
  }
  let current = new Float32Array(size),
    scratch = new Float32Array(size);
  for (let index = 0; index < size; index += 1) current[index] = alpha[index];
  const { radius, alpha: extension } = extendedBoxKernel(sigma);
  for (let pass = 0; pass < FEATHER_BOX_PASSES; pass += 1) {
    for (let row = 0; row < height; row += 1)
      boxPass(current, scratch, row * width, width, 1, radius, extension);
    [current, scratch] = [scratch, current];
  }
  for (let pass = 0; pass < FEATHER_BOX_PASSES; pass += 1) {
    for (let column = 0; column < width; column += 1)
      boxPass(current, scratch, column, height, width, radius, extension);
    [current, scratch] = [scratch, current];
  }
  for (let index = 0; index < size; index += 1)
    output[index] = Math.round(current[index]);
  return output;
}
