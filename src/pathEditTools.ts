/**
 * Pure helpers shared by the Pen tool's modifier edits and the dedicated
 * Path Selection, Add Anchor Point, Delete Anchor Point and Convert Point
 * tools. Everything works in a path's local coordinate space so the editor
 * only maps the pointer through the layer matrix once.
 *
 * These are bounded local approximations of Photoshop's path tools: anchors
 * are edited on the primary contour (the one `PathModel.nodes` mirrors), and
 * hit testing samples curves rather than solving them analytically.
 * See docs/path-edit-tools-contract.md.
 */

import {
  hitTestPathNode,
  hitTestPathStroke,
  insertPathNode,
  nearestPathSegment,
  pathContours,
  removePathNode,
  setPathNodeSmooth,
  transformPath,
  validatePath,
  type PathModel,
  type PathNode,
} from './paths.ts';

export type PathAnchorEditMode = 'add' | 'delete' | 'convert';

export type PathAnchorEdit = {
  mode: PathAnchorEditMode;
  path: PathModel;
  /** Anchor index that was added, removed or converted. */
  index: number;
};

export type PathAnchorEditMiss = {
  mode: PathAnchorEditMode;
  /** Why nothing changed, phrased for the status bar. */
  reason: string;
};

const finite = (value: number) => Number.isFinite(value);

/**
 * Photoshop's Pen modifiers over an existing path: Alt/Option deletes an
 * anchor, Shift converts it, and an unmodified click on a segment adds one.
 * Alt takes precedence when both are held, matching the previous behaviour.
 */
export function penAnchorEditMode(modifiers: { altKey?: boolean; shiftKey?: boolean }): PathAnchorEditMode {
  if (modifiers.altKey) return 'delete';
  if (modifiers.shiftKey) return 'convert';
  return 'add';
}

/**
 * nearestPathSegment reports the cubic parameter, but a straight segment is
 * split linearly by insertPathNode. Project the click onto the line so the
 * new anchor lands under the pointer instead of drifting along the segment.
 */
const straightSegmentT = (path: PathModel, segmentIndex: number, point: PathNode): number | null => {
  const start = path.nodes[segmentIndex];
  const end = segmentIndex < path.nodes.length - 1 ? path.nodes[segmentIndex + 1] : path.nodes[0];
  if (!start || !end || start.outHandle || end.inHandle) return null;
  const dx = end.x - start.x, dy = end.y - start.y, length2 = dx * dx + dy * dy;
  if (length2 === 0) return null;
  return Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length2));
};

/**
 * Apply one anchor edit at `point` (local coordinates). `radius` is the hit
 * radius in local units. Returns the edited path, or a miss with a reason.
 *
 * - add: inserts an anchor on the nearest segment, never on top of an
 *   existing anchor (that would create a zero-length segment).
 * - delete: removes the anchor under the pointer, keeping at least one.
 * - convert: toggles the anchor between a corner and a smooth point.
 */
export function editPathAnchor(
  path: PathModel,
  point: PathNode,
  radius: number,
  mode: PathAnchorEditMode,
): PathAnchorEdit | PathAnchorEditMiss {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(radius) || radius < 0)
    throw new Error('Path edit input is invalid');
  const nodeIndex = hitTestPathNode(valid, point, radius);
  if (mode === 'add') {
    if (nodeIndex !== null) return { mode, reason: 'Click a path segment, not an anchor, to add an anchor' };
    const hit = nearestPathSegment(valid, point, radius);
    if (!hit) return { mode, reason: 'Click a path segment to add an anchor' };
    return {
      mode,
      path: insertPathNode(valid, hit.segmentIndex, straightSegmentT(valid, hit.segmentIndex, point) ?? hit.t),
      index: hit.segmentIndex + 1,
    };
  }
  if (nodeIndex === null)
    return { mode, reason: mode === 'delete' ? 'Click an anchor to delete it' : 'Click an anchor to convert it' };
  if (mode === 'delete') {
    if (valid.nodes.length <= 1) return { mode, reason: 'A path needs at least one anchor' };
    return { mode, path: removePathNode(valid, nodeIndex), index: nodeIndex };
  }
  const node = valid.nodes[nodeIndex];
  return {
    mode,
    path: setPathNodeSmooth(valid, nodeIndex, !(node.inHandle || node.outHandle)),
    index: nodeIndex,
  };
}

export const isPathAnchorEdit = (
  result: PathAnchorEdit | PathAnchorEditMiss,
): result is PathAnchorEdit => 'path' in result;

