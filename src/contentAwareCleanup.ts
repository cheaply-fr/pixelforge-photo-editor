/**
 * Constrained local content-aware cleanup.
 *
 * The operation fills a persisted selection mask with a deterministic median
 * of nearby, unselected pixels. It is useful for small marks and simple
 * backgrounds, but intentionally makes no semantic, generative or remote
 * inference claim. The source RGBA buffer and alpha channel remain intact.
 */

export const CONTENT_AWARE_VERSION = 1 as const;
export const CONTENT_AWARE_MAX_OPERATIONS = 16;
export const CONTENT_AWARE_MAX_RADIUS = 128;
export const GENERATIVE_FILL_MAX_OPERATIONS = 8;
export const GENERATIVE_FILL_MAX_PROMPT = 240;
export const GENERATIVE_FILL_MAX_RADIUS = 96;

export type ContentAwareFill = {
  version: typeof CONTENT_AWARE_VERSION;
  /** Asset id for a layer-local, grayscale alpha selection mask. */
  mask: string;
  /** Search radius in layer pixels. */
  radius: number;
  /** Blend strength from 0 to 1. */
  opacity: number;
  /** Optional bounded local texture-synthesis mode. Legacy fills use median. */
  mode?: 'median' | 'texture';
  /** User-provided description retained locally; never sent to a provider. */
  prompt?: string;
  /** Deterministic local seed for texture sampling. */
  seed?: number;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function validContentAwareFill(value: unknown): value is ContentAwareFill {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ContentAwareFill>;
  const radius = candidate.radius;
  const mode = candidate.mode ?? 'median';
  return (
    candidate.version === CONTENT_AWARE_VERSION &&
    typeof candidate.mask === 'string' &&
    /^[a-z\d-]{1,160}$/i.test(candidate.mask) &&
    typeof radius === 'number' &&
    Number.isInteger(radius) &&
    radius >= 1 &&
    radius <= CONTENT_AWARE_MAX_RADIUS &&
    finite(candidate.opacity) &&
    candidate.opacity >= 0 &&
    candidate.opacity <= 1 &&
    (mode === 'median' || mode === 'texture') &&
    (candidate.prompt === undefined ||
      (typeof candidate.prompt === 'string' && candidate.prompt.length <= GENERATIVE_FILL_MAX_PROMPT)) &&
    (candidate.seed === undefined ||
      (Number.isInteger(candidate.seed) && candidate.seed >= 0 && candidate.seed <= 0xffffffff))
  );
}

export function validContentAwareFills(value: unknown): value is ContentAwareFill[] {
  return (
    Array.isArray(value) &&
    value.length <= CONTENT_AWARE_MAX_OPERATIONS &&
    value.every((fill) => validContentAwareFill(fill))
  );
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/**
 * Find a stable local context sample outside the target mask. Searching from
 * one pixel to the configured radius handles tiny marks without reading the
 * target itself; a fixed angular lattice keeps output reproducible.
 */
function contextSample(
  source: ArrayLike<number>,
  mask: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
): [number, number, number, number] | null {
  const sampleCount = 16;
  // A bounded four-ring search keeps a large selection responsive. The outer
  // ring supplies background context first; smaller fallbacks handle tiny
  // marks without turning radius into a quadratic per-pixel scan.
  const distances = Array.from(
    new Set([radius, Math.round(radius * 0.75), Math.round(radius * 0.5), 1]),
  );
  for (const distance of distances) {
    const samples: Array<[number, number, number, number]> = [];
    for (let angle = 0; angle < sampleCount; angle += 1) {
      const theta = (angle * Math.PI * 2) / sampleCount;
      const sx = Math.round(x + Math.cos(theta) * distance);
      const sy = Math.round(y + Math.sin(theta) * distance);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      if (mask[sy * width + sx] >= 128) continue;
      const offset = pixelOffset(width, sx, sy);
      // Fully transparent RGB is hidden and should not tint a replacement.
      if (source[offset + 3] <= 0) continue;
      samples.push([
        source[offset],
        source[offset + 1],
        source[offset + 2],
        source[offset + 3],
      ]);
    }
    if (!samples.length) continue;
    const median = (channel: 0 | 1 | 2 | 3) => {
      const sorted = samples.map((sample) => sample[channel]).sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    return [median(0), median(1), median(2), median(3)];
  }
  return null;
}

function hash32(value: number): number {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Sample several seeded rings rather than taking one median. This gives the
 * local Generative Fill approximation a different, repeatable texture blend
 * while keeping all reads outside the selected mask and preserving alpha.
 */
function textureContextSample(
  source: ArrayLike<number>,
  mask: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  seed: number,
): [number, number, number, number] | null {
  const samples: Array<{ rgba: [number, number, number, number]; weight: number }> = [];
  const count = 24;
  for (let index = 0; index < count; index += 1) {
    const random = hash32(seed ^ Math.imul(x + 1, 0x1f123bb5) ^ Math.imul(y + 1, 0x5f356495) ^ index);
    const angle = ((index + 0.25 + (random % 1000) / 1000) / count) * Math.PI * 2;
    const distance = Math.max(1, Math.round(1 + (radius - 1) * ((random >>> 10) % 1000) / 999));
    const sx = Math.round(x + Math.cos(angle) * distance);
    const sy = Math.round(y + Math.sin(angle) * distance);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
    if (mask[sy * width + sx] >= 128) continue;
    const offset = pixelOffset(width, sx, sy);
    if (source[offset + 3] <= 0) continue;
    const weight = 1 / (1 + distance);
    samples.push({
      rgba: [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]],
      weight,
    });
  }
  if (!samples.length) return contextSample(source, mask, width, height, x, y, radius);
  const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
  return [0, 1, 2, 3].map((channel) =>
    Math.round(samples.reduce((sum, sample) => sum + sample.rgba[channel as 0 | 1 | 2 | 3] * sample.weight, 0) / total),
  ) as [number, number, number, number];
}

function applyFill(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  mask: ArrayLike<number>,
  fill: ContentAwareFill,
): boolean {
  const samplingSource = source === destination ? new Uint8ClampedArray(source) : source;
  let changed = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const maskAlpha = mask[y * width + x] ?? 0;
      if (maskAlpha <= 0) continue;
      const context = fill.mode === 'texture'
        ? textureContextSample(
            samplingSource,
            mask,
            width,
            height,
            x,
            y,
            Math.min(GENERATIVE_FILL_MAX_RADIUS, fill.radius),
            fill.seed ?? 0,
          )
        : contextSample(samplingSource, mask, width, height, x, y, fill.radius);
      if (!context) continue;
      const offset = pixelOffset(width, x, y);
      const amount = clamp((maskAlpha / 255) * fill.opacity, 0, 1);
      const before = destination.slice(offset, offset + 4);
      for (let channel = 0; channel < 3; channel += 1)
        destination[offset + channel] = Math.round(
          before[channel] * (1 - amount) + context[channel] * amount,
        );
      destination[offset + 3] = before[3];
      if (destination[offset + 3] === 0)
        destination[offset] = destination[offset + 1] = destination[offset + 2] = 0;
      changed = changed || amount > 0;
    }
  }
  return changed;
}

export function applyContentAwareFill(
  destination: Uint8ClampedArray,
  source: ArrayLike<number>,
  width: number,
  height: number,
  mask: ArrayLike<number>,
  fill: ContentAwareFill,
): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Content-aware canvas dimensions are invalid');
  if (
    destination.length !== width * height * 4 ||
    source.length !== width * height * 4
  )
    throw new Error('Content-aware source and destination must contain RGBA data');
  if (mask.length !== width * height)
    throw new Error('Content-aware selection mask has the wrong size');
  if (!validContentAwareFill(fill)) throw new Error('Content-aware fill is invalid');
  return applyFill(destination, source, width, height, mask, fill);
}

/** Render all local cleanup metadata over an immutable RGBA source. */
export function applyContentAwareFills(
  source: ArrayLike<number>,
  width: number,
  height: number,
  fills: readonly ContentAwareFill[] | undefined,
  masks: Readonly<Record<string, ArrayLike<number>>>,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Content-aware canvas dimensions are invalid');
  if (source.length !== width * height * 4)
    throw new Error('Content-aware source must contain RGBA data');
  if (!validContentAwareFills(fills ?? []))
    throw new Error('Content-aware fills are invalid');
  const output = new Uint8ClampedArray(source);
  for (const fill of fills ?? []) {
    const mask = masks[fill.mask];
    if (!mask || mask.length !== width * height)
      throw new Error('Content-aware selection mask is unavailable');
    applyFill(output, output, width, height, mask, fill);
  }
  for (let offset = 0; offset < output.length; offset += 4)
    if (output[offset + 3] === 0)
      output[offset] = output[offset + 1] = output[offset + 2] = 0;
  return output;
}
