/**
 * Blend the result of the most recent raster edit with the previous raster
 * state.  Photoshop's Fade is a post-operation opacity control; this bounded
 * local contract keeps the previous state immutable and mixes all RGBA
 * channels deterministically.
 */
export function applyFadePixels(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
  amount: number,
): Uint8ClampedArray {
  if (previous.length !== current.length || previous.length % 4 !== 0)
    throw new Error('Fade buffers must contain matching complete RGBA pixels');
  if (!Number.isFinite(amount) || amount < 0 || amount > 100)
    throw new RangeError('Fade amount must be between 0 and 100');
  const strength = amount / 100;
  const output = new Uint8ClampedArray(current.length);
  for (let index = 0; index < output.length; index += 1)
    output[index] = Math.round(previous[index] * (1 - strength) + current[index] * strength);
  return output;
}
