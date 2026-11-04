/**
 * Confine whole-layer raster edits (Gradient, Fill) to the active selection,
 * as Photoshop does. The edit is rendered over the full layer as before, then
 * blended back with the original pixels by the layer-space selection mask
 * (0–255 per pixel), so feathered selections fade the edit in smoothly.
 */

/**
 * Mix `edited` into `original` by `mask`, in place on a new array:
 * mask 255 keeps the edit, 0 keeps the original, values between blend.
 * Throws if the buffers do not describe the same number of pixels.
 */
export function mixByMask(
  original: Uint8ClampedArray,
  edited: Uint8ClampedArray,
  mask: Uint8ClampedArray,
): Uint8ClampedArray {
  if (original.length !== edited.length || original.length !== mask.length * 4)
    throw new Error('Selection mask does not match the layer size');
  const out = new Uint8ClampedArray(original.length);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const weight = mask[pixel] / 255;
    const offset = pixel * 4;
    if (weight === 0) {
      out[offset] = original[offset];
      out[offset + 1] = original[offset + 1];
      out[offset + 2] = original[offset + 2];
      out[offset + 3] = original[offset + 3];
      continue;
    }
    if (weight === 1) {
      out[offset] = edited[offset];
      out[offset + 1] = edited[offset + 1];
      out[offset + 2] = edited[offset + 2];
      out[offset + 3] = edited[offset + 3];
      continue;
    }
    // Blend in premultiplied space so a transparent original does not darken
    // the edge of a feathered edit, then convert back to straight alpha.
    const a0 = original[offset + 3] / 255, a1 = edited[offset + 3] / 255;
    const alpha = a0 + (a1 - a0) * weight;
    out[offset + 3] = Math.round(alpha * 255);
    for (let channel = 0; channel < 3; channel += 1) {
      const premultiplied = original[offset + channel] * a0 * (1 - weight) + edited[offset + channel] * a1 * weight;
      out[offset + channel] = alpha > 0 ? Math.round(premultiplied / alpha) : 0;
    }
  }
  return out;
}

/** Selection coverage at a layer-space point (0 outside the layer). */
export function maskCoverageAt(mask: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const px = Math.floor(x), py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return 0;
  return mask[py * width + px];
}
