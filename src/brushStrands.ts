/**
 * Silk strands: a Brush mode that paints a twisting ribbon of fine, parallel
 * light lines from one ordinary drag (silky smoke, hair-like wisps).
 *
 * The pointer samples are smoothed into an evenly spaced centripetal
 * Catmull-Rom path whose normals are box-filtered, so a few sparse samples
 * still give smooth strands. Strand k sits at a ribbon coordinate u in
 * [-1, 1] and is offset along the normal by
 *
 *   halfWidth · taper(t) · (u·cos(phase + twists·2π·t) + wobble terms) / norm
 *
 * so all strands meet (cross over) wherever the cosine is zero, and the
 * ribbon narrows to a point at both ends (taper = sin(πt)^0.5). Each strand
 * has its own seeded start/end window, opacity peak and low-frequency wobble.
 * Every random choice comes from the seed and the strand index, so a stroke
 * replays to the same geometry.
 *
 * This is a bounded local approximation of a "ribbon" brush for painting,
 * not a physical smoke simulation or a clone of any other editor's brush.
 */

export const BRUSH_STRANDS_COUNT_MIN = 1;
export const BRUSH_STRANDS_COUNT_MAX = 48;
export const BRUSH_STRANDS_WIDTH_MIN = 1;
export const BRUSH_STRANDS_WIDTH_MAX = 2000;
export const BRUSH_STRANDS_TWISTS_MIN = 0;
export const BRUSH_STRANDS_TWISTS_MAX = 20;
export const BRUSH_STRANDS_SEED_MAX = 99999;
/** Most path samples one stroke uses; longer strokes get a coarser step. */
export const BRUSH_STRANDS_MAX_SAMPLES = 4000;
/** Most pointer samples kept for one stroke (older ones are thinned). */
export const BRUSH_STRANDS_MAX_INPUT_POINTS = 8192;

export type BrushStrandSettings = {
  /** Paint strands instead of ordinary dabs (Brush tool only). */
  enabled: boolean;
  /** Number of strands, 1–48. */
  count: number;
  /** Full ribbon width in layer pixels, 1–2000. */
  width: number;
  /** Full turns of the ribbon over the whole stroke, 0–20 (halves allowed). */
  twists: number;
  /** Per-strand low-frequency wobble, 0–100%. */
  wobble: number;
  /** Per-strand random opacity reduction, 0–100%. */
  opacityJitter: number;
  /** Seed for every per-strand random choice, 0–99,999. */
  seed: number;
};

export const DEFAULT_BRUSH_STRANDS: Readonly<BrushStrandSettings> = Object.freeze({
  enabled: false,
  count: 16,
  width: 120,
  twists: 2,
  wobble: 35,
  opacityJitter: 50,
  seed: 1,
});

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) => finite(value) && value >= min && value <= max;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Validate persisted settings; keys are optional, present keys must be in range. */
export function validBrushStrands(value: unknown): value is Partial<BrushStrandSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof BrushStrandSettings, unknown>>;
  return (
    (candidate.enabled === undefined || typeof candidate.enabled === 'boolean') &&
    (candidate.count === undefined ||
      (Number.isInteger(candidate.count) && inRange(candidate.count, BRUSH_STRANDS_COUNT_MIN, BRUSH_STRANDS_COUNT_MAX))) &&
    (candidate.width === undefined || inRange(candidate.width, BRUSH_STRANDS_WIDTH_MIN, BRUSH_STRANDS_WIDTH_MAX)) &&
    (candidate.twists === undefined || inRange(candidate.twists, BRUSH_STRANDS_TWISTS_MIN, BRUSH_STRANDS_TWISTS_MAX)) &&
    (candidate.wobble === undefined || inRange(candidate.wobble, 0, 100)) &&
    (candidate.opacityJitter === undefined || inRange(candidate.opacityJitter, 0, 100)) &&
    (candidate.seed === undefined || (Number.isInteger(candidate.seed) && inRange(candidate.seed, 0, BRUSH_STRANDS_SEED_MAX)))
  );
}

