/** Bounded deterministic scatter for raster brush-family stamps. */
export const BRUSH_SCATTER_MIN = 0;
export const BRUSH_SCATTER_MAX = 100;
export const BRUSH_SCATTER_DEFAULT = 0;

export type BrushPoint = { x: number; y: number };

export function normalizeBrushScatter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_SCATTER_DEFAULT;
  return Math.max(BRUSH_SCATTER_MIN, Math.min(BRUSH_SCATTER_MAX, Math.round(value)));
}

/** Derive a replay-stable offset without consuming global randomness. */
export function scatterBrushPoint(point: BrushPoint, size: number, amount: number): BrushPoint {
  const scatter = normalizeBrushScatter(amount);
  if (scatter === 0) return { ...point };
  const safeSize = Number.isFinite(size) ? Math.max(1, size) : 1;
  const seed = Math.sin(point.x * 12.9898 + point.y * 78.233 + safeSize * 0.12345) * 43758.5453;
  const xUnit = (seed - Math.floor(seed)) * 2 - 1;
  const ySeed = Math.sin(seed * 93.9898 + point.x * 0.17 - point.y * 0.31) * 43758.5453;
  const yUnit = (ySeed - Math.floor(ySeed)) * 2 - 1;
  const radius = safeSize * 0.75 * (scatter / BRUSH_SCATTER_MAX);
  return { x: point.x + xUnit * radius, y: point.y + yUnit * radius };
}
