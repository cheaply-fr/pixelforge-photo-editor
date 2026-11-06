/**
 * Bound freehand, polygonal and magnetic lasso paths to the document canvas.
 *
 * A lasso drag may leave the canvas (pointer capture keeps delivering moves),
 * but a stored polygon selection must keep every vertex inside the frame.
 * Photoshop clips such a lasso to the canvas rather than rejecting it, so the
 * path is clipped exactly against the frame rectangle (Sutherland–Hodgman).
 * Each run of the path outside one frame edge is replaced by a segment along
 * that edge; the loop formed by the two lies entirely outside the canvas, so
 * the nonzero winding coverage of every in-canvas pixel is unchanged.
 */

export type SelectionPolygonPoint = { x: number; y: number };

export type BoundedSelectionPolygon =
  | {
      ok: true;
      points: SelectionPolygonPoint[];
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      ok: false;
      /** `outside`: the path left the canvas and nothing usable remains inside. */
      reason: 'too-few-points' | 'outside' | 'empty';
    };

/** Matches the document validator's polygon vertex limit. */
export const MAX_SELECTION_POLYGON_POINTS = 10000;

const EPSILON = 1e-9;

const finitePoint = (point: SelectionPolygonPoint | undefined) =>
  Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y);

const samePoint = (a: SelectionPolygonPoint, b: SelectionPolygonPoint) =>
  Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;

/** Drop consecutive duplicates, including the closing wrap-around. */
function dedupe(points: SelectionPolygonPoint[]) {
  const out: SelectionPolygonPoint[] = [];
  for (const point of points)
    if (!out.length || !samePoint(out[out.length - 1], point)) out.push(point);
  while (out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** Evenly thin a path so it fits the stored vertex limit. */
export function limitPolygonPoints(
  points: readonly SelectionPolygonPoint[],
  max = MAX_SELECTION_POLYGON_POINTS,
): SelectionPolygonPoint[] {
  if (points.length <= max) return points.slice();
  const out: SelectionPolygonPoint[] = [];
  for (let index = 0; index < max; index += 1)
    out.push(points[Math.floor((index * points.length) / max)]);
  return out;
}

type Edge = {
  inside: (point: SelectionPolygonPoint) => boolean;
  cross: (a: SelectionPolygonPoint, b: SelectionPolygonPoint) => SelectionPolygonPoint;
};

const verticalEdge = (x: number, keepGreater: boolean): Edge => ({
  inside: (point) => (keepGreater ? point.x >= x : point.x <= x),
  cross: (a, b) => {
    const t = (x - a.x) / (b.x - a.x);
    return { x, y: a.y + t * (b.y - a.y) };
  },
});

const horizontalEdge = (y: number, keepGreater: boolean): Edge => ({
  inside: (point) => (keepGreater ? point.y >= y : point.y <= y),
  cross: (a, b) => {
    const t = (y - a.y) / (b.y - a.y);
    return { x: a.x + t * (b.x - a.x), y };
  },
});

/**
 * Clip a closed polygon to `[0, width] × [0, height]`. The result may contain
 * zero-width runs along the frame border; it is empty when the polygon has no
 * part on the canvas side of some frame edge.
 */
export function clipPolygonToFrame(
  points: readonly SelectionPolygonPoint[],
  width: number,
  height: number,
): SelectionPolygonPoint[] {
  let output = points.filter(finitePoint).map((point) => ({ x: point.x, y: point.y }));
  const edges = [
    verticalEdge(0, true),
    verticalEdge(width, false),
    horizontalEdge(0, true),
    horizontalEdge(height, false),
  ];
  for (const edge of edges) {
    const input = output;
    output = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    for (const current of input) {
      const currentInside = edge.inside(current),
        previousInside = edge.inside(previous);
      if (currentInside) {
        if (!previousInside) output.push(edge.cross(previous, current));
        output.push(current);
      } else if (previousInside) output.push(edge.cross(previous, current));
      previous = current;
    }
  }
  // Guard against floating-point drift at the intersections.
  return dedupe(
    output.map((point) => ({
      x: Math.max(0, Math.min(width, point.x)),
      y: Math.max(0, Math.min(height, point.y)),
    })),
  );
}

/**
 * Vertices of the ellipse inscribed in a box, dense enough that each chord is
 * at most ~2 document pixels (64–4096 vertices). Used when an Elliptical
 * Marquee extends past the canvas, so the true ellipse can be clipped rather
 * than squashed into the clamped box.
 */
export function ellipsePolygon(
  x: number,
  y: number,
  w: number,
  h: number,
): SelectionPolygonPoint[] {
  const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
  const cx = x + w / 2, cy = y + h / 2;
  const count = Math.max(64, Math.min(4096, Math.ceil((Math.PI * 2 * Math.max(rx, ry)) / 2)));
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

/** Absolute shoelace area. */
export function polygonArea(points: readonly SelectionPolygonPoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function collinear(points: readonly SelectionPolygonPoint[]) {
  const origin = points[0];
  let far = origin, farDistance = 0;
  for (const point of points) {
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    if (distance > farDistance) {
      far = point;
      farDistance = distance;
    }
  }
  if (farDistance <= EPSILON) return true;
  const dx = far.x - origin.x, dy = far.y - origin.y;
  return points.every(
    (point) => Math.abs(dx * (point.y - origin.y) - dy * (point.x - origin.x)) / farDistance <= 1e-6,
  );
}

const onBorder = (point: SelectionPolygonPoint, width: number, height: number) =>
  point.x <= EPSILON ||
  point.y <= EPSILON ||
  point.x >= width - EPSILON ||
  point.y >= height - EPSILON;

/**
 * Turn a raw lasso path into a polygon selection that fits the frame, or say
 * why there is nothing to select. A path already inside the frame is returned
 * with its vertices unchanged.
 */
export function boundSelectionPolygon(
  rawPoints: readonly SelectionPolygonPoint[],
  width: number,
  height: number,
): BoundedSelectionPolygon {
  if (!(width > 0) || !(height > 0)) return { ok: false, reason: 'empty' };
  const source = rawPoints.filter(finitePoint);
  if (source.length < 3) return { ok: false, reason: 'too-few-points' };
  const leftFrame = source.some(
    (point) => point.x < 0 || point.y < 0 || point.x > width || point.y > height,
  );
  const points = limitPolygonPoints(
    leftFrame ? clipPolygonToFrame(limitPolygonPoints(source), width, height) : source,
  );
  const fail = (): BoundedSelectionPolygon => ({
    ok: false,
    reason: leftFrame ? 'outside' : 'empty',
  });
  if (points.length < 3) return fail();
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const point of points) {
    x = Math.min(x, point.x);
    y = Math.min(y, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  // Stored selections need at least one pixel of extent on each axis.
  if (right - x < 1 || bottom - y < 1) return fail();
  // A path that never enters the canvas clips to a zero-area walk along the
  // border; a back-and-forth stroke is a zero-area line. Both select nothing.
  if (
    polygonArea(points) < 0.5 &&
    (collinear(points) || points.every((point) => onBorder(point, width, height)))
  )
    return fail();
  return { ok: true, points, x, y, w: right - x, h: bottom - y };
}