/** Clamp any input to complete, bounded settings (missing keys use the defaults). */
export function normalizeBrushStrands(value: unknown): BrushStrandSettings {
  const candidate = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<
    Record<keyof BrushStrandSettings, unknown>
  >;
  const number = (key: keyof BrushStrandSettings, min: number, max: number, round: (value: number) => number) => {
    const raw = candidate[key];
    return finite(raw) ? clamp(round(raw), min, max) : (DEFAULT_BRUSH_STRANDS[key] as number);
  };
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_BRUSH_STRANDS.enabled,
    count: number('count', BRUSH_STRANDS_COUNT_MIN, BRUSH_STRANDS_COUNT_MAX, Math.round),
    width: number('width', BRUSH_STRANDS_WIDTH_MIN, BRUSH_STRANDS_WIDTH_MAX, Math.round),
    twists: number('twists', BRUSH_STRANDS_TWISTS_MIN, BRUSH_STRANDS_TWISTS_MAX, (value) => Math.round(value * 2) / 2),
    wobble: number('wobble', 0, 100, Math.round),
    opacityJitter: number('opacityJitter', 0, 100, Math.round),
    seed: number('seed', 0, BRUSH_STRANDS_SEED_MAX, Math.round),
  };
}

/** Deterministic [0, 1) value from a seed, strand index and channel. */
export function strandRandom(seed: number, strand: number, channel: number): number {
  const mix = (value: number) => {
    let h = value;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h;
  };
  let h = mix((seed | 0) ^ 0x9e3779b9);
  h = mix(h ^ Math.imul(strand | 0, 0x27d4eb2f) ^ 0x165667b1);
  h = mix(h ^ Math.imul(channel | 0, 0x7feb352d) ^ 0x2c1b3c6d);
  return (h >>> 0) / 4294967296;
}

export type StrandInputPoint = { x: number; y: number; pressure?: number };
/** One evenly spaced sample of the smoothed stroke path. */
export type StrandPathSample = {
  x: number;
  y: number;
  /** Unit normal (left of the direction of travel). */
  nx: number;
  ny: number;
  /** Normalized pressure 0–1 (1 for mouse). */
  pressure: number;
  /** Arc length from the start of the path. */
  s: number;
};
export type StrandPath = { samples: StrandPathSample[]; length: number; step: number };

/**
 * Drop samples closer than `minDistance` to the last kept one (always keeping
 * the final sample) and thin very long inputs to a bounded count.
 */
export function thinStrandInput(points: readonly StrandInputPoint[], minDistance = 2): StrandInputPoint[] {
  const valid = points.filter((point) => finite(point.x) && finite(point.y));
  if (valid.length === 0) return [];
  const kept: StrandInputPoint[] = [valid[0]];
  for (let index = 1; index < valid.length; index += 1) {
    const point = valid[index],
      last = kept[kept.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) >= minDistance) kept.push(point);
    else if (index === valid.length - 1 && kept.length > 1) kept[kept.length - 1] = point;
  }
  if (kept.length <= BRUSH_STRANDS_MAX_INPUT_POINTS) return kept;
  const stride = kept.length / BRUSH_STRANDS_MAX_INPUT_POINTS,
    thinned: StrandInputPoint[] = [];
  for (let index = 0; index < BRUSH_STRANDS_MAX_INPUT_POINTS - 1; index += 1) thinned.push(kept[Math.floor(index * stride)]);
  thinned.push(kept[kept.length - 1]);
  return thinned;
}

type Vec = { x: number; y: number; p: number };

/** One centripetal Catmull-Rom point between p1 and p2 (u in [0, 1]). */
function catmullRom(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Vec {
  const knot = (a: Vec, b: Vec) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  const t0 = 0,
    t1 = t0 + knot(p0, p1),
    t2 = t1 + knot(p1, p2),
    t3 = t2 + knot(p2, p3),
    t = t1 + (t2 - t1) * u;
  const lerp = (a: Vec, b: Vec, ta: number, tb: number): Vec => {
    const wa = (tb - t) / (tb - ta),
      wb = (t - ta) / (tb - ta);
    return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, p: a.p * wa + b.p * wb };
  };
  const a1 = lerp(p0, p1, t0, t1),
    a2 = lerp(p1, p2, t1, t2),
    a3 = lerp(p2, p3, t2, t3),
    b1 = lerp(a1, a2, t0, t2),
    b2 = lerp(a2, a3, t1, t3),
    c = lerp(b1, b2, t1, t2);
  // Pressure follows the segment linearly; extrapolated control points could overshoot it.
  return { x: c.x, y: c.y, p: p1.p + (p2.p - p1.p) * u };
}

/**
 * Smooth pointer samples into an evenly spaced path with box-filtered unit
 * normals. `smoothing` is the half-window (in path pixels) over which the
 * direction is averaged; wider ribbons need more so the inner side of a
 * bend does not fold.
 */
