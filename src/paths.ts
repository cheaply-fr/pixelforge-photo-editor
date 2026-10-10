/**
 * Bounded editable Pen path model.
 *
 * A node can carry optional cubic Bezier handles. Handles are stored in the
 * same local coordinate system as the anchor, so transforms and direct node
 * edits remain nondestructive and round-trip through the document format.
 */

export type PathNode = {
  x: number;
  y: number;
  /** Incoming/outgoing cubic controls, when the node is curved. */
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
};

/** One closed/open contour in a compound path.  Legacy paths keep their
 * anchors on PathModel.nodes; compound paths mirror the first contour there
 * for backwards-compatible consumers and carry the remaining contours here. */
export type PathContour = {
  nodes: PathNode[];
  closed: boolean;
};

export type PathModel = {
  nodes: PathNode[];
  closed: boolean;
  fill: boolean;
  stroke: boolean;
  strokeWidth: number;
  fillColor: string;
  strokeColor: string;
  /** Optional compound contours.  The first contour mirrors nodes/closed. */
  contours?: PathContour[];
  /** Even-odd is used by boolean results so holes remain non-destructive. */
  fillRule?: 'nonzero' | 'evenodd';
};

export type PathMatrix = readonly [number, number, number, number, number, number];
export type PathHandleKind = 'in' | 'out';
export type PathSegmentHit = {
  /** Segment order: 0..nodes.length-2, with the closing segment last. */
  segmentIndex: number;
  /** Approximate local parameter on the segment, bounded to 0..1. */
  t: number;
  distance: number;
};

export const PATH_MAX_NODES = 10_000;
export const PATH_MAX_CONTOURS = 64;
export const PATH_MAX_COORDINATE = 1_000_000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const validColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6,8}$/i.test(value);

const clonePoint = (point: { x: number; y: number }) => ({ x: point.x, y: point.y });

const validPoint = (point: unknown): point is { x: number; y: number } =>
  Boolean(point) &&
  typeof point === 'object' &&
  finite((point as { x?: unknown }).x) &&
  finite((point as { y?: unknown }).y) &&
  Math.abs((point as { x: number }).x) <= PATH_MAX_COORDINATE &&
  Math.abs((point as { y: number }).y) <= PATH_MAX_COORDINATE;

const cloneNode = (node: PathNode): PathNode => ({
  x: node.x,
  y: node.y,
  ...(node.inHandle ? { inHandle: clonePoint(node.inHandle) } : {}),
  ...(node.outHandle ? { outHandle: clonePoint(node.outHandle) } : {}),
});

const validateNode = (node: unknown): node is PathNode => {
  if (!validPoint(node)) return false;
  const candidate = node as PathNode;
  return (
    (candidate.inHandle === undefined || validPoint(candidate.inHandle)) &&
    (candidate.outHandle === undefined || validPoint(candidate.outHandle))
  );
};

const cloneContour = (contour: PathContour): PathContour => ({
  nodes: contour.nodes.map(cloneNode),
  closed: contour.closed,
});

const sameContour = (left: PathContour, right: PathContour) =>
  left.closed === right.closed &&
  left.nodes.length === right.nodes.length &&
  left.nodes.every((node, index) => {
    const other = right.nodes[index];
    return (
      node.x === other.x &&
      node.y === other.y &&
      node.inHandle?.x === other.inHandle?.x &&
      node.inHandle?.y === other.inHandle?.y &&
      node.outHandle?.x === other.outHandle?.x &&
      node.outHandle?.y === other.outHandle?.y
    );
  });

/** Return validated contours while preserving the single-contour legacy shape. */
export function pathContours(path: PathModel): PathContour[] {
  const valid = validatePath(path);
  return valid.contours?.map(cloneContour) || [{ nodes: valid.nodes.map(cloneNode), closed: valid.closed }];
}

