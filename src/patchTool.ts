/**
 * Bounded local Patch Tool metadata and renderer.
 *
 * A patch copies a local source neighbourhood to a destination stroke while
 * leaving the immutable raster asset untouched.  This is deliberately a
 * deterministic local operation: it does not infer subjects, synthesize
 * missing content or upload pixels.  The source offset is captured when the
 * user starts a stroke, so every point in that stroke reads the same source
 * neighbourhood relative to its destination.
 */

export const PATCH_TOOL_VERSION = 1 as const;
export const PATCH_MAX_STROKES = 64;
export const PATCH_MAX_POINTS = 4096;
export const PATCH_MAX_SIZE = 10000;
export const PATCH_MAX_OFFSET = 16000;

export type PatchPoint = { x: number; y: number };
export type PatchStroke = {
  version: typeof PATCH_TOOL_VERSION;
  points: PatchPoint[];
  /** Brush diameter in local raster pixels. */
  size: number;
  /** Radial hardness from 0 to 100. */
  hardness: number;
  /** Blend strength from 0 to 1. */
  opacity: number;
  /** Source coordinate minus destination coordinate at pointer-down. */
  sourceOffset: PatchPoint;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const validPoint = (
  point: unknown,
  width?: number,
  height?: number,
): point is PatchPoint => {
  if (
    !point ||
    typeof point !== 'object' ||
    Array.isArray(point) ||
    !finite((point as PatchPoint).x) ||
    !finite((point as PatchPoint).y)
  )
    return false;
  const { x, y } = point as PatchPoint;
  return (
    x >= 0 &&
    y >= 0 &&
    (width === undefined || x < width) &&
    (height === undefined || y < height)
  );
};

export function validPatchStroke(
  value: unknown,
  width?: number,
  height?: number,
): value is PatchStroke {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<PatchStroke>;
  if (
    candidate.version !== PATCH_TOOL_VERSION ||
    !Array.isArray(candidate.points) ||
    candidate.points.length < 1 ||
    candidate.points.length > PATCH_MAX_POINTS ||
    !finite(candidate.size) ||
    candidate.size < 1 ||
    candidate.size > PATCH_MAX_SIZE ||
    !finite(candidate.hardness) ||
    candidate.hardness < 0 ||
    candidate.hardness > 100 ||
    !finite(candidate.opacity) ||
    candidate.opacity < 0 ||
    candidate.opacity > 1
  )
    return false;
  const offset = candidate.sourceOffset;
  if (
    !offset ||
    typeof offset !== 'object' ||
    Array.isArray(offset) ||
    !finite(offset.x) ||
    !finite(offset.y) ||
    Math.abs(offset.x) > PATCH_MAX_OFFSET ||
    Math.abs(offset.y) > PATCH_MAX_OFFSET
  )
    return false;
  return candidate.points.every((point) => validPoint(point, width, height));
}

export function validPatchStrokes(
  value: unknown,
  width?: number,
  height?: number,
): value is PatchStroke[] {
  return (
    Array.isArray(value) &&
    value.length <= PATCH_MAX_STROKES &&
    value.every((stroke) => validPatchStroke(stroke, width, height))
  );
}

function radialCoverage(
  distance: number,
  radius: number,
  hardness: number,
): number {
  if (distance > radius) return 0;
  if (hardness >= 100) return 1;
  const softRadius = radius * (1 - hardness / 100);
  return distance <= radius - softRadius
    ? 1
    : clamp((radius - distance) / Math.max(0.0000001, softRadius), 0, 1);
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function applyStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: PatchStroke,
  selectionMask?: ArrayLike<number>,
): boolean {
  const radius = stroke.size / 2;
  // A stroke must never read pixels it has just written. This also makes a
  // source and destination alias deterministic for repeated renders.
  const samplingSource =
    source === destination ? new Uint8ClampedArray(source) : source;
  const before = destination.slice();
  let changed = false;
  for (const point of stroke.points) {
    const left = Math.max(0, Math.floor(point.x - radius));
    const top = Math.max(0, Math.floor(point.y - radius));
    const right = Math.min(width, Math.floor(point.x + radius) + 1);
    const bottom = Math.min(height, Math.floor(point.y + radius) + 1);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const coverage = radialCoverage(
          Math.hypot(x - point.x, y - point.y),
          radius,
          stroke.hardness,
        );
        if (coverage <= 0) continue;
        if (selectionMask && selectionMask[y * width + x] <= 0) continue;
        const sourceX = Math.round(x + stroke.sourceOffset.x);
        const sourceY = Math.round(y + stroke.sourceOffset.y);
        if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height)
          continue;
        const destinationOffset = pixelOffset(width, x, y);
        const sourceOffset = pixelOffset(width, sourceX, sourceY);
        const amount = clamp(coverage * stroke.opacity, 0, 1);
        // Patch is an RGB retouch. Alpha remains owned by the layer mask and
        // is preserved byte-for-byte, including partially transparent pixels.
        for (let channel = 0; channel < 3; channel += 1)
          destination[destinationOffset + channel] = Math.round(
            before[destinationOffset + channel] * (1 - amount) +
              samplingSource[sourceOffset + channel] * amount,
          );
        destination[destinationOffset + 3] = before[destinationOffset + 3];
        if (destination[destinationOffset + 3] === 0) {
          destination[destinationOffset] = 0;
          destination[destinationOffset + 1] = 0;
          destination[destinationOffset + 2] = 0;
        }
        changed = true;
      }
    }
  }
  return changed;
}

/** Apply one source-offset patch to an RGBA destination in-place. */
export function applyPatchStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: PatchStroke,
  selectionMask?: ArrayLike<number>,
): boolean {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error('Patch canvas dimensions are invalid');
  if (
    destination.length !== width * height * 4 ||
    source.length !== width * height * 4
  )
    throw new Error('Patch source and destination must contain RGBA data');
  if (selectionMask && selectionMask.length !== width * height)
    throw new Error('Patch selection mask has the wrong size');
  if (!validPatchStroke(stroke, width, height))
    throw new Error('Patch stroke is invalid');
  return applyStroke(destination, source, width, height, stroke, selectionMask);
}

/** Render all nondestructive patch metadata over an immutable RGBA source. */
export function applyPatchStrokes(
  source: ArrayLike<number>,
  width: number,
  height: number,
  strokes: readonly PatchStroke[] | undefined,
  selectionMask?: ArrayLike<number>,
): Uint8ClampedArray {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error('Patch canvas dimensions are invalid');
  if (source.length !== width * height * 4)
    throw new Error('Patch source must contain RGBA data');
  if (!validPatchStrokes(strokes ?? [], width, height))
    throw new Error('Patch strokes are invalid');
  if (selectionMask && selectionMask.length !== width * height)
    throw new Error('Patch selection mask has the wrong size');
  const output = new Uint8ClampedArray(source);
  for (const stroke of strokes ?? [])
    applyStroke(output, output, width, height, stroke, selectionMask);
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] === 0)
      output[offset] = output[offset + 1] = output[offset + 2] = 0;
  }
  return output;
}
