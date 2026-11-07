import { BRUSH_SCATTER_MAX, normalizeBrushScatter } from './brushDynamics.ts';

/**
 * Confine raster edits to the active selection, as Photoshop does. Whole-layer
 * edits (Gradient, Fill) are rendered over the full layer as before, then
 * blended back with the original pixels by the layer-space selection mask
 * (0–255 per pixel), so feathered selections fade the edit in smoothly.
 * Brush-family strokes are painted into an unconfined copy and only the
 * rectangle each segment touched is blended back (`mixRectByMask`), so a
 * stroke on a multi-megapixel layer never reprocesses the whole layer.
 */

export type PixelRect = { x: number; y: number; width: number; height: number };

/**
 * Blend one pixel: weight 1 keeps the edit, 0 keeps the original. Partial
 * weights mix in premultiplied space so a transparent original does not darken
 * the edge of a feathered edit, then convert back to straight alpha.
 */
function mixPixel(
  out: Uint8ClampedArray,
  outOffset: number,
  original: Uint8ClampedArray,
  originalOffset: number,
  edited: Uint8ClampedArray,
  editedOffset: number,
  coverage: number,
) {
  if (coverage === 0) {
    out[outOffset] = original[originalOffset];
    out[outOffset + 1] = original[originalOffset + 1];
    out[outOffset + 2] = original[originalOffset + 2];
    out[outOffset + 3] = original[originalOffset + 3];
    return;
  }
  if (coverage === 255) {
    out[outOffset] = edited[editedOffset];
    out[outOffset + 1] = edited[editedOffset + 1];
    out[outOffset + 2] = edited[editedOffset + 2];
    out[outOffset + 3] = edited[editedOffset + 3];
    return;
  }
  const weight = coverage / 255;
  const a0 = original[originalOffset + 3] / 255, a1 = edited[editedOffset + 3] / 255;
  const alpha = a0 + (a1 - a0) * weight;
  out[outOffset + 3] = Math.round(alpha * 255);
  for (let channel = 0; channel < 3; channel += 1) {
    const premultiplied = original[originalOffset + channel] * a0 * (1 - weight) + edited[editedOffset + channel] * a1 * weight;
    out[outOffset + channel] = alpha > 0 ? Math.round(premultiplied / alpha) : 0;
  }
}

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
  for (let pixel = 0; pixel < mask.length; pixel += 1)
    mixPixel(out, pixel * 4, original, pixel * 4, edited, pixel * 4, mask[pixel]);
  return out;
}

/** Selection coverage at a layer-space point (0 outside the layer). */
export function maskCoverageAt(mask: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const px = Math.floor(x), py = Math.floor(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return 0;
  return mask[py * width + px];
}

/**
 * Mix one rectangle of an unconfined edit back over the original layer.
 * `original` and `mask` cover the whole layer (`layerWidth` wide); `edited`
 * and the result cover only `rect`. Pixels outside the selection come back
 * unchanged and feathered coverage blends proportionally, exactly as
 * `mixByMask` would for the same pixels.
 */
export function mixRectByMask(
  original: Uint8ClampedArray,
  edited: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  layerWidth: number,
  rect: PixelRect,
): Uint8ClampedArray {
  const layerHeight = layerWidth > 0 ? mask.length / layerWidth : 0;
  if (
    !Number.isInteger(layerWidth) || layerWidth <= 0 || !Number.isInteger(layerHeight) ||
    original.length !== mask.length * 4 ||
    !Number.isInteger(rect.x) || !Number.isInteger(rect.y) ||
    !Number.isInteger(rect.width) || !Number.isInteger(rect.height) ||
    rect.x < 0 || rect.y < 0 || rect.width < 0 || rect.height < 0 ||
    rect.x + rect.width > layerWidth || rect.y + rect.height > layerHeight ||
    edited.length !== rect.width * rect.height * 4
  )
    throw new Error('Selection mask does not match the edited rectangle');
  const out = new Uint8ClampedArray(edited.length);
  for (let row = 0; row < rect.height; row += 1) {
    const layerRow = (rect.y + row) * layerWidth + rect.x;
    for (let column = 0; column < rect.width; column += 1) {
      const layerPixel = layerRow + column, rectOffset = (row * rect.width + column) * 4;
      mixPixel(out, rectOffset, original, layerPixel * 4, edited, rectOffset, mask[layerPixel]);
    }
  }
  return out;
}

/**
 * Furthest distance (in layer pixels) a brush dab can reach from its stroke
 * point: the stamp radius, the largest scatter offset, and a pixel of
 * anti-aliasing margin. Pressure only shrinks the stamp, so `size` bounds it.
 */
export function brushStampReach(size: number, scatter = 0): number {
  const safeSize = Number.isFinite(size) ? Math.max(1, size) : 1;
  return safeSize / 2 + safeSize * 0.75 * (normalizeBrushScatter(scatter) / BRUSH_SCATTER_MAX) + 2;
}

/**
 * Layer-space rectangle a segment of dabs can touch, clamped to the layer;
 * null when it lies entirely outside the layer.
 */
export function brushSegmentRect(
  from: { x: number; y: number },
  to: { x: number; y: number },
  reach: number,
  width: number,
  height: number,
): PixelRect | null {
  if (![from.x, from.y, to.x, to.y, reach].every(Number.isFinite)) return null;
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - reach)),
    top = Math.max(0, Math.floor(Math.min(from.y, to.y) - reach)),
    right = Math.min(width, Math.ceil(Math.max(from.x, to.x) + reach) + 1),
    bottom = Math.min(height, Math.ceil(Math.max(from.y, to.y) + reach) + 1);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