/** Status-bar text for a successful edit. */
export function pathAnchorEditNotice(edit: PathAnchorEdit, vectorMask = false): string {
  const subject = vectorMask ? 'Vector mask anchor' : 'Path anchor';
  if (edit.mode === 'add') return `${subject} added`;
  if (edit.mode === 'delete') return `${subject} deleted`;
  const node = edit.path.nodes[edit.index];
  return `${subject} converted to ${node.inHandle || node.outHandle ? 'smooth' : 'corner'}`;
}

/**
 * Convert Point drag: pull symmetric handles out of an anchor. The outgoing
 * handle follows the pointer and the incoming handle mirrors it through the
 * anchor, making a smooth point. A drag shorter than `minLength` leaves the
 * anchor a corner, so a tiny jitter cannot create degenerate handles.
 */
export function pullPathNodeHandles(
  path: PathModel,
  index: number,
  pointer: PathNode,
  minLength = 0.5,
): PathModel {
  const valid = validatePath(path);
  if (!Number.isInteger(index) || index < 0 || index >= valid.nodes.length)
    throw new Error('Path node index is invalid');
  if (!finite(pointer.x) || !finite(pointer.y)) throw new Error('Path handles are invalid');
  const anchor = valid.nodes[index];
  const dx = pointer.x - anchor.x, dy = pointer.y - anchor.y;
  const nodes = valid.nodes.map((node, nodeIndex) => {
    if (nodeIndex !== index) return node;
    if (Math.hypot(dx, dy) < minLength) return { x: node.x, y: node.y };
    return {
      x: node.x,
      y: node.y,
      inHandle: { x: node.x - dx, y: node.y - dy },
      outHandle: { x: node.x + dx, y: node.y + dy },
    };
  });
  const contours = valid.contours?.map((contour, contourIndex) =>
    contourIndex === 0 ? { nodes, closed: contour.closed } : contour);
  return validatePath({ ...valid, nodes, ...(contours ? { contours } : {}) });
}

/** Move every anchor and handle of every contour by (dx, dy). */
export function translatePath(path: PathModel, dx: number, dy: number): PathModel {
  if (!finite(dx) || !finite(dy)) throw new Error('Path offset is invalid');
  return transformPath(path, [1, 0, 0, 1, dx, dy]);
}

const cubic = (p0: PathNode, p1: PathNode, p2: PathNode, p3: PathNode, t: number): PathNode => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/** Sampled polygon of a closed contour (16 samples per segment). */
const flattenContour = (nodes: PathNode[]): PathNode[] => {
  const result: PathNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const start = nodes[index], end = nodes[(index + 1) % nodes.length];
    const p1 = start.outHandle ?? start, p2 = end.inHandle ?? end;
    for (let step = 0; step < 16; step += 1) result.push(cubic(start, p1, p2, end, step / 16));
  }
  return result;
};

/** Signed crossing count of a horizontal ray, for both fill rules. */
const windingAndCrossings = (polygon: PathNode[], point: PathNode) => {
  let winding = 0, crossings = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    if ((a.y <= point.y) === (b.y <= point.y)) continue;
    const x = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (x > point.x) {
      crossings += 1;
      winding += b.y > a.y ? 1 : -1;
    }
  }
  return { winding, crossings };
};

/**
 * Whether a point lies inside the filled area of a path's closed contours,
 * honouring the path's fill rule. Open contours have no interior.
 */
export function pathContainsPoint(path: PathModel, point: PathNode): boolean {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y)) throw new Error('Path hit-test input is invalid');
  let winding = 0, crossings = 0;
  for (const contour of pathContours(valid)) {
    if (!contour.closed || contour.nodes.length < 3) continue;
    const result = windingAndCrossings(flattenContour(contour.nodes), point);
    winding += result.winding;
    crossings += result.crossings;
  }
  return valid.fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
}

/**
 * Path Selection hit test: the pointer is on the path when it touches an
 * anchor, the stroke (within `tolerance`) or the interior of a closed
 * contour. Interior hits apply whether or not the path is filled, which is
 * how Photoshop's Path Selection picks a closed path by its area.
 */
export function hitTestWholePath(path: PathModel, point: PathNode, tolerance: number): boolean {
  const valid = validatePath(path);
  if (!finite(point.x) || !finite(point.y) || !finite(tolerance) || tolerance < 0)
    throw new Error('Path hit-test input is invalid');
  if (pathContours(valid).some((contour) =>
    contour.nodes.some((node) => Math.hypot(node.x - point.x, node.y - point.y) <= tolerance)))
    return true;
  return hitTestPathStroke(valid, point, tolerance) || pathContainsPoint(valid, point);
}