/** Return a cloned, validated model or throw a user-visible contract error. */
export function validatePath(value: unknown): PathModel {
  if (!value || typeof value !== 'object') throw new Error('Path must be an object');
  const path = value as Partial<PathModel>;
  if (!Array.isArray(path.nodes) || path.nodes.length < 1 || path.nodes.length > PATH_MAX_NODES)
    throw new Error(`Path must contain 1 to ${PATH_MAX_NODES} nodes`);
  if (!path.nodes.every(validateNode)) throw new Error('Path nodes are invalid');
  if (typeof path.closed !== 'boolean') throw new Error('Path closed state is invalid');
  if (typeof path.fill !== 'boolean' || typeof path.stroke !== 'boolean')
    throw new Error('Path appearance is invalid');
  if (!finite(path.strokeWidth) || path.strokeWidth < 0 || path.strokeWidth > 10_000)
    throw new Error('Path stroke width is invalid');
  if (!validColor(path.fillColor) || !validColor(path.strokeColor))
    throw new Error('Path colors are invalid');
  if (!path.fill && !path.stroke) throw new Error('Path needs a fill or stroke');
  const rawContours = path.contours;
  let contours: PathContour[] | undefined;
  if (rawContours !== undefined) {
    if (!Array.isArray(rawContours) || rawContours.length < 1 || rawContours.length > PATH_MAX_CONTOURS)
      throw new Error(`Path must contain 1 to ${PATH_MAX_CONTOURS} contours`);
    const totalNodes = rawContours.reduce((total, contour) => {
      if (!contour || typeof contour !== 'object' || !Array.isArray(contour.nodes) ||
          contour.nodes.length < 1 || contour.nodes.length > PATH_MAX_NODES ||
          !contour.nodes.every(validateNode) || typeof contour.closed !== 'boolean')
        throw new Error('Path contours are invalid');
      return total + contour.nodes.length;
    }, 0);
    if (totalNodes > PATH_MAX_NODES) throw new Error('Path contains too many nodes');
    const first = rawContours[0] as PathContour;
    const legacy = { nodes: path.nodes.map(cloneNode), closed: path.closed };
    if (!sameContour(first, legacy))
      throw new Error('Path first contour must mirror nodes and closed state');
    if (rawContours.length > 1) contours = rawContours.map(cloneContour);
  }
  const fillRule = path.fillRule ?? 'nonzero';
  if (fillRule !== 'nonzero' && fillRule !== 'evenodd') throw new Error('Path fill rule is invalid');
  return {
    nodes: path.nodes.map(cloneNode),
    closed: path.closed,
    fill: path.fill,
    stroke: path.stroke,
    strokeWidth: path.strokeWidth,
    fillColor: path.fillColor.toLowerCase(),
    strokeColor: path.strokeColor.toLowerCase(),
    ...(contours ? { contours } : {}),
    fillRule,
  };
}

export function clonePath(path: PathModel): PathModel {
  return validatePath(path);
}

/** Replace the legacy primary contour without dropping compound contours. */
const replacePrimaryContour = (
  path: PathModel,
  nodes: PathNode[],
  closed = path.closed,
): PathModel => {
  if (!path.contours) return { ...path, nodes, closed };
  const contours = path.contours.map(cloneContour);
  contours[0] = { nodes: nodes.map(cloneNode), closed };
  return { ...path, nodes: nodes.map(cloneNode), closed, contours };
};

type Segment = { start: PathNode; end: PathNode; close: boolean };

const contourSegments = (contour: PathContour): Segment[] => {
  const result: Segment[] = [];
  for (let i = 1; i < contour.nodes.length; i += 1)
    result.push({ start: contour.nodes[i - 1], end: contour.nodes[i], close: false });
  if (contour.closed && contour.nodes.length > 1)
    result.push({ start: contour.nodes[contour.nodes.length - 1], end: contour.nodes[0], close: true });
  return result;
};

const segments = (path: PathModel): Segment[] => pathContours(path).flatMap(contourSegments);

const controlPoints = (segment: Segment): [PathNode, PathNode, PathNode, PathNode] => [
  segment.start,
  segment.start.outHandle ?? segment.start,
  segment.end.inHandle ?? segment.end,
  segment.end,
];

const segmentAt = (path: PathModel, index: number): Segment => {
  if (!Number.isInteger(index) || index < 0) throw new Error('Path segment index is invalid');
  if (index < path.nodes.length - 1)
    return { start: path.nodes[index], end: path.nodes[index + 1], close: false };
  if (path.closed && index === path.nodes.length - 1)
    return { start: path.nodes[path.nodes.length - 1], end: path.nodes[0], close: true };
  throw new Error('Path segment index is invalid');
};

