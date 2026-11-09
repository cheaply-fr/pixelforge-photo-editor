/**
 * Stroke Path with Brush: a bounded local approximation of stroking a Pen
 * path with a paint tool and simulated pressure.
 *
 * The pure half of the feature lives here. A path layer's cubic Bezier
 * contours are mapped through an affine matrix (path layer → canvas → target
 * raster layer), flattened adaptively into polylines and then sampled at
 * arc-length intervals. Each sample carries a simulated pressure derived from
 * start/end taper lengths with a smooth ease, and the resulting size/opacity
 * multipliers. Nothing here touches the DOM, and every result is a pure
 * function of its inputs so a replayed stroke produces identical pixels.
 */
import { pathContours, validatePath, type PathMatrix, type PathModel, type PathNode } from './paths.ts';

export const STROKE_PATH_TOOLS = ['brush', 'pencil', 'eraser', 'smudge'] as const;
export type StrokePathTool = (typeof STROKE_PATH_TOOLS)[number];
export const STROKE_PATH_TOOL_LABELS: Readonly<Record<StrokePathTool, string>> = Object.freeze({
  brush: 'Brush',
  pencil: 'Pencil',
  eraser: 'Eraser',
  smudge: 'Smudge',
});
export const STROKE_PATH_SCOPES = ['selected', 'all'] as const;
export type StrokePathScope = (typeof STROKE_PATH_SCOPES)[number];

/** Upper bound for dab positions in one command, across all contours. */
export const STROKE_PATH_MAX_SAMPLES = 20_000;

/**
 * Sample budget when Paint Symmetry replicates every dab `copies` times: the
 * painted dab total (samples × copies) stays within `STROKE_PATH_MAX_SAMPLES`,
 * so spacing widens (reported as `limited`) instead of the command painting
 * up to 128× more dabs. One copy keeps the unchanged budget.
 */
export function strokePathMaxSamplesForCopies(copies: number): number {
  const count = Number.isFinite(copies) ? Math.max(1, Math.floor(copies)) : 1;
  return Math.max(1, Math.floor(STROKE_PATH_MAX_SAMPLES / count));
}
/** Upper bound for flattened polyline vertices, across all contours. */
export const STROKE_PATH_MAX_FLAT_POINTS = 250_000;
/** Recursion depth for cubic flattening (2^12 pieces per segment at most). */
export const STROKE_PATH_MAX_DEPTH = 12;
export const STROKE_PATH_DEFAULT_TOLERANCE = 0.2;
/** Smallest arc-length step, in target pixels. */
export const STROKE_PATH_MIN_STEP = 0.5;
/** Largest path-to-target scale accepted (keeps flattening bounded). */
const MAX_COORDINATE = 4_000_000;

export type StrokePathSettings = {
  tool: StrokePathTool;
  /** Off: every sample has full pressure. */
  simulatePressure: boolean;
  /** Fraction of each contour's length that ramps in, 0–100%. */
  taperStart: number;
  /** Fraction of each contour's length that ramps out, 0–100%. */
  taperEnd: number;
  /** Diameter at zero pressure as a percentage of the brush size, 0–100%. */
  minSize: number;
  /** Simulated pressure scales the dab diameter. */
  pressureSize: boolean;
  /** Simulated pressure scales the dab opacity (or Smudge strength). */
  pressureOpacity: boolean;
  /** Stroke the chosen path layer, or every visible path layer. */
  scope: StrokePathScope;
};

export const DEFAULT_STROKE_PATH_SETTINGS: Readonly<StrokePathSettings> = Object.freeze({
  tool: 'brush',
  simulatePressure: true,
  taperStart: 25,
  taperEnd: 25,
  minSize: 0,
  pressureSize: true,
  pressureOpacity: false,
  scope: 'selected',
});

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const percent = (value: unknown, fallback: number) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return finite(number) ? Math.round(clamp(number, 0, 100)) : fallback;
};

