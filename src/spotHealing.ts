/**
 * Deterministic local object cleanup for the Spot Healing / Remove tool.
 *
 * The source buffer is never modified. Each stroke samples an annulus around
 * the brush and synthesizes a bounded patch from that local context. This is
 * deliberately a local contract: it is useful for dust, small blemishes and
 * short object marks while keeping edits predictable, reversible and safe for
 * large documents. It does not claim semantic subject detection or AI fill.
 */

export const SPOT_HEALING_VERSION = 1 as const;
export const SPOT_HEALING_MAX_STROKES = 128;
export const SPOT_HEALING_MAX_POINTS = 4096;
export const SPOT_HEALING_MAX_SIZE = 10000;

export type SpotHealingPoint = { x: number; y: number };
export type SpotHealingStroke = {
  version: typeof SPOT_HEALING_VERSION;
  points: SpotHealingPoint[];
  /** Brush diameter in local layer pixels. */
  size: number;
  /** Radial hardness from 0 to 100. */
  hardness: number;
  /** Blend strength from 0 to 1. */
  opacity: number;
  /**
   * Optional layer-sized alpha asset captured from the active selection at
   * pointer-down (rectangle, ellipse, lasso or pixel selections alike). Replay
   * scales each write by its coverage, so the cleanup stays inside the
   * selection, with feathered edges, after undo, reload and project import.
   */
  selectionMask?: string;
  /**
   * Healing type. Absent (strokes recorded before types existed) replays as
   * `proximity`, the original annulus median, byte-for-byte.
   */
  type?: SpotHealingStrokeType;
};

export const SPOT_HEALING_STROKE_TYPES = ['content-aware', 'texture', 'proximity'] as const;
export type SpotHealingStrokeType = (typeof SPOT_HEALING_STROKE_TYPES)[number];

/** Asset ids accepted for a stroke's selection mask snapshot. */
export const SPOT_HEALING_MASK_ID = /^[a-z\d-]{1,160}$/i;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function validSpotHealingStroke(
  value: unknown,
  width?: number,
  height?: number,
): value is SpotHealingStroke {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<SpotHealingStroke>;
  if (
    candidate.version !== SPOT_HEALING_VERSION ||
    !Array.isArray(candidate.points) ||
    candidate.points.length < 1 ||
    candidate.points.length > SPOT_HEALING_MAX_POINTS ||
    !finite(candidate.size) ||
    candidate.size < 1 ||
    candidate.size > SPOT_HEALING_MAX_SIZE ||
    !finite(candidate.hardness) ||
    candidate.hardness < 0 ||
    candidate.hardness > 100 ||
    !finite(candidate.opacity) ||
    candidate.opacity < 0 ||
    candidate.opacity > 1
  )
    return false;
  if (
    candidate.selectionMask !== undefined &&
    (typeof candidate.selectionMask !== 'string' || !SPOT_HEALING_MASK_ID.test(candidate.selectionMask))
  )
    return false;
  if (
    candidate.type !== undefined &&
    !(SPOT_HEALING_STROKE_TYPES as readonly string[]).includes(candidate.type as string)
  )
    return false;
  return candidate.points.every((point) => {
    if (!point || typeof point !== 'object' || !finite(point.x) || !finite(point.y))
      return false;
    if (point.x < 0 || point.y < 0) return false;
    return (
      (width === undefined || point.x < width) &&
      (height === undefined || point.y < height)
    );
  });
}

export function validSpotHealingStrokes(
  value: unknown,
  width?: number,
  height?: number,
): value is SpotHealingStroke[] {
  return (
    Array.isArray(value) &&
    value.length <= SPOT_HEALING_MAX_STROKES &&
    value.every((stroke) => validSpotHealingStroke(stroke, width, height))
  );
}

