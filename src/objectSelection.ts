/**
 * Deterministic local Object Selection proxy.
 *
 * A click grows the connected opaque region whose RGB channels remain within
 * the configured tolerance of the clicked pixel. This gives illustrations and
 * flat product artwork a useful object-selection workflow without claiming
 * semantic recognition, uploading pixels, or mutating the source.
 */

export type ObjectSelectionOptions = {
  width: number;
  height: number;
  x: number;
  y: number;
  tolerance?: number;
  softness?: number;
};

export const objectSelectionBounds = {
  maxPixels: 16_000_000,
  maxDimension: 16_000,
  maxTolerance: 255,
  maxSoftness: 255,
  maxRegionPixels: 2_000_000,
} as const;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function validateSource(source: ArrayLike<number>, width: number, height: number): void {
  if (!source || source.length !== width * height * 4)
    throw new Error('Object Selection source must contain RGBA data for every pixel');
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index];
    if (!finite(value) || value < 0 || value > 255)
      throw new Error('Object Selection source contains invalid RGBA channels');
  }
}

function coverage(distance: number, tolerance: number, softness: number): number {
  if (softness === 0) return distance <= tolerance ? 255 : 0;
  return Math.round(clamp(((tolerance + softness - distance) / softness) * 255, 0, 255));
}

/** Return a new canvas-sized alpha mask for the clicked connected object. */
export function objectSelectionMask(
  source: ArrayLike<number>,
  options: ObjectSelectionOptions,
): Uint8ClampedArray {
  const { width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > objectSelectionBounds.maxDimension || height > objectSelectionBounds.maxDimension ||
      width * height > objectSelectionBounds.maxPixels)
    throw new Error('Object Selection canvas dimensions are invalid');
  validateSource(source, width, height);
  if (!finite(options.x) || !finite(options.y) || options.x < 0 || options.x >= width || options.y < 0 || options.y >= height)
    throw new Error('Object Selection point is outside the canvas');
  const tolerance = options.tolerance ?? 32;
  const softness = options.softness ?? 0;
  if (!finite(tolerance) || tolerance < 0 || tolerance > objectSelectionBounds.maxTolerance)
    throw new Error('Object Selection tolerance must be between 0 and 255');
  if (!finite(softness) || softness < 0 || softness > objectSelectionBounds.maxSoftness)
    throw new Error('Object Selection softness must be between 0 and 255');
  const seedX = Math.floor(options.x), seedY = Math.floor(options.y);
  const seedOffset = (seedY * width + seedX) * 4;
  if (source[seedOffset + 3] === 0) return new Uint8ClampedArray(width * height);
  const target = [source[seedOffset], source[seedOffset + 1], source[seedOffset + 2]];
  const output = new Uint8ClampedArray(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0, grown = 0;
  queue[tail++] = seedY * width + seedX;
  const enqueue = (index: number) => {
    if (tail < queue.length) queue[tail++] = index;
  };
  while (head < tail && grown < objectSelectionBounds.maxRegionPixels) {
    const index = queue[head++];
    if (visited[index]) continue;
    visited[index] = 1;
    const offset = index * 4;
    const alpha = source[offset + 3];
    if (alpha === 0) continue;
    const distance = Math.max(
      Math.abs(source[offset] - target[0]),
      Math.abs(source[offset + 1] - target[1]),
      Math.abs(source[offset + 2] - target[2]),
    );
    if (distance > tolerance + softness) continue;
    output[index] = Math.round((coverage(distance, tolerance, softness) * alpha) / 255);
    grown += 1;
    const x = index % width, y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  return output;
}