/** Accept persisted/dialog input and return complete bounded settings. */
export function normalizeStrokePathSettings(value: unknown): StrokePathSettings {
  const input = value && typeof value === 'object' ? value as Partial<Record<keyof StrokePathSettings, unknown>> : {};
  const fallback = DEFAULT_STROKE_PATH_SETTINGS;
  const bool = (candidate: unknown, otherwise: boolean) => typeof candidate === 'boolean' ? candidate : otherwise;
  // Overlapping ramps (start + end > 100%) are allowed: pressure is the
  // smaller ramp, so the stroke simply never reaches full pressure.
  return {
    tool: STROKE_PATH_TOOLS.includes(input.tool as StrokePathTool) ? input.tool as StrokePathTool : fallback.tool,
    simulatePressure: bool(input.simulatePressure, fallback.simulatePressure),
    taperStart: percent(input.taperStart, fallback.taperStart),
    taperEnd: percent(input.taperEnd, fallback.taperEnd),
    minSize: percent(input.minSize, fallback.minSize),
    pressureSize: bool(input.pressureSize, fallback.pressureSize),
    pressureOpacity: bool(input.pressureOpacity, fallback.pressureOpacity),
    scope: STROKE_PATH_SCOPES.includes(input.scope as StrokePathScope) ? input.scope as StrokePathScope : fallback.scope,
  };
}

