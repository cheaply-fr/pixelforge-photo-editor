/** Deterministic bounded build-up opacity for raster brush-family stamps. */
export const BRUSH_BUILD_UP_MIN = 0;
export const BRUSH_BUILD_UP_MAX = 100;
export const BRUSH_BUILD_UP_DEFAULT = 0;

export function normalizeBrushBuildUp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_BUILD_UP_DEFAULT;
  return Math.max(BRUSH_BUILD_UP_MIN, Math.min(BRUSH_BUILD_UP_MAX, Math.round(value)));
}

/**
 * Preserve the dab centre while reducing the outer deposit. Repeated
 * source-safe dabs therefore build density toward the centre without hidden
 * accumulation state or nondeterministic randomness.
 */
export function buildUpOpacity(distance: number, radius: number, amount: number): number {
  const buildUp = normalizeBrushBuildUp(amount);
  if (buildUp === 0) return 1;
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 1;
  const edge = Math.max(0, Math.min(1, distance / radius));
  return 1 - (buildUp / BRUSH_BUILD_UP_MAX) * 0.35 * edge * edge;
}
