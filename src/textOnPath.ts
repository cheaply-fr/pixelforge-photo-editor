import { pathContours, type PathModel, type PathNode } from './paths.ts';

export type TextPathBinding = {
  pathLayerId: string;
  /** Distance in local path pixels before the first glyph centre. */
  offset: number;
  reverse: boolean;
};

export type TextPathPoint = { x: number; y: number };
export type TextPathGlyph = { glyph: string; x: number; y: number; rotation: number };
export type TextPathMatrix = readonly [number, number, number, number, number, number];

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function normalizeTextPathBinding(value: unknown): TextPathBinding | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<TextPathBinding>;
  if (typeof candidate.pathLayerId !== 'string' || candidate.pathLayerId.trim().length < 1 || candidate.pathLayerId.length > 128)
    return undefined;
  return {
    pathLayerId: candidate.pathLayerId,
    offset: finite(candidate.offset) ? Math.max(-100000, Math.min(100000, candidate.offset)) : 0,
    reverse: candidate.reverse === true,
  };
}

const cubic = (p0: PathNode, p1: PathNode, p2: PathNode, p3: PathNode, t: number): TextPathPoint => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/** Flatten the first editable contour into a bounded polyline for glyph layout. */
export function flattenTextPath(path: PathModel, stepsPerSegment = 24): TextPathPoint[] {
  const contour = pathContours(path)[0];
  if (!contour || contour.nodes.length < 2) return [];
  const steps = Math.max(4, Math.min(64, Math.round(stepsPerSegment)));
  const points: TextPathPoint[] = [];
  const count = contour.closed ? contour.nodes.length : contour.nodes.length - 1;
  for (let segment = 0; segment < count; segment += 1) {
    const start = contour.nodes[segment];
    const end = contour.nodes[(segment + 1) % contour.nodes.length];
    const out = start.outHandle ?? start;
    const incoming = end.inHandle ?? end;
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const point = start.outHandle || end.inHandle ? cubic(start, out, incoming, end, t) : {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
      if (!points.length || point.x !== points[points.length - 1].x || point.y !== points[points.length - 1].y)
        points.push(point);
    }
  }
  const last = contour.nodes[contour.nodes.length - 1];
  if (!contour.closed) points.push({ x: last.x, y: last.y });
  return points;
}

function cumulative(points: readonly TextPathPoint[]) {
  const distances = [0];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
    distances.push(distances[i - 1] + Math.hypot(dx, dy));
  }
  return distances;
}

function pointAt(points: readonly TextPathPoint[], distances: readonly number[], distance: number) {
  const total = distances[distances.length - 1] ?? 0;
  const target = Math.max(0, Math.min(total, distance));
  let index = 1;
  while (index < distances.length && distances[index] < target) index += 1;
  const left = Math.max(0, index - 1), span = distances[index] - distances[left] || 1;
  const ratio = (target - distances[left]) / span;
  const a = points[left], b = points[Math.min(points.length - 1, index)];
  return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio, rotation: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Produce deterministic glyph centres and rotations along a flattened path. */
export function layoutTextOnPath(
  context: Pick<CanvasRenderingContext2D, 'measureText'>,
  text: string,
  points: readonly TextPathPoint[],
  options: Pick<TextPathBinding, 'offset' | 'reverse'> & { letterSpacing?: number },
): TextPathGlyph[] {
  if (!text || points.length < 2) return [];
  const distances = cumulative(points), total = distances[distances.length - 1] ?? 0;
  const spacing = finite(options.letterSpacing) ? options.letterSpacing! : 0;
  const glyphs = Array.from(text).filter((glyph) => glyph !== '\n' && glyph !== '\r');
  const widths = glyphs.map((glyph) => Math.max(0, context.measureText(glyph).width));
  const placements: TextPathGlyph[] = [];
  let cursor = options.offset;
  for (let index = 0; index < glyphs.length; index += 1) {
    const advance = widths[index] + spacing;
    const centre = cursor + widths[index] / 2;
    if (centre > total || centre < 0) break;
    const distance = options.reverse ? total - centre : centre;
    const sample = pointAt(points, distances, distance);
    placements.push({ glyph: glyphs[index], x: sample.x, y: sample.y, rotation: options.reverse ? sample.rotation + Math.PI : sample.rotation });
    cursor += advance;
  }
  return placements;
}

/** Convert path-local points into the text layer's local coordinate system. */
export function mapTextPathPoints(
  points: readonly TextPathPoint[],
  pathMatrix: TextPathMatrix,
  textMatrix: TextPathMatrix,
): TextPathPoint[] {
  const [pa, pb, pc, pd, pe, pf] = pathMatrix;
  const [ta, tb, tc, td, te, tf] = textMatrix;
  const determinant = ta * td - tb * tc;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return [];
  const ia = td / determinant, ib = -tb / determinant, ic = -tc / determinant, id = ta / determinant;
  return points.map(({ x, y }) => {
    const frameX = pa * x + pc * y + pe, frameY = pb * x + pd * y + pf;
    const dx = frameX - te, dy = frameY - tf;
    return { x: ia * dx + ic * dy, y: ib * dx + id * dy };
  });
}
