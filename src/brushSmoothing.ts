/** Bounded pointer stabilization shared by raster brush-family tools. */
export const BRUSH_SMOOTHING_MIN = 0;
export const BRUSH_SMOOTHING_MAX = 100;
export const BRUSH_SMOOTHING_DEFAULT = 0;

export type BrushPoint = { x: number; y: number };

export function normalizeBrushSmoothing(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return BRUSH_SMOOTHING_DEFAULT;
  return Math.max(BRUSH_SMOOTHING_MIN, Math.min(BRUSH_SMOOTHING_MAX, Math.round(value)));
}

/** Move a pointer sample toward the previous stabilized sample without overshoot. */
export function stabilizeBrushPoint(
  previous: BrushPoint,
  next: BrushPoint,
  amount: number,
): BrushPoint {
  const smoothing = normalizeBrushSmoothing(amount);
  const response = 1 - (smoothing / BRUSH_SMOOTHING_MAX) * 0.85;
  return {
    x: previous.x + (next.x - previous.x) * response,
    y: previous.y + (next.y - previous.y) * response,
  };
}
