/** Deterministic secondary brush modulation for brush-family stamps. */
export const BRUSH_DUAL_MIN = 0;
export const BRUSH_DUAL_MAX = 100;
export const BRUSH_DUAL_DEFAULT = 0;

export function normalizeBrushDual(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_DUAL_DEFAULT;
  return Math.max(BRUSH_DUAL_MIN, Math.min(BRUSH_DUAL_MAX, Math.round(value)));
}

/**
 * Return a bounded, replay-stable opacity multiplier. Zero is an exact
 * identity; higher values reveal a deterministic secondary-brush weave.
 */
export function dualBrushOpacity(x: number, y: number, amount: number): number {
  const dual = normalizeBrushDual(amount);
  if (dual === 0) return 1;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const weave = 0.5 + 0.5 * Math.sin(safeX * 0.37 + Math.cos(safeY * 0.19) * 2.1);
  return Math.max(0.55, Math.min(1, 1 - (dual / BRUSH_DUAL_MAX) * 0.45 * weave));
}
