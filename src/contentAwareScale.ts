import { applyContentAwareFill, type ContentAwareFill } from './contentAwareCleanup.ts';

export const CONTENT_AWARE_SCALE_VERSION = 1 as const;
export const CONTENT_AWARE_SCALE_MIN_PERCENT = 25;
export const CONTENT_AWARE_SCALE_MAX_PERCENT = 400;
export const CONTENT_AWARE_SCALE_MAX_OPERATIONS = 16;

export type ContentAwareScale = {
  version: typeof CONTENT_AWARE_SCALE_VERSION;
  /** Optional layer-local selection mask asset for persisted operations. */
  mask?: string;
  scaleX: number;
  scaleY: number;
  radius: number;
  opacity: number;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function validContentAwareScale(value: unknown): value is ContentAwareScale {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ContentAwareScale>;
  const radius = candidate.radius;
  if (
    candidate.mask !== undefined &&
    (typeof candidate.mask !== 'string' || !/^[a-z\d-]{1,160}$/i.test(candidate.mask))
  )
    return false;
  return candidate.version === CONTENT_AWARE_SCALE_VERSION &&
    finite(candidate.scaleX) && candidate.scaleX >= CONTENT_AWARE_SCALE_MIN_PERCENT / 100 && candidate.scaleX <= CONTENT_AWARE_SCALE_MAX_PERCENT / 100 &&
    finite(candidate.scaleY) && candidate.scaleY >= CONTENT_AWARE_SCALE_MIN_PERCENT / 100 && candidate.scaleY <= CONTENT_AWARE_SCALE_MAX_PERCENT / 100 &&
    typeof radius === 'number' && Number.isInteger(radius) && radius >= 1 && radius <= 128 &&
    finite(candidate.opacity) && candidate.opacity >= 0 && candidate.opacity <= 1;
}

/** Scale an explicit selection around its bounds after filling the source hole locally. */
export function scaleContentAwareSelection(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  mask: ArrayLike<number>,
  scale: ContentAwareScale,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Content-aware scale dimensions are invalid');
  if (source.length !== width * height * 4 || mask.length !== width * height)
    throw new Error('Content-aware scale buffers have invalid sizes');
  if (!validContentAwareScale(scale)) throw new Error('Content-aware scale is invalid');
  const original = new Uint8ClampedArray(source);
  const result = new Uint8ClampedArray(source);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((mask[y * width + x] ?? 0) <= 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return result;
  const fill: ContentAwareFill = {
    version: 1,
    mask: 'scale-selection',
    radius: scale.radius,
    opacity: scale.opacity,
  };
  applyContentAwareFill(result, original, width, height, mask, fill);
  const sourceWidth = right - left + 1;
  const sourceHeight = bottom - top + 1;
  const centreX = (left + right) / 2;
  const centreY = (top + bottom) / 2;
  const destinationWidth = Math.max(1, Math.round(sourceWidth * scale.scaleX));
  const destinationHeight = Math.max(1, Math.round(sourceHeight * scale.scaleY));
  const destinationLeft = Math.round(centreX - (destinationWidth - 1) / 2);
  const destinationTop = Math.round(centreY - (destinationHeight - 1) / 2);
  for (let y = 0; y < destinationHeight; y += 1) {
    const destinationY = destinationTop + y;
    if (destinationY < 0 || destinationY >= height) continue;
    const sourceY = Math.max(top, Math.min(bottom, Math.round(top + (y + 0.5) / scale.scaleY - 0.5)));
    for (let x = 0; x < destinationWidth; x += 1) {
      const destinationX = destinationLeft + x;
      if (destinationX < 0 || destinationX >= width) continue;
      const sourceX = Math.max(left, Math.min(right, Math.round(left + (x + 0.5) / scale.scaleX - 0.5)));
      const sourceIndex = sourceY * width + sourceX;
      const amount = Math.max(0, Math.min(1, (mask[sourceIndex] ?? 0) / 255));
      if (amount <= 0) continue;
      const sourceOffset = sourceIndex * 4;
      const destinationOffset = (destinationY * width + destinationX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        result[destinationOffset + channel] = Math.round(
          result[destinationOffset + channel] * (1 - amount) + original[sourceOffset + channel] * amount,
        );
      }
    }
  }
  for (let offset = 0; offset < result.length; offset += 4) {
    if (result[offset + 3] === 0) result[offset] = result[offset + 1] = result[offset + 2] = 0;
  }
  return result;
}

