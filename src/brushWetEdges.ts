/** Deterministic bounded wet-edge opacity for raster brush-family stamps. */
export const BRUSH_WET_EDGES_MIN = 0;
export const BRUSH_WET_EDGES_MAX = 100;
export const BRUSH_WET_EDGES_DEFAULT = 0;

export function normalizeBrushWetEdges(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_WET_EDGES_DEFAULT;
  return Math.max(BRUSH_WET_EDGES_MIN, Math.min(BRUSH_WET_EDGES_MAX, Math.round(value)));
}

/**
 * Keep the centre slightly drier while preserving full opacity at the tip
 * edge. This bounded approximation has no accumulation state and is safe to replay.
 */
export function wetEdgesOpacity(distance: number, radius: number, amount: number): number {
  const wet = normalizeBrushWetEdges(amount);
  if (wet === 0) return 1;
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 1;
  const edge = Math.max(0, Math.min(1, distance / radius));
  const dryCentre = (1 - edge) * (1 - edge);
  return 1 - (wet / BRUSH_WET_EDGES_MAX) * 0.35 * dryCentre;
}
