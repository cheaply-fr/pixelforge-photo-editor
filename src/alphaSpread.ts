/**
 * Premultiplied ("alpha-spreading") output for the Blur, Blur More, Box,
 * Gaussian, Motion and Lens Blur kernels.
 *
 * Those kernels accumulate, per destination pixel, `weight = Σ a·k` (alpha
 * times kernel tap) and `colour = Σ c·a·k` over the taps that fall inside the
 * image, plus the in-image kernel mass `coverage = Σ k` expressed in the same
 * units as `weight` (so a fully opaque neighbourhood has weight ≈ coverage).
 * The blurred alpha is `weight / coverage` and the blurred premultiplied
 * colour is `colour / coverage`; both blend with the source by `mix` in
 * premultiplied space. A painted stroke on a transparent layer therefore
 * softens and widens with the radius instead of keeping a hard alpha edge.
 *
 * An opaque pixel in an opaque neighbourhood keeps exactly the historical
 * arithmetic (`c·(1 - mix) + colour / weight · mix`, alpha 255), so a photo
 * renders byte-for-byte as before. Image edges keep their renormalised
 * ("absent sample") behaviour, so a full-canvas layer does not gain a
 * transparent fringe. Pixels whose output alpha rounds to zero keep their
 * source colour bytes (hidden RGB padding included) with alpha 0.
 */

const clampByte = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));
/** Relative slack for "fully covered" (floating sums of identical weights). */
const OPAQUE_EPSILON = 1e-9;

function opaqueNeighbourhood(sourceAlpha: number, weight: number, coverage: number): boolean {
  return sourceAlpha === 255 && weight >= coverage * (1 - OPAQUE_EPSILON);
}

/** Output alpha byte for a spread blur. */
export function spreadAlphaByte(sourceAlpha: number, weight: number, coverage: number, mix: number): number {
  if (opaqueNeighbourhood(sourceAlpha, weight, coverage)) return 255;
  const blurred = coverage > 0 ? Math.min(1, Math.max(0, weight / coverage)) : sourceAlpha / 255;
  return clampByte(((sourceAlpha / 255) * (1 - mix) + blurred * mix) * 255);
}

/**
 * Output byte of one colour channel for a spread blur, or -1 when the output
 * alpha rounds to zero (the caller keeps the source byte). `colour` is the
 * colour sum in the same units as `weight`.
 */
export function spreadChannel(
  sourceColor: number,
  sourceAlpha: number,
  colour: number,
  weight: number,
  coverage: number,
  mix: number,
): number {
  if (opaqueNeighbourhood(sourceAlpha, weight, coverage))
    return clampByte(sourceColor * (1 - mix) + (colour / weight) * mix);
  if (spreadAlphaByte(sourceAlpha, weight, coverage, mix) === 0) return -1;
  // Premultiplied blend, scaled by `coverage` so mix = 1 reduces exactly to
  // colour / weight (the historical value for any covered pixel).
  const keep = (sourceAlpha / 255) * (1 - mix) * (coverage > 0 ? coverage : 1);
  const denominator = keep + weight * mix;
  if (!(denominator > 0)) return -1;
  return clampByte((sourceColor * keep + colour * mix) / denominator);
}

/**
 * Write all four channels of a spread-blurred pixel. `red`, `green` and `blue`
 * are colour sums in the same units as `weight`.
 */
export function writeSpreadPixel(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
  weight: number,
  coverage: number,
  mix: number,
): void {
  const sourceAlpha = source[offset + 3],
    alpha = spreadAlphaByte(sourceAlpha, weight, coverage, mix);
  output[offset + 3] = alpha;
  if (!alpha) return;
  const r = spreadChannel(source[offset], sourceAlpha, red, weight, coverage, mix),
    g = spreadChannel(source[offset + 1], sourceAlpha, green, weight, coverage, mix),
    b = spreadChannel(source[offset + 2], sourceAlpha, blue, weight, coverage, mix);
  if (r >= 0) output[offset] = r;
  if (g >= 0) output[offset + 1] = g;
  if (b >= 0) output[offset + 2] = b;
}

/** Number of in-image taps of a centred running box of half-width `half`. */
export function boxCoverage(index: number, length: number, half: number): number {
  return Math.min(length - 1, index + half) - Math.max(0, index - half) + 1;
}