function radialCoverage(distance: number, radius: number, hardness: number): number {
  if (distance > radius) return 0;
  if (hardness >= 100) return 1;
  const softRadius = radius * (1 - hardness / 100),
    plateau = radius - softRadius;
  return distance <= plateau
    ? 1
    : clamp((radius - distance) / Math.max(0.0000001, softRadius), 0, 1);
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/** Return the context colour from an annulus around one destination pixel. */
function contextSample(
  source: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): [number, number, number, number] | null {
  // A fixed angular lattice makes output reproducible across browsers. The
  // radius extends just beyond the affected region so the object itself is not
  // fed back into the estimate.
  // The diagonal of a square blemish can extend beyond the circular brush
  // radius. A wider annulus keeps the estimate outside that footprint while
  // remaining local enough for background texture and gradients.
  const requestedRadius = Math.max(1, radius * 1.75 + 1),
    // Keep a usable annulus for small or edge-clipped images. When the ideal
    // ring falls outside the bitmap, the bounded fallback still samples local
    // context instead of silently leaving the brush unchanged.
    sampleRadius = Math.min(
      requestedRadius,
      Math.max(1, Math.min(width, height) / 2 - 0.5),
    ),
    samples: Array<[number, number, number, number]> = [];
  for (let angle = 0; angle < 16; angle += 1) {
    const theta = (angle * Math.PI * 2) / 16,
      sx = Math.round(x + Math.cos(theta) * sampleRadius),
      sy = Math.round(y + Math.sin(theta) * sampleRadius);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    const offset = pixelOffset(width, sx, sy), alpha = source[offset + 3];
    if (alpha <= 0) continue;
    samples.push([source[offset], source[offset + 1], source[offset + 2], alpha]);
  }
  if (!samples.length) return null;
  // A per-channel median rejects a single bright/dark outlier on an edge while
  // retaining the alpha coverage of the surrounding context.
  const median = (channel: 0 | 1 | 2 | 3) => {
    const sorted = samples.map((sample) => sample[channel]).sort((a, b) => a - b),
      middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  return [median(0), median(1), median(2), median(3)];
}

/** Eight unit ray directions used by the Content-Aware membrane fill. */
const RAYS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

type Footprint = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Strongest radial coverage of any stroke point, 0..1. */
  coverage: Float32Array;
};

/** The union of every brush dab of a stroke, clipped to the bitmap. */
function strokeFootprint(stroke: SpotHealingStroke, width: number, height: number): Footprint | null {
  const radius = stroke.size / 2;
  let left = width, top = height, right = 0, bottom = 0;
  for (const point of stroke.points) {
    left = Math.min(left, Math.max(0, Math.floor(point.x - radius)));
    top = Math.min(top, Math.max(0, Math.floor(point.y - radius)));
    right = Math.max(right, Math.min(width, Math.floor(point.x + radius) + 1));
    bottom = Math.max(bottom, Math.min(height, Math.floor(point.y + radius) + 1));
  }
  if (right <= left || bottom <= top) return null;
  const footprint: Footprint = {
    left,
    top,
    width: right - left,
    height: bottom - top,
    coverage: new Float32Array((right - left) * (bottom - top)),
  };
  for (const point of stroke.points) {
    const x0 = Math.max(left, Math.floor(point.x - radius)),
      y0 = Math.max(top, Math.floor(point.y - radius)),
      x1 = Math.min(right, Math.floor(point.x + radius) + 1),
      y1 = Math.min(bottom, Math.floor(point.y + radius) + 1);
    for (let y = y0; y < y1; y += 1)
      for (let x = x0; x < x1; x += 1) {
        const value = radialCoverage(Math.hypot(x - point.x, y - point.y), radius, stroke.hardness),
          index = (y - top) * footprint.width + (x - left);
        if (value > footprint.coverage[index]) footprint.coverage[index] = value;
      }
  }
  return footprint;
}

const inHole = (footprint: Footprint, x: number, y: number) => {
  const fx = x - footprint.left, fy = y - footprint.top;
  return fx >= 0 && fy >= 0 && fx < footprint.width && fy < footprint.height &&
    footprint.coverage[fy * footprint.width + fx] > 0;
};

/**
 * Content-Aware: a membrane fill. Eight rays leave the pixel until they
 * reach the first visible pixel outside the stroke footprint (within a
 * bounded reach); hits are averaged with inverse-square distance weights.
 * Opposite hits interpolate across the hole, so smooth gradients and edges
 * that cross the stroke continue through it instead of taking one flat
 * median colour.
 */
function membraneSample(
  source: ArrayLike<number>,
  width: number,
  height: number,
  footprint: Footprint,
  x: number,
  y: number,
  reach: number,
): [number, number, number] | null {
  let red = 0, green = 0, blue = 0, total = 0;
  for (const [dx, dy] of RAYS) {
    for (let step = 1; step <= reach; step += 1) {
      const sx = Math.round(x + dx * step), sy = Math.round(y + dy * step);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) break;
      if (inHole(footprint, sx, sy)) continue;
      const offset = pixelOffset(width, sx, sy);
      if (source[offset + 3] <= 0) break;
      const distance = Math.hypot(sx - x, sy - y), weight = 1 / (distance * distance);
      red += source[offset] * weight;
      green += source[offset + 1] * weight;
      blue += source[offset + 2] * weight;
      total += weight;
      break;
    }
  }
  return total > 0 ? [red / total, green / total, blue / total] : null;
}