export function smoothStrandPath(
  points: readonly StrandInputPoint[],
  options: { step?: number; smoothing?: number; maxSamples?: number } = {},
): StrandPath {
  const input = thinStrandInput(points);
  const maxSamples = Math.max(2, Math.floor(options.maxSamples ?? BRUSH_STRANDS_MAX_SAMPLES));
  if (input.length === 0) return { samples: [], length: 0, step: 1 };
  const vec = (point: StrandInputPoint): Vec => ({
    x: point.x,
    y: point.y,
    p: finite(point.pressure) ? clamp(point.pressure, 0, 1) : 1,
  });
  if (input.length === 1) {
    const only = vec(input[0]);
    return { samples: [{ x: only.x, y: only.y, nx: 0, ny: -1, pressure: only.p, s: 0 }], length: 0, step: 1 };
  }
  // Dense spline polyline.
  const control = input.map(vec),
    first = control[0],
    last = control[control.length - 1],
    second = control[1],
    beforeLast = control[control.length - 2],
    extended = [
      { x: 2 * first.x - second.x, y: 2 * first.y - second.y, p: first.p },
      ...control,
      { x: 2 * last.x - beforeLast.x, y: 2 * last.y - beforeLast.y, p: last.p },
    ];
  const dense: Vec[] = [control[0]];
  for (let index = 1; index < extended.length - 2; index += 1) {
    const p1 = extended[index],
      p2 = extended[index + 1],
      chord = Math.hypot(p2.x - p1.x, p2.y - p1.y),
      steps = clamp(Math.ceil(chord / 1.5), 1, 256);
    for (let step = 1; step <= steps; step += 1)
      dense.push(catmullRom(extended[index - 1], p1, p2, extended[index + 2], step / steps));
  }
  const cumulative = [0];
  for (let index = 1; index < dense.length; index += 1)
    cumulative.push(cumulative[index - 1] + Math.hypot(dense[index].x - dense[index - 1].x, dense[index].y - dense[index - 1].y));
  const length = cumulative[cumulative.length - 1];
  if (!(length > 0)) {
    return { samples: [{ x: first.x, y: first.y, nx: 0, ny: -1, pressure: first.p, s: 0 }], length: 0, step: 1 };
  }
  // Even arc-length resampling.
  const step = Math.max(options.step ?? 2, length / (maxSamples - 1), 0.25),
    count = Math.max(2, Math.ceil(length / step) + 1),
    actualStep = length / (count - 1),
    samples: StrandPathSample[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const s = Math.min(length, index * actualStep);
    while (cursor < cumulative.length - 2 && cumulative[cursor + 1] < s) cursor += 1;
    const span = cumulative[cursor + 1] - cumulative[cursor],
      f = span > 0 ? (s - cumulative[cursor]) / span : 0,
      a = dense[cursor],
      b = dense[cursor + 1];
    samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, nx: 0, ny: 0, pressure: a.p + (b.p - a.p) * f, s });
  }
  // Tangents by central difference, then a box filter (prefix sums).
  const tx = new Float64Array(count),
    ty = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    const a = samples[Math.max(0, index - 1)],
      b = samples[Math.min(count - 1, index + 1)],
      dx = b.x - a.x,
      dy = b.y - a.y,
      norm = Math.hypot(dx, dy) || 1;
    tx[index] = dx / norm;
    ty[index] = dy / norm;
  }
  const radius = clamp(Math.round((options.smoothing ?? 0) / actualStep), 0, 400),
    sumX = new Float64Array(count + 1),
    sumY = new Float64Array(count + 1);
  for (let index = 0; index < count; index += 1) {
    sumX[index + 1] = sumX[index] + tx[index];
    sumY[index + 1] = sumY[index] + ty[index];
  }
  let previousX = tx[0],
    previousY = ty[0];
  for (let index = 0; index < count; index += 1) {
    const lo = Math.max(0, index - radius),
      hi = Math.min(count, index + radius + 1);
    let dx = sumX[hi] - sumX[lo],
      dy = sumY[hi] - sumY[lo];
    const norm = Math.hypot(dx, dy);
    // A full reversal can cancel out; keep the previous direction then.
    if (norm < 1e-6) {
      dx = previousX;
      dy = previousY;
    } else {
      dx /= norm;
      dy /= norm;
    }
    previousX = dx;
    previousY = dy;
    samples[index].nx = dy;
    samples[index].ny = -dx;
  }
  return { samples, length, step: actualStep };
}

/** Seeded per-strand parameters. */
export type StrandParams = {
  index: number;
  /** Ribbon coordinate in [-1, 1]. */
  u: number;
  /** Normalized start and end of the strand along the stroke. */
  start: number;
  end: number;
  /** Peak opacity multiplier in (0, 1]. */
  peak: number;
  a1: number;
  f1: number;
  p1: number;
  a2: number;
  f2: number;
  p2: number;
};

