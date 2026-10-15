import { applyContentAwareFill, type ContentAwareFill } from './contentAwareCleanup.ts';

export const CONTENT_AWARE_MOVE_VERSION = 1 as const;
export const CONTENT_AWARE_MOVE_MAX_OFFSET = 4096;
export const CONTENT_AWARE_MOVE_MAX_OPERATIONS = 16;

export type ContentAwareMove = {
  version: typeof CONTENT_AWARE_MOVE_VERSION;
  /** Optional layer-local selection mask asset for persisted operations. */
  mask?: string;
  dx: number;
  dy: number;
  radius: number;
  opacity: number;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function validContentAwareMove(value: unknown): value is ContentAwareMove {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ContentAwareMove>;
  const radius = candidate.radius;
  if (
    candidate.mask !== undefined &&
    (typeof candidate.mask !== 'string' || !/^[a-z\d-]{1,160}$/i.test(candidate.mask))
  )
    return false;
  if (typeof radius !== 'number' || !Number.isInteger(radius) || radius < 1 || radius > 128) return false;
  return (
    candidate.version === CONTENT_AWARE_MOVE_VERSION &&
    finite(candidate.dx) && Math.abs(candidate.dx) <= CONTENT_AWARE_MOVE_MAX_OFFSET &&
    finite(candidate.dy) && Math.abs(candidate.dy) <= CONTENT_AWARE_MOVE_MAX_OFFSET &&
    finite(candidate.opacity) && candidate.opacity >= 0 && candidate.opacity <= 1
  );
}

export function moveContentAwareSelection(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  mask: ArrayLike<number>,
  move: ContentAwareMove,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Content-aware move dimensions are invalid');
  if (source.length !== width * height * 4 || mask.length !== width * height)
    throw new Error('Content-aware move buffers have invalid sizes');
  if (!validContentAwareMove(move)) throw new Error('Content-aware move is invalid');
  const original = new Uint8ClampedArray(source);
  const result = new Uint8ClampedArray(source);
  const fill: ContentAwareFill = {
    version: 1,
    mask: 'move-selection',
    radius: move.radius,
    opacity: move.opacity,
  };
  // Fill the old selection from immutable nearby context before translating it.
  applyContentAwareFill(result, original, width, height, mask, fill);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = mask[y * width + x] ?? 0;
      if (alpha <= 0) continue;
      const destinationX = Math.round(x + move.dx);
      const destinationY = Math.round(y + move.dy);
      if (destinationX < 0 || destinationY < 0 || destinationX >= width || destinationY >= height) continue;
      const sourceOffset = (y * width + x) * 4;
      const destinationOffset = (destinationY * width + destinationX) * 4;
      const amount = Math.max(0, Math.min(1, alpha / 255));
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