/** Mean of the visible pixels in a (2r + 1) square box, or null. */
function boxMean(source: ArrayLike<number>, width: number, height: number, x: number, y: number, r: number) {
  let red = 0, green = 0, blue = 0, count = 0;
  for (let sy = Math.max(0, y - r); sy <= Math.min(height - 1, y + r); sy += 1)
    for (let sx = Math.max(0, x - r); sx <= Math.min(width - 1, x + r); sx += 1) {
      const offset = pixelOffset(width, sx, sy);
      if (source[offset + 3] <= 0) continue;
      red += source[offset];
      green += source[offset + 1];
      blue += source[offset + 2];
      count += 1;
    }
  return count ? [red / count, green / count, blue / count] : null;
}

/**
 * Create Texture borrows detail from a donor area: the brush footprint
 * shifted by one stroke diameter in the first of eight directions whose
 * shifted footprint overlaps the original the least (ties keep the earlier
 * direction, so the choice is deterministic).
 */
function textureShift(stroke: SpotHealingStroke, footprint: Footprint): [number, number] {
  const distance = Math.ceil(stroke.size + 2);
  let best: [number, number] = [distance, 0], bestOverlap = Infinity;
  for (const [dx, dy] of RAYS) {
    const sx = Math.round(dx * distance), sy = Math.round(dy * distance);
    let overlap = 0;
    for (let y = 0; y < footprint.height; y += 2)
      for (let x = 0; x < footprint.width; x += 2)
        if (footprint.coverage[y * footprint.width + x] > 0 &&
          inHole(footprint, footprint.left + x + sx, footprint.top + y + sy)) overlap += 1;
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      best = [sx, sy];
    }
  }
  return best;
}

/** Content-Aware and Create Texture fills over the whole stroke footprint. */
function applyFootprintStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: SpotHealingStroke,
  selectionMask?: ArrayLike<number>,
): boolean {
  const footprint = strokeFootprint(stroke, width, height);
  if (!footprint) return false;
  const samplingSource = source === destination ? new Uint8ClampedArray(source) : source,
    reach = Math.max(2, Math.ceil(stroke.size * 1.5) + 2),
    shift = stroke.type === 'texture' ? textureShift(stroke, footprint) : [0, 0];
  let changed = false;
  for (let fy = 0; fy < footprint.height; fy += 1)
    for (let fx = 0; fx < footprint.width; fx += 1) {
      const coverage = footprint.coverage[fy * footprint.width + fx];
      if (coverage <= 0) continue;
      const x = footprint.left + fx, y = footprint.top + fy,
        selected = selectionMask ? selectionMask[y * width + x] / 255 : 1;
      if (selected <= 0) continue;
      const base = membraneSample(samplingSource, width, height, footprint, x, y, reach);
      if (!base) continue;
      let fill = base;
      if (stroke.type === 'texture') {
        // Base tone from the membrane plus the donor's high-frequency detail
        // (donor pixel minus its 5 x 5 local mean).
        const dx = x + shift[0], dy = y + shift[1];
        if (dx >= 0 && dy >= 0 && dx < width && dy < height && !inHole(footprint, dx, dy)) {
          const offset = pixelOffset(width, dx, dy), mean = boxMean(samplingSource, width, height, dx, dy, 2);
          if (samplingSource[offset + 3] > 0 && mean)
            fill = [0, 1, 2].map((channel) =>
              base[channel] + samplingSource[offset + channel] - mean[channel]) as [number, number, number];
        }
      }
      const offset = pixelOffset(width, x, y),
        amount = clamp(coverage * stroke.opacity * selected, 0, 1),
        alpha = destination[offset + 3];
      for (let channel = 0; channel < 3; channel += 1)
        destination[offset + channel] = Math.round(
          destination[offset + channel] * (1 - amount) + clamp(fill[channel], 0, 255) * amount,
        );
      if (alpha === 0) destination[offset] = destination[offset + 1] = destination[offset + 2] = 0;
      changed = true;
    }
  return changed;
}

function applyStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: SpotHealingStroke,
  selectionMask?: ArrayLike<number>,
): boolean {
  if (stroke.type === 'content-aware' || stroke.type === 'texture')
    return applyFootprintStroke(destination, source, width, height, stroke, selectionMask);
  const radius = stroke.size / 2,
    // A multi-point stroke is one immutable operation. When the caller uses
    // the same buffer for source and destination, freeze the sampling surface
    // so an earlier point cannot become the context for a later point.
    samplingSource = source === destination ? new Uint8ClampedArray(source) : source,
    before = destination.slice();
  let changed = false;
  for (const point of stroke.points) {
    const left = Math.max(0, Math.floor(point.x - radius)),
      top = Math.max(0, Math.floor(point.y - radius)),
      right = Math.min(width, Math.floor(point.x + radius) + 1),
      bottom = Math.min(height, Math.floor(point.y + radius) + 1);
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const coverage = radialCoverage(
          Math.hypot(x - point.x, y - point.y),
          radius,
          stroke.hardness,
        );
        // A selection snapshot confines the write; partial (feathered)
        // coverage blends proportionally. Context may still be sampled from
        // outside the selection, which is where clean surroundings usually are.
        const selected = selectionMask ? selectionMask[y * width + x] / 255 : 1;
        if (coverage <= 0 || selected <= 0) continue;
        const context = contextSample(samplingSource, width, height, x, y, radius);
        if (!context) continue;
        const offset = pixelOffset(width, x, y),
          amount = clamp(coverage * stroke.opacity * selected, 0, 1),
          beforeAlpha = before[offset + 3],
          // Spot cleanup is an RGB retouch. Alpha belongs to the layer's
          // masking model and is preserved byte-for-byte, including on
          // partially transparent and fully transparent pixels.
          afterAlpha = beforeAlpha;
        for (let channel = 0; channel < 3; channel += 1)
          destination[offset + channel] = Math.round(
            before[offset + channel] * (1 - amount) + context[channel] * amount,
          );
        destination[offset + 3] = afterAlpha;
        if (afterAlpha === 0) {
          destination[offset] = 0;
          destination[offset + 1] = 0;
          destination[offset + 2] = 0;
        }
        changed = true;
      }
    }
  }
  return changed;
}

/** Apply one immutable-context cleanup stroke in-place. */
export function applySpotHealingStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: SpotHealingStroke,
  selectionMask?: ArrayLike<number>,
): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Spot Healing canvas dimensions are invalid');
  if (destination.length !== width * height * 4 || source.length !== width * height * 4)
    throw new Error('Spot Healing source and destination must contain RGBA data');
  if (selectionMask && selectionMask.length !== width * height)
    throw new Error('Spot Healing selection mask has the wrong size');
  if (!validSpotHealingStroke(stroke, width, height))
    throw new Error('Spot Healing stroke is invalid');
  return applyStroke(destination, source, width, height, stroke, selectionMask);
}

/** Render all nondestructive cleanup metadata over an immutable RGBA source. */
export function applySpotHealingStrokes(
  source: ArrayLike<number>,
  width: number,
  height: number,
  strokes: readonly SpotHealingStroke[] | undefined,
  selectionMasks?: Readonly<Record<string, ArrayLike<number>>>,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Spot Healing canvas dimensions are invalid');
  if (source.length !== width * height * 4)
    throw new Error('Spot Healing source must contain RGBA data');
  if (!validSpotHealingStrokes(strokes ?? [], width, height))
    throw new Error('Spot Healing strokes are invalid');
  const output = new Uint8ClampedArray(source);
  for (const stroke of strokes ?? []) {
    // Strokes recorded before selection snapshots existed have no mask and
    // replay exactly as before.
    const selectionMask = stroke.selectionMask ? selectionMasks?.[stroke.selectionMask] : undefined;
    if (stroke.selectionMask && (!selectionMask || selectionMask.length !== width * height))
      throw new Error('Spot Healing selection mask is unavailable');
    applyStroke(output, output, width, height, stroke, selectionMask);
  }
  // Hidden RGB data is never exposed by a cleanup render. Keeping it neutral
  // avoids colour fringes if the alpha is later revealed by a mask or export.
  for (let offset = 0; offset < output.length; offset += 4)
    if (output[offset + 3] === 0) output[offset] = output[offset + 1] = output[offset + 2] = 0;
  return output;
}
