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
  /** Optional layer-local selection-mask asset captured at pointer-down. */
  selectionMask?: string;
  /**
   * Selection workflow (absent for brush-style strokes). The selection mask
   * is the patch region and `sourceOffset` is source minus destination:
   * - `source`: the selection is replaced by pixels from where it was dragged
   *   to, shifted by the median colour difference between the two regions'
   *   surrounding rings (a bounded tone match, not Photoshop healing).
   * - `destination`: the selected pixels are copied, unchanged, to where the
   *   selection was dragged; the region there is the mask moved by the drag.
   * `points` holds the press point; `size` and `hardness` are unused.
   */
  region?: PatchRegionMode;
};

export const PATCH_REGION_MODES = ['source', 'destination'] as const;
export type PatchRegionMode = (typeof PATCH_REGION_MODES)[number];

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
  if (
    candidate.selectionMask !== undefined &&
    (typeof candidate.selectionMask !== 'string' ||
      !/^[a-z\d-]{1,160}$/i.test(candidate.selectionMask))
  )
    return false;
  if (
    candidate.region !== undefined &&
    (!(PATCH_REGION_MODES as readonly string[]).includes(candidate.region as string) ||
      candidate.selectionMask === undefined)
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

/**
 * Per-channel median RGB of visible pixels in a 2 px ring just outside the
 * mask (shifted by `dx`, `dy`). The median ignores a minority of ring pixels
 * on an object that crosses the selection edge.
 */
function ringMedian(
  source: ArrayLike<number>,
  width: number,
  height: number,
  mask: ArrayLike<number>,
  bounds: { left: number; top: number; right: number; bottom: number },
  dx: number,
  dy: number,
): [number, number, number] | null {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] >= 128;
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let y = Math.max(0, bounds.top - 2); y <= Math.min(height - 1, bounds.bottom + 2); y += 1)
    for (let x = Math.max(0, bounds.left - 2); x <= Math.min(width - 1, bounds.right + 2); x += 1) {
      if (inside(x, y)) continue;
      if (!(inside(x - 2, y) || inside(x + 2, y) || inside(x, y - 2) || inside(x, y + 2))) continue;
      const sx = x + dx, sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const offset = pixelOffset(width, sx, sy);
      if (source[offset + 3] <= 0) continue;
      for (let channel = 0; channel < 3; channel += 1) channels[channel].push(source[offset + channel]);
    }
  if (!channels[0].length) return null;
  return channels.map((values) => {
    values.sort((a, b) => a - b);
    return values[values.length >> 1];
  }) as [number, number, number];
}

/** Selection-workflow patch: see `PatchStroke.region`. */
function applyRegionStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: PatchStroke,
  mask: ArrayLike<number>,
): boolean {
  const samplingSource = source === destination ? new Uint8ClampedArray(source) : source,
    offsetX = Math.round(stroke.sourceOffset.x),
    offsetY = Math.round(stroke.sourceOffset.y);
  if (!offsetX && !offsetY) return false;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (mask[y * width + x] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  if (right < 0) return false;
  const bounds = { left, top, right, bottom };
  // Source mode writes inside the mask; Destination writes inside the mask
  // moved by the drag (the mask is read back at destination + offset).
  const maskShiftX = stroke.region === 'destination' ? offsetX : 0,
    maskShiftY = stroke.region === 'destination' ? offsetY : 0;
  let shift: [number, number, number] = [0, 0, 0];
  if (stroke.region === 'source') {
    const around = ringMedian(samplingSource, width, height, mask, bounds, 0, 0),
      donor = ringMedian(samplingSource, width, height, mask, bounds, offsetX, offsetY);
    if (around && donor) shift = [around[0] - donor[0], around[1] - donor[1], around[2] - donor[2]];
  }
  const x0 = Math.max(0, left - maskShiftX), x1 = Math.min(width - 1, right - maskShiftX),
    y0 = Math.max(0, top - maskShiftY), y1 = Math.min(height - 1, bottom - maskShiftY);
  let changed = false;
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      const coverage = mask[(y + maskShiftY) * width + x + maskShiftX] / 255;
      if (coverage <= 0) continue;
      const sourceX = x + offsetX, sourceY = y + offsetY;
      if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) continue;
      const target = pixelOffset(width, x, y), from = pixelOffset(width, sourceX, sourceY),
        amount = clamp(coverage * stroke.opacity, 0, 1);
      for (let channel = 0; channel < 3; channel += 1)
        destination[target + channel] = Math.round(
          destination[target + channel] * (1 - amount) +
            clamp(samplingSource[from + channel] + shift[channel], 0, 255) * amount,
        );
      if (destination[target + 3] === 0)
        destination[target] = destination[target + 1] = destination[target + 2] = 0;
      changed = true;
    }
  return changed;
}

function applyStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: PatchStroke,
  selectionMask?: ArrayLike<number>,
): boolean {
  if (stroke.region) {
    if (!selectionMask) throw new Error('Patch selection mask is unavailable');
    return applyRegionStroke(destination, source, width, height, stroke, selectionMask);
  }
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
        const selected = selectionMask ? selectionMask[y * width + x] / 255 : 1;
        if (selected <= 0) continue;
        const sourceX = Math.round(x + stroke.sourceOffset.x);
        const sourceY = Math.round(y + stroke.sourceOffset.y);
        if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height)
          continue;
        const destinationOffset = pixelOffset(width, x, y);
        const sourceOffset = pixelOffset(width, sourceX, sourceY);
        const amount = clamp(coverage * stroke.opacity * selected, 0, 1);
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
  selectionMasks?: Readonly<Record<string, ArrayLike<number>>> | ArrayLike<number>,
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
  const output = new Uint8ClampedArray(source);
  for (const stroke of strokes ?? []) {
    const selectionMask = stroke.selectionMask
      ? selectionMasks && !Array.isArray(selectionMasks) && !ArrayBuffer.isView(selectionMasks)
        ? (selectionMasks as Readonly<Record<string, ArrayLike<number>>>)[stroke.selectionMask]
        : undefined
      : Array.isArray(selectionMasks) || ArrayBuffer.isView(selectionMasks)
        ? selectionMasks
        : undefined;
    if (stroke.selectionMask && (!selectionMask || selectionMask.length !== width * height))
      throw new Error('Patch selection mask is unavailable');
    applyStroke(output, output, width, height, stroke, selectionMask as ArrayLike<number> | undefined);
  }
  for (let offset = 0; offset < output.length; offset += 4) {
    if (output[offset + 3] === 0)
      output[offset] = output[offset + 1] = output[offset + 2] = 0;
  }
  return output;
}
