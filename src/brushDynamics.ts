/**
 * Bounded deterministic brush dynamics for raster brush-family stamps:
 * scatter, dab count, size/angle/opacity jitter and colour dynamics
 * (hue/saturation/brightness and foreground/background mix jitter). Every random choice is
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
  /** Per-dab random hue rotation, 0–100% of ±180°. */
  hueJitter: number;
  /** Per-dab random saturation offset, 0–100% of ±1 (clamped). */
  saturationJitter: number;
  /** Per-dab random brightness offset, 0–100% of ±1 (clamped). */
  brightnessJitter: number;
  /** Per-dab random mix from the foreground towards the background colour, 0–100%. */
  colorMixJitter: number;
};

/** The colour-dynamics keys; legacy settings omit them and default to 0. */
export const BRUSH_COLOR_DYNAMICS_KEYS = ['hueJitter', 'saturationJitter', 'brightnessJitter', 'colorMixJitter'] as const;

export const DEFAULT_BRUSH_DYNAMICS: Readonly<BrushDynamics> = Object.freeze({
  scatterBothAxes: true,
  count: 1,
  countJitter: 0,
  sizeJitter: 0,
  angleJitter: 0,
  opacityJitter: 0,
  hueJitter: 0,
  saturationJitter: 0,
  brightnessJitter: 0,
  colorMixJitter: 0,
});

/** One dab produced by the dynamics for a single spacing step. */
export type BrushDab = BrushPoint & {
  /** Multiplier for the dab diameter, (0, 1]. */
  sizeScale: number;
  /** Degrees added to the tip angle. */
  angleOffset: number;
  /** Multiplier for the dab opacity, [0, 1]. */
  opacityScale: number;
  /** Colour dynamics, present only when the matching jitter is above 0: degrees of hue rotation. */
  hueShift?: number;
  /** Added to HSB saturation, [-1, 1]. */
  saturationShift?: number;
  /** Added to HSB brightness, [-1, 1]. */
  brightnessShift?: number;
  /** Fraction of the way from the foreground to the background colour, [0, 1]. */
  backgroundMix?: number;
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
    (candidate.opacityJitter === undefined || inRange(candidate.opacityJitter, 0, BRUSH_JITTER_MAX)) &&
    BRUSH_COLOR_DYNAMICS_KEYS.every((key) => candidate[key] === undefined || inRange(candidate[key], 0, BRUSH_JITTER_MAX))
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
    hueJitter: jitter(candidate.hueJitter),
    saturationJitter: jitter(candidate.saturationJitter),
    brightnessJitter: jitter(candidate.brightnessJitter),
    colorMixJitter: jitter(candidate.colorMixJitter),
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

/**
 * Number of dabs for one spacing step after Count jitter. Jitter varies the
 * count symmetrically around Count, by up to ±Count × jitter (so 100% spans
 * 0…2 × Count), and the result is clamped to 1–16 dabs. The choice is a hash
 * of the stroke point, so a replayed stroke gets the same counts.
 */
export function brushDabCount(point: BrushPoint, dynamics: BrushDynamics): number {
  const count = Math.max(BRUSH_COUNT_MIN, Math.min(BRUSH_COUNT_MAX, Math.round(dynamics.count)));
  if (!(dynamics.countJitter > 0)) return count;
  const jitter = Math.min(BRUSH_JITTER_MAX, dynamics.countJitter) / 100,
    variation = (brushDabRandom(point, 0, 1) * 2 - 1) * jitter;
  return Math.max(BRUSH_COUNT_MIN, Math.min(BRUSH_COUNT_MAX, Math.round(count * (1 + variation))));
}

/**
 * With "Scatter both axes" off, scatter runs perpendicular to the stroke, but
 * the first dab of a stroke has no direction yet. Such a dab is deferred until
 * the next point arrives and then uses that segment's direction (or both axes
 * if the stroke ends without moving).
 */
export function deferFirstBrushDab(
  dynamics: Pick<BrushDynamics, 'scatterBothAxes'>,
  scatter: number,
  direction: BrushPoint,
): boolean {
  return (
    dynamics.scatterBothAxes === false &&
    normalizeBrushScatter(scatter) > 0 &&
    !(finite(direction.x) && finite(direction.y) && Math.hypot(direction.x, direction.y) > 0)
  );
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
      ...brushDabColorJitter(point, index, dynamics),
    });
  }
  return dabs;
}

type BrushDabColorOffsets = Pick<BrushDab, 'hueShift' | 'saturationShift' | 'brightnessShift' | 'backgroundMix'>;
type Rgba = readonly [number, number, number, number];

