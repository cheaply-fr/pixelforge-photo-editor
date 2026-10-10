import {
  pathContours,
  validatePath,
  type PathContour,
  type PathModel,
  type PathNode,
} from './paths.ts';

/** Nondestructive vector shape operations supported by the Layer menu. */
export type PathBooleanOperation = 'union' | 'subtract' | 'intersect' | 'exclude';
export type BooleanPoint = { x: number; y: number };

const MAX_EDGES = 2048;
const MAX_OUTPUT_CONTOURS = 64;
const EPSILON = 1e-8;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const cross = (a: BooleanPoint, b: BooleanPoint) => a.x * b.y - a.y * b.x;
const sub = (a: BooleanPoint, b: BooleanPoint): BooleanPoint => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: BooleanPoint, b: BooleanPoint): BooleanPoint => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: BooleanPoint, value: number): BooleanPoint => ({ x: a.x * value, y: a.y * value });
const distance = (a: BooleanPoint, b: BooleanPoint) => Math.hypot(a.x - b.x, a.y - b.y);

type Edge = { a: BooleanPoint; b: BooleanPoint };

const bezier = (p0: BooleanPoint, p1: BooleanPoint, p2: BooleanPoint, p3: BooleanPoint, t: number) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/** Flatten a cubic contour to a bounded polygon for boolean clipping. */
export function flattenPathContours(path: PathModel, stepsPerCurve = 16): BooleanPoint[][] {
  const valid = validatePath(path);
  if (!Number.isInteger(stepsPerCurve) || stepsPerCurve < 4 || stepsPerCurve > 64)
    throw new Error('Boolean curve sampling is invalid');
  const contours: BooleanPoint[][] = [];
  for (const contour of pathContours(valid)) {
    if (!contour.closed || contour.nodes.length < 3)
      throw new Error('Boolean operands must be closed paths');
    const points: BooleanPoint[] = [contour.nodes[0]];
    for (let index = 1; index <= contour.nodes.length; index += 1) {
      const start = contour.nodes[index - 1];
      const end = contour.nodes[index % contour.nodes.length];
      const out = start.outHandle ?? start;
      const incoming = end.inHandle ?? end;
      const curved = Boolean(start.outHandle || end.inHandle);
      const count = curved ? stepsPerCurve : 1;
      for (let step = 1; step <= count; step += 1) {
        const t = step / count;
        points.push(curved ? bezier(start, out, incoming, end, t) : end);
      }
    }
    // The closing endpoint repeats the first point; omit it so edge generation
    // has one, and only one, closing segment.
    if (points.length > 1 && distance(points[0], points.at(-1)!) <= EPSILON) points.pop();
    if (points.length < 3) throw new Error('Boolean operands need three points');
    contours.push(points);
  }
  if (contours.reduce((total, contour) => total + contour.length, 0) > MAX_EDGES)
    throw new Error('Boolean operands exceed the bounded edge limit');
  return contours;
}

const edgesFromContours = (contours: readonly BooleanPoint[][]): Edge[] => contours.flatMap((points) =>
  points.map((point, index) => ({ a: point, b: points[(index + 1) % points.length] })),
);

const parameterOn = (point: BooleanPoint, edge: Edge) => {
  const delta = sub(edge.b, edge.a);
  const length2 = delta.x * delta.x + delta.y * delta.y;
  if (length2 <= EPSILON) return 0;
  return Math.max(0, Math.min(1, ((point.x - edge.a.x) * delta.x + (point.y - edge.a.y) * delta.y) / length2));
};

const within = (value: number) => value >= -EPSILON && value <= 1 + EPSILON;

/** Add proper and collinear endpoint intersections to both edge parameters. */
const addIntersections = (left: Edge, right: Edge, leftParams: number[], rightParams: number[]) => {
  const r = sub(left.b, left.a), s = sub(right.b, right.a), delta = sub(right.a, left.a);
  const denominator = cross(r, s);
  if (Math.abs(denominator) > EPSILON) {
    const t = cross(delta, s) / denominator;
    const u = cross(delta, r) / denominator;
    if (within(t) && within(u)) {
      leftParams.push(Math.max(0, Math.min(1, t)));
      rightParams.push(Math.max(0, Math.min(1, u)));
    }
    return;
  }
  if (Math.abs(cross(delta, r)) > EPSILON) return;
  for (const point of [left.a, left.b]) {
    const t = parameterOn(point, right);
    if (within(t)) rightParams.push(t);
  }
  for (const point of [right.a, right.b]) {
    const t = parameterOn(point, left);
    if (within(t)) leftParams.push(t);
  }
};

