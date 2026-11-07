/**
 * Bounded deterministic brush dynamics for raster brush-family stamps:
 * scatter, dab count, and size/angle/opacity jitter. Every random choice is
 * derived from the stroke point and dab index (never global randomness), so
 * a replayed stroke produces the same pixels. This is a bounded local
 * approximation of common brush-engine dynamics, not a Photoshop clone.
 */
export const BRUSH_SCATTER_MIN = 0;
/** Scatter is a percentage of the brush diameter; 1,000% suits star fields. */
export const BRUSH_SCATTER_MAX = 1000;
export const BRUSH_SCATTER_DEFAULT = 0;
/**
 * At 100% scatter a dab moves up to 0.75 × diameter from the stroke (the
 * original 0–100 range); larger values scale linearly from there.
 */
const SCATTER_RADIUS_PER_100 = 0.75;

export const BRUSH_COUNT_MIN = 1;
export const BRUSH_COUNT_MAX = 16;
export const BRUSH_JITTER_MAX = 100;

export type BrushPoint = { x: number; y: number };

/** Persisted brush dynamics (all optional keys default to the legacy behaviour). */
export type BrushDynamics = {
  /** Scatter on both axes (legacy behaviour) or only perpendicular to the stroke. */
  scatterBothAxes: boolean;
  /** Dabs placed at each spacing step, 1–16. */
  count: number;
  /** Per-step random reduction of Count, 0–100%. */
  countJitter: number;
  /** Per-dab random size reduction, 0–100%. */
  sizeJitter: number;
  /** Per-dab random rotation, 0–100% of ±180°. */
  angleJitter: number;
  /** Per-dab random opacity reduction, 0–100%. */
  opacityJitter: number;
};

export const DEFAULT_BRUSH_DYNAMICS: Readonly<BrushDynamics> = Object.freeze({
  scatterBothAxes: true,
  count: 1,
  countJitter: 0,
  sizeJitter: 0,
  angleJitter: 0,
  opacityJitter: 0,
});

/** One dab produced by the dynamics for a single spacing step. */
export type BrushDab = BrushPoint & {
  /** Multiplier for the dab diameter, (0, 1]. */
  sizeScale: number;
  /** Degrees added to the tip angle. */
  angleOffset: number;
  /** Multiplier for the dab opacity, [0, 1]. */
  opacityScale: number;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) => finite(value) && value >= min && value <= max;

export function normalizeBrushScatter(value: unknown): number {
  if (!finite(value)) return BRUSH_SCATTER_DEFAULT;
  return Math.max(BRUSH_SCATTER_MIN, Math.min(BRUSH_SCATTER_MAX, Math.round(value)));
}

/** Largest distance a scattered dab centre can move from the stroke point. */
export function brushScatterRadius(size: number, amount: number): number {
  const safeSize = finite(size) ? Math.max(1, size) : 1;
  return safeSize * SCATTER_RADIUS_PER_100 * (normalizeBrushScatter(amount) / 100);
}

/**
 * Validate persisted dynamics. Keys are optional so drafts written before a
 * control existed stay valid; present keys must be in range (fail closed).
 */
export function validBrushDynamics(value: unknown): value is Partial<BrushDynamics> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof BrushDynamics, unknown>>;
  return (
    (candidate.scatterBothAxes === undefined || typeof candidate.scatterBothAxes === 'boolean') &&
    (candidate.count === undefined ||
      (Number.isInteger(candidate.count) && inRange(candidate.count, BRUSH_COUNT_MIN, BRUSH_COUNT_MAX))) &&
    (candidate.countJitter === undefined || inRange(candidate.countJitter, 0, BRUSH_JITTER_MAX)) &&
    (candidate.sizeJitter === undefined || inRange(candidate.sizeJitter, 0, BRUSH_JITTER_MAX)) &&
    (candidate.angleJitter === undefined || inRange(candidate.angleJitter, 0, BRUSH_JITTER_MAX)) &&
    (candidate.opacityJitter === undefined || inRange(candidate.opacityJitter, 0, BRUSH_JITTER_MAX))
  );
}

/** Clamp any input to a complete, bounded dynamics object. */
export function normalizeBrushDynamics(value: unknown): BrushDynamics {
  const candidate = (value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}) as Partial<Record<keyof BrushDynamics, unknown>>;
  const jitter = (entry: unknown) =>
    finite(entry) ? Math.max(0, Math.min(BRUSH_JITTER_MAX, Math.round(entry))) : 0;
  return {
    scatterBothAxes: typeof candidate.scatterBothAxes === 'boolean' ? candidate.scatterBothAxes : true,
    count: finite(candidate.count)
      ? Math.max(BRUSH_COUNT_MIN, Math.min(BRUSH_COUNT_MAX, Math.round(candidate.count)))
      : BRUSH_COUNT_MIN,
    countJitter: jitter(candidate.countJitter),
    sizeJitter: jitter(candidate.sizeJitter),
    angleJitter: jitter(candidate.angleJitter),
    opacityJitter: jitter(candidate.opacityJitter),
  };
}

