import type { PathContour, PathNode } from './paths';

export type AlphaContourTrace = {
  contours: PathContour[];
  selectedPixels: number;
};

const MAX_CONTOURS = 64;
const MAX_NODES_PER_CONTOUR = 4096;

type Edge = { from: PathNode; to: PathNode; direction: number };

const key = (point: PathNode) => `${point.x},${point.y}`;
const same = (left: PathNode, right: PathNode) => left.x === right.x && left.y === right.y;

/**
 * Trace a canvas alpha mask into deterministic, axis-aligned closed contours.
 * The input is intentionally a byte alpha plane rather than a Canvas object so
 * the geometry is testable and safe to run in a worker later. Edges are emitted
 * around selected pixels, collinear anchors are removed, and contour count/node
 * limits keep malformed or huge masks bounded.
 */
export function traceAlphaContours(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 1,
): AlphaContourTrace {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Alpha contour dimensions are invalid');
  if (alpha.length < width * height) throw new Error('Alpha contour plane is too small');
  const cut = Math.max(0, Math.min(255, Math.round(threshold)));
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && Number(alpha[y * width + x]) >= cut;
  const edges: Edge[] = [];
  let selectedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      selectedPixels += 1;
      if (!inside(x, y - 1)) edges.push({ from: { x, y }, to: { x: x + 1, y }, direction: 0 });
      if (!inside(x + 1, y)) edges.push({ from: { x: x + 1, y }, to: { x: x + 1, y: y + 1 }, direction: 1 });
      if (!inside(x, y + 1)) edges.push({ from: { x: x + 1, y: y + 1 }, to: { x, y: y + 1 }, direction: 2 });
      if (!inside(x - 1, y)) edges.push({ from: { x, y: y + 1 }, to: { x, y }, direction: 3 });
    }
  }
  const byStart = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = byStart.get(key(edge.from));
    if (list) list.push(edge);
    else byStart.set(key(edge.from), [edge]);
  }
  const used = new Set<Edge>();
  const contours: PathContour[] = [];
  for (const seed of edges) {
    if (used.has(seed) || contours.length >= MAX_CONTOURS) continue;
    const nodes: PathNode[] = [];
    let edge: Edge | undefined = seed;
    const start = seed.from;
    while (edge && !used.has(edge) && nodes.length < MAX_NODES_PER_CONTOUR) {
      used.add(edge);
      if (!nodes.length || !same(nodes[nodes.length - 1], edge.from)) nodes.push(edge.from);
      const next: Edge[] = byStart.get(key(edge.to))?.filter((candidate: Edge) => !used.has(candidate)) || [];
      if (same(edge.to, start)) break;
      // Prefer the smallest clockwise turn. This resolves diagonal pixel corner
      // junctions deterministically without merging separate islands.
      edge = next.sort((left: Edge, right: Edge) => {
        const turn = (candidate: Edge) => (candidate.direction - edge!.direction + 4) % 4;
        return turn(left) - turn(right) || left.direction - right.direction;
      })[0];
    }
    if (nodes.length >= 3) {
      const simplified = nodes.filter((node, index, list) => {
        const previous = list[(index + list.length - 1) % list.length];
        const next = list[(index + 1) % list.length];
        return (node.x - previous.x) * (next.y - node.y) !== (node.y - previous.y) * (next.x - node.x);
      });
      if (simplified.length >= 3) contours.push({ nodes: simplified, closed: true });
    }
  }
  return { contours, selectedPixels };
}