const splitEdges = (edges: readonly Edge[], other: readonly Edge[]): Edge[] => {
  const pieces: Edge[] = [];
  for (const edge of edges) {
    const params = [0, 1];
    for (const candidate of other) addIntersections(edge, candidate, params, []);
    const sorted = [...new Set(params.map((value) => Number(value.toFixed(10))))].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      const start = sorted[index - 1], end = sorted[index];
      if (end - start <= EPSILON) continue;
      pieces.push({
        a: add(edge.a, scale(sub(edge.b, edge.a), start)),
        b: add(edge.a, scale(sub(edge.b, edge.a), end)),
      });
    }
  }
  return pieces;
};

const pointOnSegment = (point: BooleanPoint, edge: Edge) =>
  Math.abs(cross(sub(point, edge.a), sub(edge.b, edge.a))) <= EPSILON &&
  point.x >= Math.min(edge.a.x, edge.b.x) - EPSILON && point.x <= Math.max(edge.a.x, edge.b.x) + EPSILON &&
  point.y >= Math.min(edge.a.y, edge.b.y) - EPSILON && point.y <= Math.max(edge.a.y, edge.b.y) + EPSILON;

const pointInContours = (point: BooleanPoint, contours: readonly BooleanPoint[][]): boolean => {
  let inside = false;
  for (const contour of contours) {
    const edges = edgesFromContours([contour]);
    if (edges.some((edge) => pointOnSegment(point, edge))) return true;
    for (const edge of edges) {
      const crosses = (edge.a.y > point.y) !== (edge.b.y > point.y) &&
        point.x < ((edge.b.x - edge.a.x) * (point.y - edge.a.y)) / (edge.b.y - edge.a.y) + edge.a.x;
      if (crosses) inside = !inside;
    }
  }
  return inside;
};

const operationValue = (operation: PathBooleanOperation, left: boolean, right: boolean) => {
  if (operation === 'union') return left || right;
  if (operation === 'subtract') return left && !right;
  if (operation === 'intersect') return left && right;
  return left !== right;
};

const quantize = (value: number) => Math.round(value * 1e7) / 1e7;
const pointKey = (point: BooleanPoint) => `${quantize(point.x)},${quantize(point.y)}`;
const edgeKey = (edge: Edge) => `${pointKey(edge.a)}>${pointKey(edge.b)}`;
const area = (points: readonly BooleanPoint[]) => points.reduce(
  (total, point, index) => total + cross(point, points[(index + 1) % points.length]),
  0,
) / 2;

const simplify = (points: BooleanPoint[]): BooleanPoint[] => {
  const result: BooleanPoint[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last && distance(last, point) <= EPSILON) continue;
    result.push(point);
  }
  if (result.length > 1 && distance(result[0], result.at(-1)!) <= EPSILON) result.pop();
  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index + result.length - 1) % result.length];
      const current = result[index];
      const next = result[(index + 1) % result.length];
      if (Math.abs(cross(sub(current, previous), sub(next, current))) <= EPSILON) {
        result.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
};

/**
 * Combine two or more closed paths without baking source assets.  The bounded
 * arrangement splitter preserves disjoint components and holes and rejects
 * oversized or open operands before allocating unbounded geometry.
 */