const cubic = (p0: PathNode, p1: PathNode, p2: PathNode, p3: PathNode, t: number): PathNode => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

const extrema = (p0: number, p1: number, p2: number, p3: number): number[] => {
  const values = [0, 1];
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) {
      const t = -c / b;
      if (t > 0 && t < 1) values.push(t);
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const t1 = (-b + root) / (2 * a), t2 = (-b - root) / (2 * a);
      if (t1 > 0 && t1 < 1) values.push(t1);
      if (t2 > 0 && t2 < 1) values.push(t2);
    }
  }
  return values;
};

/** Bounds include cubic extrema, rather than only anchors or control points. */
export function pathBounds(path: PathModel): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const valid = validatePath(path);
  const contours = pathContours(valid);
  if (!contours.some((contour) => contour.nodes.length)) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const points: PathNode[] = [];
  for (const segment of segments(valid)) {
    const [p0, p1, p2, p3] = controlPoints(segment);
    const ts = [...new Set([...extrema(p0.x, p1.x, p2.x, p3.x), ...extrema(p0.y, p1.y, p2.y, p3.y)])];
    points.push(...ts.map((t) => cubic(p0, p1, p2, p3, t)));
  }
  if (!points.length) points.push(...contours.flatMap((contour) => contour.nodes));
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Move an anchor and its handles together, preserving the local curve shape. */
export function movePathNode(path: PathModel, index: number, x: number, y: number): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  if (!finite(x) || !finite(y)) throw new Error('Path nodes are invalid');
  const node = valid.nodes[index];
  const dx = x - node.x, dy = y - node.y;
  const moved = (point?: { x: number; y: number }) =>
    point ? { x: point.x + dx, y: point.y + dy } : undefined;
  const next = replacePrimaryContour(valid, valid.nodes.map((item, itemIndex) =>
      itemIndex === index
        ? { x, y, inHandle: moved(item.inHandle), outHandle: moved(item.outHandle) }
        : cloneNode(item),
    ));
  return validatePath(next);
}

export function transformPath(path: PathModel, matrix: PathMatrix): PathModel {
  const valid = validatePath(path);
  if (matrix.length !== 6 || !matrix.every(finite)) throw new Error('Path matrix is invalid');
  const [a, b, c, d, e, f] = matrix;
  const transform = (point: { x: number; y: number }) => ({
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  });
  const transformContour = (contour: PathContour): PathContour => ({
    closed: contour.closed,
    nodes: contour.nodes.map((node) => ({
      ...transform(node),
      ...(node.inHandle ? { inHandle: transform(node.inHandle) } : {}),
      ...(node.outHandle ? { outHandle: transform(node.outHandle) } : {}),
    })),
  });
  const contours = pathContours(valid).map(transformContour);
  return validatePath({
    ...valid,
    nodes: contours[0].nodes,
    closed: contours[0].closed,
    ...(contours.length > 1 ? { contours } : {}),
  });
}

const segmentDistance = (point: PathNode, start: PathNode, end: PathNode): number => {
  const dx = end.x - start.x, dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
};

/** Return the nearest node within radius, preferring the lowest index on ties. */
export function hitTestPathNode(path: PathModel, point: PathNode, radius: number): number | null {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(radius) || radius < 0) throw new Error('Path hit-test input is invalid');
  let match: number | null = null, best = radius;
  valid.nodes.forEach((node, index) => {
    const distance = Math.hypot(point.x - node.x, point.y - node.y);
    if (distance < best || (match === null && distance <= best)) { best = distance; match = index; }
  });
  return match;
}

