import { buildFreeformPath } from './freeformPen.ts';
import { validatePath, type PathModel, type PathNode } from './paths.ts';

/** Keep click-to-place Curvature Pen paths bounded before allocating handles. */
export const CURVATURE_MAX_POINTS = 1000;
export const CURVATURE_MIN_DISTANCE = 2;

const finitePoint = (point: PathNode) =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

/** Append a click while rejecting malformed or effectively duplicate points. */
export function appendCurvaturePoint(
  points: readonly PathNode[],
  point: PathNode,
): PathNode[] {
  if (!finitePoint(point)) throw new Error('Curvature point is invalid');
  if (points.length >= CURVATURE_MAX_POINTS)
    return points.map(({ x, y }) => ({ x, y }));
  const last = points[points.length - 1];
  if (
    last &&
    Math.hypot(point.x - last.x, point.y - last.y) < CURVATURE_MIN_DISTANCE
  )
    return points.map(({ x, y }) => ({ x, y }));
  return [...points.map(({ x, y }) => ({ x, y })), { x: point.x, y: point.y }];
}

/**
 * Build the click-to-place Curvature Pen path. The deterministic tangent
 * handles are derived from neighbouring anchors, giving a smooth editable
 * cubic path while retaining the original nodes for Direct Selection.
 */
export function buildCurvaturePath(
  points: readonly PathNode[],
  style: Pick<PathModel, 'strokeWidth' | 'fillColor' | 'strokeColor'>,
  closed = false,
): PathModel {
  if (points.length < 2 || points.length > CURVATURE_MAX_POINTS)
    throw new Error('Curvature path must contain 2 to 1000 points');
  if (!points.every(finitePoint)) throw new Error('Curvature points are invalid');
  if (!closed) {
    const path = buildFreeformPath(points, style);
    return validatePath({ ...path, closed, fill: false, stroke: true });
  }
  // A closed path wraps around: every anchor, including the first and last,
  // takes its tangent from its cyclic neighbours, so the closing segment is
  // curved like the others instead of a straight chord.
  const count = points.length;
  const nodes = points.map((point, index) => {
    const previous = points[(index - 1 + count) % count];
    const next = points[(index + 1) % count];
    const dx = (next.x - previous.x) / 6;
    const dy = (next.y - previous.y) / 6;
    return {
      x: point.x,
      y: point.y,
      inHandle: { x: point.x - dx, y: point.y - dy },
      outHandle: { x: point.x + dx, y: point.y + dy },
    };
  });
  return validatePath({
    nodes,
    closed: true,
    fill: true,
    stroke: true,
    strokeWidth: style.strokeWidth,
    fillColor: style.fillColor,
    strokeColor: style.strokeColor,
  });
}