/** Smooth ease used by tapers: 0 at the tip, 1 at full pressure, C1 continuous. */
export function taperEase(t: number): number {
  if (!finite(t) || t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Simulated pressure at `distance` along a contour of `length` pixels.
 * Without simulation, or with no taper, pressure stays at 1. A zero-length
 * contour (a single anchor) is a full-pressure dot.
 */
export function strokePathPressure(
  distance: number,
  length: number,
  settings: Pick<StrokePathSettings, 'simulatePressure' | 'taperStart' | 'taperEnd'>,
): number {
  if (!settings.simulatePressure || !finite(length) || length <= 0) return 1;
  const d = clamp(finite(distance) ? distance : 0, 0, length),
    startLength = length * clamp(settings.taperStart, 0, 100) / 100,
    endLength = length * clamp(settings.taperEnd, 0, 100) / 100,
    rampIn = startLength > 0 ? taperEase(d / startLength) : 1,
    rampOut = endLength > 0 ? taperEase((length - d) / endLength) : 1;
  return Math.min(rampIn, rampOut);
}

/** Size and opacity multipliers for a simulated pressure in [0, 1]. */
export function strokePathScales(
  pressure: number,
  settings: Pick<StrokePathSettings, 'minSize' | 'pressureSize' | 'pressureOpacity'>,
): { sizeScale: number; opacityScale: number } {
  const p = clamp(finite(pressure) ? pressure : 1, 0, 1),
    floor = clamp(settings.minSize, 0, 100) / 100;
  return {
    sizeScale: settings.pressureSize ? floor + (1 - floor) * p : 1,
    opacityScale: settings.pressureOpacity ? p : 1,
  };
}

export const IDENTITY_PATH_MATRIX: PathMatrix = Object.freeze([1, 0, 0, 1, 0, 0]) as unknown as PathMatrix;

const validMatrix = (matrix: unknown): matrix is PathMatrix =>
  Array.isArray(matrix) && matrix.length === 6 && matrix.every(finite);

/** `outer ∘ inner`: apply `inner` first, then `outer` (canvas setTransform order). */
export function multiplyPathMatrix(outer: PathMatrix, inner: PathMatrix): PathMatrix {
  const [a, b, c, d, e, f] = outer, [A, B, C, D, E, F] = inner;
  return [
    a * A + c * B,
    b * A + d * B,
    a * C + c * D,
    b * C + d * D,
    a * E + c * F + e,
    b * E + d * F + f,
  ];
}

export function invertPathMatrix(matrix: PathMatrix): PathMatrix | null {
  if (!validMatrix(matrix)) return null;
  const [a, b, c, d, e, f] = matrix, determinant = a * d - b * c;
  if (!finite(determinant) || Math.abs(determinant) < 1e-12) return null;
  return [
    d / determinant,
    -b / determinant,
    -c / determinant,
    a / determinant,
    (c * f - d * e) / determinant,
    (b * e - a * f) / determinant,
  ];
}

/**
 * Matrix taking a path layer's local coordinates into a target raster
 * layer's pixel space: canvas = pathMatrix · local, target = targetMatrix⁻¹ · canvas.
 */
export function strokePathTargetMatrix(pathMatrix: PathMatrix, targetMatrix: PathMatrix = IDENTITY_PATH_MATRIX): PathMatrix {
  if (!validMatrix(pathMatrix) || !validMatrix(targetMatrix)) throw new Error('Stroke path matrix is invalid');
  const inverse = invertPathMatrix(targetMatrix);
  if (!inverse) throw new Error('The target layer transform cannot be inverted');
  return multiplyPathMatrix(inverse, pathMatrix);
}

export type StrokePoint = { x: number; y: number };
export type FlatContour = {
  /** Polyline vertices in target space; a closed contour repeats its start at the end. */
  points: StrokePoint[];
  closed: boolean;
  /** Arc length of the polyline (including the closing segment). */
  length: number;
};

const apply = (matrix: PathMatrix, point: StrokePoint): StrokePoint => ({
  x: matrix[0] * point.x + matrix[2] * point.y + matrix[4],
  y: matrix[1] * point.x + matrix[3] * point.y + matrix[5],
});

const lineDistance = (point: StrokePoint, start: StrokePoint, end: StrokePoint) => {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / length;
};

/** Adaptive de Casteljau subdivision; pushes every point after p0. */
const flattenCubic = (
  p0: StrokePoint, p1: StrokePoint, p2: StrokePoint, p3: StrokePoint,
  tolerance: number, depth: number, output: StrokePoint[], budget: { left: number },
) => {
  const flat = Math.max(lineDistance(p1, p0, p3), lineDistance(p2, p0, p3)) <= tolerance;
  if (flat || depth >= STROKE_PATH_MAX_DEPTH) {
    if (--budget.left < 0) throw new Error('This path is too detailed to stroke');
    output.push(p3);
    return;
  }
  const mid = (a: StrokePoint, b: StrokePoint) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
    p01 = mid(p0, p1), p12 = mid(p1, p2), p23 = mid(p2, p3),
    p012 = mid(p01, p12), p123 = mid(p12, p23), center = mid(p012, p123);
  flattenCubic(p0, p01, p012, center, tolerance, depth + 1, output, budget);
  flattenCubic(center, p123, p23, p3, tolerance, depth + 1, output, budget);
};

const polylineLength = (points: StrokePoint[]) => {
  let length = 0;
  for (let index = 1; index < points.length; index += 1)
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  return length;
};

/**
 * Flatten every contour of a path (open or closed, straight or cubic) into a
 * polyline after mapping it through `matrix`. Affine maps preserve Bezier
 * curves, so control points are transformed first and the curve is
 * subdivided in the destination space with `tolerance` pixels of error.
 */
export function flattenStrokePath(
  path: PathModel,
  matrix: PathMatrix = IDENTITY_PATH_MATRIX,
  tolerance = STROKE_PATH_DEFAULT_TOLERANCE,
): FlatContour[] {
  const valid = validatePath(path);
  if (!validMatrix(matrix)) throw new Error('Stroke path matrix is invalid');
  if (!finite(tolerance) || tolerance <= 0) throw new Error('Stroke path tolerance is invalid');
  const budget = { left: STROKE_PATH_MAX_FLAT_POINTS };
  return pathContours(valid).map((contour) => {
    const nodes = contour.nodes.map((node: PathNode) => ({
      anchor: apply(matrix, node),
      inHandle: node.inHandle ? apply(matrix, node.inHandle) : undefined,
      outHandle: node.outHandle ? apply(matrix, node.outHandle) : undefined,
    }));
    for (const node of nodes)
      for (const point of [node.anchor, node.inHandle, node.outHandle])
        if (point && (!finite(point.x) || !finite(point.y) ||
            Math.abs(point.x) > MAX_COORDINATE || Math.abs(point.y) > MAX_COORDINATE))
          throw new Error('The path is too far outside the layer to stroke');
    const points: StrokePoint[] = [nodes[0].anchor];
    budget.left -= 1;
    const segmentCount = contour.closed && nodes.length > 1 ? nodes.length : nodes.length - 1;
    for (let index = 0; index < segmentCount; index += 1) {
      const start = nodes[index], end = nodes[(index + 1) % nodes.length];
      if (!start.outHandle && !end.inHandle) {
        if (--budget.left < 0) throw new Error('This path is too detailed to stroke');
        points.push(end.anchor);
      } else {
        flattenCubic(start.anchor, start.outHandle ?? start.anchor, end.inHandle ?? end.anchor, end.anchor,
          tolerance, 0, points, budget);
      }
    }
    return { points, closed: contour.closed && nodes.length > 1, length: polylineLength(points) };
  });
}

export type StrokePathSample = StrokePoint & {
  /** Index of the contour within the flattened list. */
  contour: number;
  /** Arc-length position within the contour. */
  distance: number;
  pressure: number;
  sizeScale: number;
  opacityScale: number;
  /** Unit tangent of the polyline at the sample (1, 0 for a dot). */
  direction: StrokePoint;
};

export type StrokePathSampling = {
  samples: StrokePathSample[];
  /** True when spacing was widened to respect STROKE_PATH_MAX_SAMPLES. */
  limited: boolean;
  /** Final spacing multiplier applied (1 unless limited). */
  spacingScale: number;
};

export type StrokePathSamplingOptions = Pick<StrokePathSettings,
  'simulatePressure' | 'taperStart' | 'taperEnd' | 'minSize' | 'pressureSize' | 'pressureOpacity'> & {
  /** Full-pressure dab diameter in target pixels. */
  size: number;
  /** Brush spacing as a percentage of the current dab diameter (1–1000). */
  spacing: number;
  maxSamples?: number;
};

/** Cursor that walks a polyline by arc length (monotonic, O(n) overall). */
const walker = (points: StrokePoint[]) => {
  let segment = 0, start = 0;
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  return (distance: number): { point: StrokePoint; direction: StrokePoint } => {
    while (segment < lengths.length - 1 && start + lengths[segment] < distance) {
      start += lengths[segment];
      segment += 1;
    }
    // Skip zero-length segments so the tangent stays meaningful.
    let tangentSegment = segment;
    while (tangentSegment < lengths.length - 1 && lengths[tangentSegment] === 0) tangentSegment += 1;
    while (tangentSegment > 0 && lengths[tangentSegment] === 0) tangentSegment -= 1;
    const a = points[segment], b = points[segment + 1] ?? a, length = lengths[segment] ?? 0,
      t = length > 0 ? clamp((distance - start) / length, 0, 1) : 0,
      ta = points[tangentSegment], tb = points[tangentSegment + 1] ?? ta,
      tangentLength = Math.hypot(tb.x - ta.x, tb.y - ta.y);
    return {
      point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      direction: tangentLength > 0 ? { x: (tb.x - ta.x) / tangentLength, y: (tb.y - ta.y) / tangentLength } : { x: 1, y: 0 },
    };
  };
};

const sampleOnce = (
  contours: FlatContour[], options: StrokePathSamplingOptions, spacingScale: number, maxSamples: number,
): StrokePathSample[] | null => {
  const samples: StrokePathSample[] = [];
  const spacing = clamp(options.spacing, 1, 1000) / 100;
  for (const [contourIndex, contour] of contours.entries()) {
    const at = walker(contour.points), length = contour.length;
    const push = (distance: number) => {
      if (samples.length >= maxSamples) return false;
      const pressure = strokePathPressure(distance, length, options),
        scales = strokePathScales(pressure, options),
        { point, direction } = at(distance);
      samples.push({ ...point, contour: contourIndex, distance, pressure, ...scales, direction });
      return true;
    };
    if (!push(0)) return null;
    if (length <= 0) continue;
    let distance = 0;
    for (;;) {
      // Spacing follows the current (tapered) diameter, like a pressure brush.
      const current = strokePathScales(strokePathPressure(distance, length, options), options).sizeScale,
        step = Math.max(STROKE_PATH_MIN_STEP, options.size * current * spacing) * spacingScale;
      distance += step;
      if (distance >= length - 1e-9) break;
      if (!push(distance)) return null;
    }
    // Open contours end exactly on their last anchor; a closed contour's end
    // is its start, which already has a dab unless the gap is a full step.
    const last = samples[samples.length - 1];
    if (!contour.closed && last.distance < length && !push(length)) return null;
  }
  return samples;
};

/**
 * Evenly spaced dab positions along flattened contours. Spacing follows the
 * brush spacing of the current tapered diameter; when that would exceed
 * `maxSamples`, spacing is widened by powers of two (reported as `limited`).
 */
export function sampleStrokePath(contours: FlatContour[], options: StrokePathSamplingOptions): StrokePathSampling {
  if (!Array.isArray(contours)) throw new Error('Stroke path contours are invalid');
  if (!finite(options.size) || options.size <= 0 || options.size > 10_000) throw new Error('Stroke path brush size is invalid');
  if (!finite(options.spacing)) throw new Error('Stroke path spacing is invalid');
  const maxSamples = Math.max(1, Math.floor(options.maxSamples ?? STROKE_PATH_MAX_SAMPLES));
  if (contours.length > maxSamples) throw new Error('This path has too many contours to stroke');
  for (let spacingScale = 1, attempt = 0; attempt < 40; attempt += 1, spacingScale *= 2) {
    const samples = sampleOnce(contours, options, spacingScale, maxSamples);
    if (samples) return { samples, limited: spacingScale > 1, spacingScale };
  }
  throw new Error('This path is too long to stroke');
}

/** Path layer shape needed to resolve stroke sources (structural, DOM-free). */
export type StrokePathSourceLayer = {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  matrix: PathMatrix;
  path?: PathModel;
};

/**
 * Path layers a stroke command uses: the chosen one, or every visible path
 * layer (bottom to top). Hidden path layers may still be chosen explicitly,
 * like an unfilled work path.
 */
export function strokePathSources<T extends StrokePathSourceLayer>(
  layers: readonly T[], pathLayerId: string | undefined, scope: StrokePathScope,
): T[] {
  const paths = layers.filter((layer) => layer.kind === 'path' && Boolean(layer.path));
  if (scope === 'all') return paths.filter((layer) => layer.visible);
  const chosen = paths.find((layer) => layer.id === pathLayerId);
  return chosen ? [chosen] : [];
}

/**
 * Default path and target for the dialog. The active layer is the target
 * when it is a raster layer; when a path layer is active it becomes the
 * source and the nearest paintable raster layer below it (else above) is the
 * target, so the command also works from the path layer's context.
 */
export function defaultStrokePathChoice<T extends { id: string; kind: string }>(
  layers: readonly T[],
  activeId: string,
  selectedIds: readonly string[] = [],
  paintable: (layer: T) => boolean = (layer) => layer.kind === 'raster',
): { pathLayerId?: string; targetLayerId?: string } {
  const activeIndex = layers.findIndex((layer) => layer.id === activeId),
    active = layers[activeIndex];
  const paths = layers.filter((layer) => layer.kind === 'path');
  const selectedPath = paths.find((layer) => selectedIds.includes(layer.id));
  const pathLayerId = active?.kind === 'path' ? active.id : selectedPath?.id ?? paths[paths.length - 1]?.id;
  let targetLayerId: string | undefined;
  if (active && active.kind !== 'path' && paintable(active)) targetLayerId = active.id;
  else if (activeIndex >= 0) {
    for (let index = activeIndex - 1; index >= 0 && !targetLayerId; index -= 1)
      if (paintable(layers[index])) targetLayerId = layers[index].id;
    for (let index = activeIndex + 1; index < layers.length && !targetLayerId; index += 1)
      if (paintable(layers[index])) targetLayerId = layers[index].id;
  }
  return { pathLayerId, targetLayerId };
}

/** Plan every dab for a set of path layers in one target's pixel space. */
export function planStrokePath(
  sources: readonly { path: PathModel; matrix: PathMatrix }[],
  targetMatrix: PathMatrix,
  options: StrokePathSamplingOptions,
  tolerance = STROKE_PATH_DEFAULT_TOLERANCE,
): StrokePathSampling & { contours: FlatContour[] } {
  const contours = sources.flatMap((source) =>
    flattenStrokePath(source.path, strokePathTargetMatrix(source.matrix, targetMatrix), tolerance));
  return { ...sampleStrokePath(contours, options), contours };
}