/** Return the nearest editable Bezier handle within radius. */
export function hitTestPathHandle(
  path: PathModel,
  point: PathNode,
  radius: number,
): { index: number; kind: PathHandleKind } | null {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(radius) || radius < 0)
    throw new Error('Path hit-test input is invalid');
  let match: { index: number; kind: PathHandleKind } | null = null;
  let best = radius;
  valid.nodes.forEach((node, index) => {
    (['in', 'out'] as const).forEach((kind) => {
      const handle = node[`${kind}Handle`];
      if (!handle) return;
      const distance = Math.hypot(point.x - handle.x, point.y - handle.y);
      if (distance < best || (match === null && distance <= best)) {
        best = distance;
        match = { index, kind };
      }
    });
  });
  return match;
}

/** Move one Bezier handle without changing its anchor or sibling handles. */
export function movePathHandle(
  path: PathModel,
  index: number,
  kind: PathHandleKind,
  x: number,
  y: number,
): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  if (kind !== 'in' && kind !== 'out') throw new Error('Path handle kind is invalid');
  if (!finite(x) || !finite(y)) throw new Error('Path handles are invalid');
  if (!valid.nodes[index][`${kind}Handle`]) throw new Error('Path handle is not defined');
  return validatePath(replacePrimaryContour(valid, valid.nodes.map((node, nodeIndex) =>
      nodeIndex === index ? { ...cloneNode(node), [`${kind}Handle`]: { x, y } } : cloneNode(node),
    )));
}

/** Return whether a point lies on a straight or cubic path stroke. */
export function hitTestPathStroke(path: PathModel, point: PathNode, tolerance: number): boolean {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(tolerance) || tolerance < 0)
    throw new Error('Path hit-test input is invalid');
  for (const segment of segments(valid)) {
    const [p0, p1, p2, p3] = controlPoints(segment);
    let previous = p0;
    for (let step = 1; step <= 32; step += 1) {
      const next = cubic(p0, p1, p2, p3, step / 32);
      if (segmentDistance(point, previous, next) <= tolerance) return true;
      previous = next;
    }
  }
  return false;
}

/**
 * Find the nearest editable segment and a stable parameter on it. Sampling is
 * intentionally bounded: the result is used to place a new anchor, not to
 * claim sub-pixel curve intersection precision.
 */
export function nearestPathSegment(
  path: PathModel,
  point: PathNode,
  tolerance = Number.POSITIVE_INFINITY,
): PathSegmentHit | null {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) ||
      (!(Number.isFinite(tolerance) || tolerance === Number.POSITIVE_INFINITY)) || tolerance < 0)
    throw new Error('Path hit-test input is invalid');
  const count = valid.nodes.length - 1 + (valid.closed ? 1 : 0);
  let best: PathSegmentHit | null = null;
  for (let segmentIndex = 0; segmentIndex < count; segmentIndex += 1) {
    const segment = segmentAt(valid, segmentIndex);
    const [p0, p1, p2, p3] = controlPoints(segment);
    let previous = cubic(p0, p1, p2, p3, 0);
    for (let step = 1; step <= 48; step += 1) {
      const next = cubic(p0, p1, p2, p3, step / 48);
      const dx = next.x - previous.x, dy = next.y - previous.y;
      const length2 = dx * dx + dy * dy;
      const u = length2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - previous.x) * dx + (point.y - previous.y) * dy) / length2));
      const candidate = {
        x: previous.x + dx * u,
        y: previous.y + dy * u,
      };
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      const t = Math.max(0, Math.min(1, (step - 1 + u) / 48));
      if (distance <= tolerance &&
          (best === null || distance < best.distance ||
            (distance === best.distance && segmentIndex < best.segmentIndex)))
        best = { segmentIndex, t, distance };
      previous = next;
    }
  }
  return best;
}