export function combinePathBooleans(
  paths: readonly PathModel[],
  operation: PathBooleanOperation,
): PathModel {
  if (!['union', 'subtract', 'intersect', 'exclude'].includes(operation))
    throw new Error('Boolean operation is invalid');
  if (paths.length < 2 || paths.length > 8) throw new Error('Choose 2 to 8 vector layers');
  let result = validatePath(paths[0]);
  for (const candidate of paths.slice(1)) {
    const leftContours = flattenPathContours(result);
    const rightContours = flattenPathContours(candidate);
    const leftEdges = edgesFromContours(leftContours), rightEdges = edgesFromContours(rightContours);
    if (leftEdges.length + rightEdges.length > MAX_EDGES)
      throw new Error('Boolean operands exceed the bounded edge limit');
    const extent = Math.max(1, ...leftEdges.flatMap((edge) => [Math.abs(edge.a.x), Math.abs(edge.a.y), Math.abs(edge.b.x), Math.abs(edge.b.y)]),
      ...rightEdges.flatMap((edge) => [Math.abs(edge.a.x), Math.abs(edge.a.y), Math.abs(edge.b.x), Math.abs(edge.b.y)]));
    const epsilon = Math.max(1e-7, extent * 1e-8);
    const boundaries: Edge[] = [];
    const addBoundary = (edge: Edge) => {
      const delta = sub(edge.b, edge.a), length = Math.hypot(delta.x, delta.y);
      if (length <= epsilon) return;
      const normal = { x: -delta.y / length * epsilon, y: delta.x / length * epsilon };
      const midpoint = scale(add(edge.a, edge.b), 0.5);
      const left = operationValue(operation,
        pointInContours(add(midpoint, normal), leftContours),
        pointInContours(add(midpoint, normal), rightContours));
      const right = operationValue(operation,
        pointInContours(add(midpoint, scale(normal, -1)), leftContours),
        pointInContours(add(midpoint, scale(normal, -1)), rightContours));
      if (left === right) return;
      boundaries.push(left ? edge : { a: edge.b, b: edge.a });
    };
    for (const edge of splitEdges(leftEdges, rightEdges)) addBoundary(edge);
    for (const edge of splitEdges(rightEdges, leftEdges)) addBoundary(edge);
    const deduped = new Map<string, Edge>();
    for (const edge of boundaries) deduped.set(edgeKey(edge), edge);
    const adjacency = new Map<string, Edge[]>();
    for (const edge of deduped.values()) {
      const key = pointKey(edge.a);
      const edges = adjacency.get(key) || [];
      edges.push(edge);
      adjacency.set(key, edges);
    }
    const used = new Set<string>(), loops: BooleanPoint[][] = [];
    for (const startEdge of deduped.values()) {
      const startKey = edgeKey(startEdge);
      if (used.has(startKey)) continue;
      const loop: BooleanPoint[] = [];
      let edge = startEdge;
      let guard = 0;
      while (guard++ < deduped.size + 2) {
        const key = edgeKey(edge);
        if (used.has(key)) break;
        used.add(key);
        loop.push(edge.a);
        const destination = pointKey(edge.b);
        if (destination === pointKey(startEdge.a)) {
          const reduced = simplify(loop);
          if (reduced.length >= 3 && Math.abs(area(reduced)) > epsilon * epsilon) loops.push(reduced);
          break;
        }
        const candidates = (adjacency.get(destination) || []).filter((candidate) => !used.has(edgeKey(candidate)));
        if (!candidates.length) break;
        const incoming = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x);
        candidates.sort((left, right) => {
          const angle = (candidate: Edge) => {
            const value = Math.atan2(candidate.b.y - candidate.a.y, candidate.b.x - candidate.a.x) - incoming;
            return (value + Math.PI * 2) % (Math.PI * 2);
          };
          return angle(left) - angle(right) || edgeKey(left).localeCompare(edgeKey(right));
        });
        edge = candidates[0];
      }
    }
    if (!loops.length) {
      // Empty intersections/subtractions are represented by a valid minimal
      // transparent path only at the API boundary; callers can remove the
      // result layer when no geometry remains.
      throw new Error('Boolean operation produced no geometry');
    }
    if (loops.length > MAX_OUTPUT_CONTOURS) throw new Error('Boolean result has too many contours');
    const contours: PathContour[] = loops.map((points) => ({
      nodes: points.map((point) => ({ x: quantize(point.x), y: quantize(point.y) })),
      closed: true,
    }));
    const first = contours[0];
    result = validatePath({
      ...result,
      nodes: first.nodes,
      closed: true,
      contours: contours.length > 1 ? contours : undefined,
      fill: result.fill || candidate.fill,
      stroke: result.stroke || candidate.stroke,
      fillRule: 'evenodd',
    });
  }
  return result;
}

/** Convert a parametric shape layer into a closed path for boolean editing. */
export function booleanPathFromPoints(
  points: readonly BooleanPoint[],
  style: Pick<PathModel, 'fill' | 'stroke' | 'strokeWidth' | 'fillColor' | 'strokeColor'>,
): PathModel {
  if (points.length < 3 || points.length > MAX_EDGES) throw new Error('Boolean shape points are invalid');
  if (!points.every((point) => finite(point.x) && finite(point.y))) throw new Error('Boolean shape points are invalid');
  return validatePath({
    nodes: points.map((point) => ({ x: point.x, y: point.y })),
    closed: true,
    ...style,
    fillRule: 'evenodd',
  });
}

export function booleanPathIsClosed(path: PathModel): boolean {
  return pathContours(validatePath(path)).every((contour) => contour.closed && contour.nodes.length >= 3);
}

export type { PathNode };