const jitterAmount = (value: unknown) =>
  finite(value) ? Math.max(0, Math.min(BRUSH_JITTER_MAX, value)) / 100 : 0;

/** True when any colour-dynamics control is above 0. */
export function hasBrushColorDynamics(dynamics: Partial<BrushDynamics> | undefined): boolean {
  return Boolean(dynamics) && BRUSH_COLOR_DYNAMICS_KEYS.some((key) => jitterAmount(dynamics![key]) > 0);
}

/**
 * Deterministic per-dab colour offsets. They use hash channels 5–8, so
 * enabling colour dynamics never moves, resizes, rotates or fades a dab.
 * Keys are omitted when the matching jitter is 0, keeping legacy dabs equal.
 */
export function brushDabColorJitter(
  point: BrushPoint,
  index: number,
  dynamics: Partial<BrushDynamics>,
): BrushDabColorOffsets {
  const result: BrushDabColorOffsets = {},
    hue = jitterAmount(dynamics.hueJitter),
    saturation = jitterAmount(dynamics.saturationJitter),
    brightness = jitterAmount(dynamics.brightnessJitter),
    mix = jitterAmount(dynamics.colorMixJitter);
  if (hue > 0) result.hueShift = (brushDabRandom(point, index, 5) * 2 - 1) * 180 * hue;
  if (saturation > 0) result.saturationShift = (brushDabRandom(point, index, 6) * 2 - 1) * saturation;
  if (brightness > 0) result.brightnessShift = (brushDabRandom(point, index, 7) * 2 - 1) * brightness;
  if (mix > 0) result.backgroundMix = brushDabRandom(point, index, 8) * mix;
  return result;
}

/** Convert 0–255 RGB to hue (0–360°) plus saturation and brightness (0–1). */
export function rgbToHsb(red: number, green: number, blue: number): { hue: number; saturation: number; brightness: number } {
  const channel = (value: number) => Math.max(0, Math.min(255, finite(value) ? value : 0)) / 255,
    r = channel(red),
    g = channel(green),
    b = channel(blue),
    max = Math.max(r, g, b),
    delta = max - Math.min(r, g, b);
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, brightness: max };
}

/** Convert hue (any degrees, wrapped) and saturation/brightness (clamped 0–1) to rounded 0–255 RGB. */
export function hsbToRgb(hue: number, saturation: number, brightness: number): [number, number, number] {
  const h = (((finite(hue) ? hue : 0) % 360) + 360) % 360,
    s = Math.max(0, Math.min(1, finite(saturation) ? saturation : 0)),
    v = Math.max(0, Math.min(1, finite(brightness) ? brightness : 0)),
    chroma = v * s,
    x = chroma * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - chroma,
    sectors: Array<[number, number, number]> = [
      [chroma, x, 0],
      [x, chroma, 0],
      [0, chroma, x],
      [0, x, chroma],
      [x, 0, chroma],
      [chroma, 0, x],
    ],
    [r, g, b] = sectors[Math.floor(h / 60) % 6];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Apply one dab's colour offsets to the foreground colour: first mix towards
 * the background colour, then rotate hue and offset saturation/brightness in
 * HSB. Alpha is preserved. A dab without colour offsets returns the
 * foreground itself, so legacy strokes render byte-identically.
 */
export function brushDabColor<T extends Rgba>(
  foreground: T,
  background: Rgba | undefined,
  dab: BrushDabColorOffsets,
): T | [number, number, number, number] {
  const mix = finite(dab.backgroundMix) ? Math.max(0, Math.min(1, dab.backgroundMix)) : 0,
    hueShift = finite(dab.hueShift) ? dab.hueShift : 0,
    saturationShift = finite(dab.saturationShift) ? dab.saturationShift : 0,
    brightnessShift = finite(dab.brightnessShift) ? dab.brightnessShift : 0,
    mixes = mix > 0 && background !== undefined;
  if (!mixes && hueShift === 0 && saturationShift === 0 && brightnessShift === 0) return foreground;
  let red = foreground[0],
    green = foreground[1],
    blue = foreground[2];
  if (mixes) {
    red = Math.round(red + (background[0] - red) * mix);
    green = Math.round(green + (background[1] - green) * mix);
    blue = Math.round(blue + (background[2] - blue) * mix);
  }
  if (hueShift !== 0 || saturationShift !== 0 || brightnessShift !== 0) {
    const hsb = rgbToHsb(red, green, blue);
    [red, green, blue] = hsbToRgb(hsb.hue + hueShift, hsb.saturation + saturationShift, hsb.brightness + brightnessShift);
  }
  return [red, green, blue, foreground[3]];
}