/** Largest share of the stroke a strand may start late or end early. */
const STRAND_WINDOW_STAGGER = 0.16;
const WOBBLE_A1 = 0.35;
const WOBBLE_A2 = 0.15;
/** How much the strands on the far side of the twist are dimmed. */
const STRAND_DEPTH_SHADE = 0.25;

export function strandParams(settings: BrushStrandSettings, index: number): StrandParams {
  const { count, seed } = settings,
    random = (channel: number) => strandRandom(seed, index, channel),
    wobble = settings.wobble / 100,
    spacing = count > 1 ? 2 / (count - 1) : 0,
    u = count > 1 ? clamp(-1 + index * spacing + (random(0) - 0.5) * spacing * 0.6, -1, 1) : 0;
  return {
    index,
    u,
    start: random(1) * STRAND_WINDOW_STAGGER,
    end: 1 - random(2) * STRAND_WINDOW_STAGGER,
    peak: 1 - (settings.opacityJitter / 100) * random(3) * 0.9,
    a1: wobble * WOBBLE_A1 * (0.4 + 0.6 * random(4)),
    f1: 0.5 + 2 * random(5),
    p1: random(6) * Math.PI * 2,
    a2: wobble * WOBBLE_A2 * (0.4 + 0.6 * random(7)),
    f2: 2 + 3 * random(8),
    p2: random(9) * Math.PI * 2,
  };
}

/** The twist phase shared by every strand of one stroke. */
export function strandPhase(settings: BrushStrandSettings): number {
  return strandRandom(settings.seed, -1, 0) * Math.PI * 2;
}

/** Ribbon half-width taper along the stroke: 0 at both ends, 1 in the middle. */
export function strandTaper(t: number): number {
  return Math.sqrt(Math.max(0, Math.sin(Math.PI * clamp(t, 0, 1))));
}

/**
 * Signed offset of a strand from the path at normalized position t, in
 * pixels. |offset| never exceeds halfWidth × taper(t).
 */
export function strandOffset(t: number, params: StrandParams, settings: BrushStrandSettings, phase = strandPhase(settings)): number {
  const wobble = settings.wobble / 100,
    norm = 1 + (WOBBLE_A1 + WOBBLE_A2) * wobble,
    twist = params.u * Math.cos(phase + settings.twists * Math.PI * 2 * t),
    drift =
      params.a1 * Math.sin(params.f1 * Math.PI * 2 * t + params.p1) +
      params.a2 * Math.sin(params.f2 * Math.PI * 2 * t + params.p2);
  return (settings.width / 2) * strandTaper(t) * ((twist + drift) / norm);
}

/** Opacity envelope within a strand's own window (0 outside it). */
export function strandEnvelope(t: number, params: StrandParams): number {
  const span = params.end - params.start;
  if (span <= 0 || t <= params.start || t >= params.end) return 0;
  return Math.pow(Math.sin(Math.PI * ((t - params.start) / span)), 0.8);
}

/** Thickness taper within a strand's own window (0 outside it). */
export function strandThicknessTaper(t: number, params: StrandParams): number {
  const span = params.end - params.start;
  if (span <= 0 || t <= params.start || t >= params.end) return 0;
  return Math.sqrt(Math.sin(Math.PI * ((t - params.start) / span)));
}

export type StrandVertex = { x: number; y: number; width: number; alpha: number };
export type Strand = { index: number; u: number; vertices: StrandVertex[] };

export type StrandBuildOptions = {
  /** Strand line width in pixels at full pressure (the brush Size). */
  strandWidth: number;
  /** Multiplier on thickness for a normalized pressure (pressure → size). */
  sizeAt?: (pressure: number) => number;
  /** Multiplier on opacity for a normalized pressure (pressure → opacity). */
  opacityAt?: (pressure: number) => number;
};

/**
 * Build every strand of one stroke along a smoothed path. Vertices outside a
 * strand's window are omitted, so each strand is one open polyline.
 */