/** Deterministic 32-bit hash of a point, dab index and channel, mapped to [0, 1). */
export function brushDabRandom(point: BrushPoint, index: number, channel: number): number {
  let hash = Math.imul(Math.round(point.x * 16) | 0, 0x27d4eb2d) ^
    Math.imul(Math.round(point.y * 16) | 0, 0x165667b1) ^
    Math.imul((index | 0) + 1, 0x9e3779b1) ^
    Math.imul((channel | 0) + 7, 0x85ebca77);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  hash = Math.imul(hash, 0x297a2d39);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}

/**
 * Derive a replay-stable offset without consuming global randomness. Dab
 * index 0 with both axes reproduces the original single-dab scatter exactly.
 * With `bothAxes: false` the offset is perpendicular to `direction`; a
 * zero-length direction (the first dab of a stroke) falls back to both axes.
 */
export function scatterBrushPoint(
  point: BrushPoint,
  size: number,
  amount: number,
  options: { index?: number; direction?: BrushPoint; bothAxes?: boolean } = {},
): BrushPoint {
  const scatter = normalizeBrushScatter(amount);
  if (scatter === 0) return { ...point };
  const safeSize = Number.isFinite(size) ? Math.max(1, size) : 1;
  const index = Number.isInteger(options.index) && options.index! > 0 ? options.index! : 0;
  const seed = Math.sin(point.x * 12.9898 + point.y * 78.233 + safeSize * 0.12345 + index * 39.3467) * 43758.5453;
  const xUnit = (seed - Math.floor(seed)) * 2 - 1;
  const ySeed = Math.sin(seed * 93.9898 + point.x * 0.17 - point.y * 0.31) * 43758.5453;
  const yUnit = (ySeed - Math.floor(ySeed)) * 2 - 1;
  const radius = brushScatterRadius(safeSize, scatter);
  const direction = options.direction,
    length = direction && finite(direction.x) && finite(direction.y) ? Math.hypot(direction.x, direction.y) : 0;
  if (options.bothAxes === false && length > 0) {
    // Unit normal to the stroke direction.
    const normalX = -direction!.y / length,
      normalY = direction!.x / length;
    return { x: point.x + normalX * xUnit * radius, y: point.y + normalY * xUnit * radius };
  }
  return { x: point.x + xUnit * radius, y: point.y + yUnit * radius };
}

/** Number of dabs for one spacing step after Count jitter (always ≥ 1). */
export function brushDabCount(point: BrushPoint, dynamics: BrushDynamics): number {
  const count = Math.max(BRUSH_COUNT_MIN, Math.min(BRUSH_COUNT_MAX, Math.round(dynamics.count)));
  if (dynamics.countJitter <= 0) return count;
  const reduction = (dynamics.countJitter / 100) * brushDabRandom(point, 0, 1);
  return Math.max(1, Math.round(count * (1 - reduction)));
}

/** Wrap degrees into the -180…180 range accepted by brush tips. */
export function wrapBrushAngle(angle: number): number {
  if (!finite(angle)) return 0;
  let wrapped = ((angle + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180 && angle > 0) wrapped = 180;
  return wrapped;
}

/**
 * Expand one spacing step into its dabs: Count copies, each with its own
 * deterministic scatter offset and size/angle/opacity jitter.
 */
export function brushDabsAt(
  point: BrushPoint,
  size: number,
  scatter: number,
  dynamics: BrushDynamics = DEFAULT_BRUSH_DYNAMICS,
  direction?: BrushPoint,
): BrushDab[] {
  const count = brushDabCount(point, dynamics),
    dabs: BrushDab[] = [];
  for (let index = 0; index < count; index += 1) {
    const position = scatterBrushPoint(point, size, scatter, {
      index,
      direction,
      bothAxes: dynamics.scatterBothAxes,
    });
    dabs.push({
      ...position,
      sizeScale: dynamics.sizeJitter > 0
        ? Math.max(0.01, 1 - (dynamics.sizeJitter / 100) * brushDabRandom(point, index, 2))
        : 1,
      angleOffset: dynamics.angleJitter > 0
        ? (brushDabRandom(point, index, 3) * 2 - 1) * 180 * (dynamics.angleJitter / 100)
        : 0,
      opacityScale: dynamics.opacityJitter > 0
        ? 1 - (dynamics.opacityJitter / 100) * brushDabRandom(point, index, 4)
        : 1,
    });
  }
  return dabs;
}
