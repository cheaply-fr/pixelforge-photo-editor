/** Deterministic bounded bristle-like opacity modulation for brush-family stamps. */
export const BRUSH_BRISTLE_MIN = 0;
export const BRUSH_BRISTLE_MAX = 100;
export const BRUSH_BRISTLE_DEFAULT = 0;

export function normalizeBrushBristle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_BRISTLE_DEFAULT;
  return Math.max(BRUSH_BRISTLE_MIN, Math.min(BRUSH_BRISTLE_MAX, Math.round(value)));
}

/** Return a replay-stable opacity multiplier without allocating bristle geometry. */
export function bristleOpacity(x: number, y: number, amount: number): number {
  const bristle = normalizeBrushBristle(amount);
  if (bristle === 0) return 1;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const filament = 0.5 + 0.5 * Math.sin(safeX * 0.73 + safeY * 0.11 + Math.sin(safeY * 0.29) * 3);
  return Math.max(0.45, Math.min(1, 1 - (bristle / BRUSH_BRISTLE_MAX) * 0.55 * filament));
}