const lerpPoint = (a: PathNode, b: PathNode, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Insert an anchor by splitting a straight or cubic segment immutably. */
export function insertPathNode(path: PathModel, segmentIndex: number, t: number): PathModel {
  const valid = validatePath(path);
  if (!finite(t) || t < 0 || t > 1) throw new Error('Path segment parameter is invalid');
  const segment = segmentAt(valid, segmentIndex);
  const [p0, p1, p2, p3] = controlPoints(segment);
  const curved = Boolean(segment.start.outHandle || segment.end.inHandle);
  let node: PathNode;
  let start = cloneNode(segment.start), end = cloneNode(segment.end);
  if (curved) {
    const p01 = lerpPoint(p0, p1, t), p12 = lerpPoint(p1, p2, t), p23 = lerpPoint(p2, p3, t);
    const p012 = lerpPoint(p01, p12, t), p123 = lerpPoint(p12, p23, t);
    const p0123 = lerpPoint(p012, p123, t);
    start = { ...start, outHandle: p01 };
    end = { ...end, inHandle: p23 };
    node = { ...p0123, inHandle: p012, outHandle: p123 };
  } else node = lerpPoint(p0, p3, t);
  const nodes = valid.nodes.map(cloneNode);
  if (segmentIndex < valid.nodes.length - 1) {
    nodes[segmentIndex] = start;
    nodes.splice(segmentIndex + 1, 0, node);
    nodes[segmentIndex + 2] = end;
  } else {
    nodes[nodes.length - 1] = start;
    nodes[0] = end;
    nodes.push(node);
  }
  return validatePath(replacePrimaryContour(valid, nodes));
}

/** Remove one anchor while preserving a valid, drawable path. */
export function removePathNode(path: PathModel, index: number): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  if (valid.nodes.length <= 1) throw new Error('Path needs at least one anchor');
  const nodes = valid.nodes.filter((_, itemIndex) => itemIndex !== index).map(cloneNode);
  return validatePath(replacePrimaryContour(valid, nodes, valid.closed && nodes.length >= 3));
}

/** Toggle a node between a corner and a mirrored smooth anchor. */
export function setPathNodeSmooth(path: PathModel, index: number, smooth: boolean): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  const node = valid.nodes[index];
  if (!smooth)
    return validatePath(replacePrimaryContour(valid, valid.nodes.map((item, itemIndex) => itemIndex === index
      ? { x: item.x, y: item.y }
      : cloneNode(item))));
  const previous = index > 0 ? valid.nodes[index - 1] : (valid.closed ? valid.nodes.at(-1)! : undefined);
  const next = index < valid.nodes.length - 1 ? valid.nodes[index + 1] : (valid.closed ? valid.nodes[0] : undefined);
  const before = previous ? { x: node.x - previous.x, y: node.y - previous.y } : { x: 1, y: 0 };
  const after = next ? { x: next.x - node.x, y: next.y - node.y } : before;
  const tangent = { x: before.x + after.x, y: before.y + after.y };
  const length = Math.hypot(tangent.x, tangent.y) || 1;
  const leftLength = previous ? Math.min(64, Math.max(8, Math.hypot(node.x - previous.x, node.y - previous.y) / 3)) : 24;
  const rightLength = next ? Math.min(64, Math.max(8, Math.hypot(next.x - node.x, next.y - node.y) / 3)) : leftLength;
  const ux = tangent.x / length, uy = tangent.y / length;
  return validatePath(replacePrimaryContour(valid, valid.nodes.map((item, itemIndex) => itemIndex === index
    ? {
        x: item.x,
        y: item.y,
        inHandle: { x: item.x - ux * leftLength, y: item.y - uy * leftLength },
        outHandle: { x: item.x + ux * rightLength, y: item.y + uy * rightLength },
      }
    : cloneNode(item))));
}

/** Stable SVG path data used for export/tests, with no locale-sensitive formatting. */
export function serializePathData(path: PathModel): string {
  const valid = validatePath(path);
  const number = (value: number) => Number(value.toFixed(4)).toString();
  const point = (value: PathNode) => `${number(value.x)} ${number(value.y)}`;
  const commands: string[] = [];
  for (const contour of pathContours(valid)) {
    if (!contour.nodes.length) continue;
    commands.push(`M ${point(contour.nodes[0])}`);
    for (const segment of contourSegments(contour)) {
      const [p0, p1, p2, p3] = controlPoints(segment);
      if (segment.close && !segment.start.outHandle && !segment.end.inHandle) {
        commands.push('Z');
        continue;
      }
      if (p1 !== p0 || p2 !== p3 || segment.start.outHandle || segment.end.inHandle)
        commands.push(`C ${point(p1)} ${point(p2)} ${point(p3)}`);
      else commands.push(`L ${point(p3)}`);
      if (segment.close) commands.push('Z');
    }
  }
  return commands.join(' ');
}