export function buildStrands(path: StrandPath, settings: BrushStrandSettings, options: StrandBuildOptions): Strand[] {
  const normalized = normalizeBrushStrands(settings),
    { samples, length } = path,
    phase = strandPhase(normalized),
    baseWidth = Math.max(0.1, finite(options.strandWidth) ? options.strandWidth : 1),
    strands: Strand[] = [];
  if (samples.length < 2 || !(length > 0)) return strands;
  for (let index = 0; index < normalized.count; index += 1) {
    const params = strandParams(normalized, index),
      vertices: StrandVertex[] = [];
    for (const sample of samples) {
      const t = sample.s / length,
        envelope = strandEnvelope(t, params);
      if (envelope <= 0) continue;
      const offset = strandOffset(t, params, normalized, phase),
        // Strands on the far side of the twist are a little dimmer.
        depth = 1 - STRAND_DEPTH_SHADE * 0.5 * (1 + params.u * Math.sin(phase + normalized.twists * Math.PI * 2 * t)),
        sizeScale = options.sizeAt ? clamp(options.sizeAt(sample.pressure), 0, 1) : 1,
        opacityScale = options.opacityAt ? clamp(options.opacityAt(sample.pressure), 0, 1) : 1;
      vertices.push({
        x: sample.x + sample.nx * offset,
        y: sample.y + sample.ny * offset,
        width: Math.max(0.05, baseWidth * sizeScale * strandThicknessTaper(t, params)),
        alpha: clamp(params.peak * envelope * depth * opacityScale, 0, 1),
      });
    }
    if (vertices.length >= 2) strands.push({ index, u: params.u, vertices });
  }
  return strands;
}

/** Axis-aligned bounds of the strands including half their line width, or null. */
export function strandBounds(strands: readonly Strand[]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const strand of strands)
    for (const vertex of strand.vertices) {
      const reach = vertex.width / 2 + 1;
      minX = Math.min(minX, vertex.x - reach);
      minY = Math.min(minY, vertex.y - reach);
      maxX = Math.max(maxX, vertex.x + reach);
      maxY = Math.max(maxY, vertex.y + reach);
    }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Path-sampling options suited to a ribbon of this width. */
export function strandPathOptions(settings: BrushStrandSettings): { step: number; smoothing: number } {
  const width = normalizeBrushStrands(settings).width;
  return { step: clamp(width / 60, 1, 4), smoothing: Math.min(width * 0.5, 120) };
}

/** Minimal 2D context used to draw strands (a real CanvasRenderingContext2D fits). */
export type StrandDrawContext = {
  globalAlpha: number;
  lineWidth: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
};

/**
 * Draw strands as polylines. Consecutive segments whose opacity (1/64 steps)
 * and width (¼ px steps) round to the same values share one path, so joints
 * inside a run never double up alpha and a stroke needs few draw calls.
 * Returns the number of `stroke()` calls.
 */
export function drawStrands(context: StrandDrawContext, strands: readonly Strand[], color: string, opacity = 1): number {
  const level = clamp(finite(opacity) ? opacity : 1, 0, 1);
  let calls = 0;
  context.save();
  context.strokeStyle = color;
  context.lineCap = 'butt';
  context.lineJoin = 'round';
  for (const strand of strands) {
    const { vertices } = strand;
    let runStart = 0;
    const key = (index: number) => {
      const a = vertices[index],
        b = vertices[index + 1];
      return `${Math.round(((a.alpha + b.alpha) / 2) * 64)}:${Math.round(((a.width + b.width) / 2) * 4)}`;
    };
    for (let index = 0; index < vertices.length - 1; index += 1) {
      const runKey = key(runStart);
      if (index + 1 < vertices.length - 1 && key(index + 1) === runKey) continue;
      const [alphaStep, widthStep] = runKey.split(':').map(Number),
        alpha = (alphaStep / 64) * level;
      if (alpha > 0) {
        context.globalAlpha = alpha;
        context.lineWidth = Math.max(0.05, widthStep / 4);
        context.beginPath();
        context.moveTo(vertices[runStart].x, vertices[runStart].y);
        for (let vertex = runStart + 1; vertex <= index + 1; vertex += 1) context.lineTo(vertices[vertex].x, vertices[vertex].y);
        context.stroke();
        calls += 1;
      }
      runStart = index + 1;
    }
  }
  context.restore();
  return calls;
}

/** Count sign changes of (a − b) along t in (0, 1) — how often two strands cross. */
export function strandCrossings(
  settings: BrushStrandSettings,
  a: StrandParams,
  b: StrandParams,
  samples = 2000,
): number {
  const phase = strandPhase(settings);
  let crossings = 0,
    previous = 0;
  for (let index = 1; index < samples; index += 1) {
    const t = index / samples,
      difference = strandOffset(t, a, settings, phase) - strandOffset(t, b, settings, phase);
    if (difference === 0) continue;
    const sign = Math.sign(difference);
    if (previous !== 0 && sign !== previous) crossings += 1;
    previous = sign;
  }
  return crossings;
}
