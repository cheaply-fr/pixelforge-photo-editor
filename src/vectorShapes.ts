/** Deterministic geometry shared by editable parametric shape rendering/tests. */
export type ParametricShapeVariant = 'polygon' | 'triangle' | 'star';
export type ShapePoint = { x: number; y: number };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function validateShapeVariant(value: unknown): ParametricShapeVariant {
  if (value === undefined || value === 'polygon') return 'polygon';
  if (value === 'triangle' || value === 'star') return value;
  throw new Error('Shape variant is invalid');
}

/** Return clockwise vertices centred in a local layer box. */
export function shapePoints(
  width: number,
  height: number,
  variant: ParametricShapeVariant = 'polygon',
  sides = 5,
  innerRadius = 0.5,
): ShapePoint[] {
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0)
    throw new Error('Shape dimensions are invalid');
  const normalized = validateShapeVariant(variant);
  if (!Number.isInteger(sides) || sides < 3 || sides > 32)
    throw new Error('Shape sides are invalid');
  if (!finite(innerRadius) || innerRadius < 0.1 || innerRadius > 0.9)
    throw new Error('Shape inner radius is invalid');
  const count = normalized === 'triangle' ? 3 : normalized === 'star' ? sides * 2 : sides;
  const points: ShapePoint[] = [];
  const cx = width / 2, cy = height / 2, rx = width / 2, ry = height / 2;
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const radius = normalized === 'star' && index % 2 === 1 ? innerRadius : 1;
    points.push({ x: cx + Math.cos(angle) * rx * radius, y: cy + Math.sin(angle) * ry * radius });
  }
  return points;
}

export function shapeBounds(points: readonly ShapePoint[]) {
  if (!points.length) throw new Error('Shape needs points');
  if (!points.every((point) => finite(point.x) && finite(point.y)))
    throw new Error('Shape points are invalid');
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Largest stored rectangle corner radius; rendering also clamps per box. */
export const CORNER_RADIUS_MAX = 8000;
/** Cubic Bezier constant that approximates a quarter circle. */
export const QUARTER_CIRCLE_KAPPA = 0.5522847498307936;

export type RoundedRectNode = ShapePoint & {
  inHandle?: ShapePoint;
  outHandle?: ShapePoint;
};

/**
 * Effective corner radius for a width × height rectangle. Missing, negative or
 * non-finite radii render square (legacy drafts); radii larger than half the
 * shorter side are clamped so opposite corners meet instead of overlapping.
 */
export function clampCornerRadius(radius: unknown, width: number, height: number): number {
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return 0;
  if (!finite(radius) || radius <= 0) return 0;
  return Math.min(radius, width / 2, height / 2);
}

/** Validate a stored corner radius (absent means 0). */
export function validCornerRadius(value: unknown): boolean {
  return value === undefined || (finite(value) && value >= 0 && value <= CORNER_RADIUS_MAX);
}

/**
 * Closed, clockwise anchors for a (rounded) rectangle in its local box. With a
 * zero radius the four corners are returned; otherwise eight anchors carry
 * cubic handles for the quarter-circle corners, ready for canvas, CSS and SVG
 * path serializers that understand `inHandle`/`outHandle`.
 */
export function roundedRectNodes(width: number, height: number, radius: unknown): RoundedRectNode[] {
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0)
    throw new Error('Shape dimensions are invalid');
  const r = clampCornerRadius(radius, width, height);
  if (r === 0)
    return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const k = r * QUARTER_CIRCLE_KAPPA, w = width, h = height;
  return [
    { x: r, y: 0, inHandle: { x: r - k, y: 0 } },
    { x: w - r, y: 0, outHandle: { x: w - r + k, y: 0 } },
    { x: w, y: r, inHandle: { x: w, y: r - k } },
    { x: w, y: h - r, outHandle: { x: w, y: h - r + k } },
    { x: w - r, y: h, inHandle: { x: w - r + k, y: h } },
    { x: r, y: h, outHandle: { x: r - k, y: h } },
    { x: 0, y: h - r, inHandle: { x: 0, y: h - r + k } },
    { x: 0, y: r, outHandle: { x: 0, y: r - k } },
  ];
}

/**
 * Flattened polygon of a (rounded) rectangle for polygon-only consumers such
 * as path booleans. Each corner uses `segments` true-circle chords.
 */
export function roundedRectPoints(width: number, height: number, radius: unknown, segments = 8): ShapePoint[] {
  if (!finite(width) || !finite(height) || width <= 0 || height <= 0)
    throw new Error('Shape dimensions are invalid');
  const r = clampCornerRadius(radius, width, height);
  if (r === 0)
    return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const steps = Math.max(1, Math.min(64, Math.round(segments)));
  const corners: [number, number, number][] = [
    [width - r, r, -Math.PI / 2],
    [width - r, height - r, 0],
    [r, height - r, Math.PI / 2],
    [r, r, Math.PI],
  ];
  const points: ShapePoint[] = [];
  for (const [cx, cy, start] of corners)
    for (let step = 0; step <= steps; step += 1) {
      const angle = start + (step / steps) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
  return points;
}

export type ShapeDragBox = { left: number; top: number; width: number; height: number };

/**
 * Photoshop-style shape drag box. Shift constrains the box to `aspect`
 * (width / height, 1 for a square); Alt/Option drags from the centre.
 */
export function shapeDragBox(
  start: ShapePoint,
  end: ShapePoint,
  options: { proportional?: boolean; fromCenter?: boolean; aspect?: number } = {},
): ShapeDragBox {
  let dx = end.x - start.x, dy = end.y - start.y;
  if (options.proportional) {
    const aspect = finite(options.aspect) && options.aspect > 0 ? options.aspect : 1;
    const size = Math.max(Math.abs(dx) / aspect, Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * size * aspect;
    dy = (dy < 0 ? -1 : 1) * size;
  }
  if (options.fromCenter)
    return { left: start.x - Math.abs(dx), top: start.y - Math.abs(dy), width: Math.abs(dx) * 2, height: Math.abs(dy) * 2 };
  return { left: Math.min(start.x, start.x + dx), top: Math.min(start.y, start.y + dy), width: Math.abs(dx), height: Math.abs(dy) };
}
