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
};

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

function applyStroke(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  stroke: SpotHealingStroke,
): boolean {
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
        if (coverage <= 0) continue;
        const context = contextSample(samplingSource, width, height, x, y, radius);
        if (!context) continue;
        const offset = pixelOffset(width, x, y),
          amount = clamp(coverage * stroke.opacity, 0, 1),
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
): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Spot Healing canvas dimensions are invalid');
  if (destination.length !== width * height * 4 || source.length !== width * height * 4)
    throw new Error('Spot Healing source and destination must contain RGBA data');
  if (!validSpotHealingStroke(stroke, width, height))
    throw new Error('Spot Healing stroke is invalid');
  return applyStroke(destination, source, width, height, stroke);
}

/** Render all nondestructive cleanup metadata over an immutable RGBA source. */
export function applySpotHealingStrokes(
  source: ArrayLike<number>,
  width: number,
  height: number,
  strokes: readonly SpotHealingStroke[] | undefined,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Spot Healing canvas dimensions are invalid');
  if (source.length !== width * height * 4)
    throw new Error('Spot Healing source must contain RGBA data');
  if (!validSpotHealingStrokes(strokes ?? [], width, height))
    throw new Error('Spot Healing strokes are invalid');
  const output = new Uint8ClampedArray(source);
  for (const stroke of strokes ?? []) applyStroke(output, output, width, height, stroke);
  // Hidden RGB data is never exposed by a cleanup render. Keeping it neutral
  // avoids colour fringes if the alpha is later revealed by a mask or export.
  for (let offset = 0; offset < output.length; offset += 4)
    if (output[offset + 3] === 0) output[offset] = output[offset + 1] = output[offset + 2] = 0;
  return output;
}
