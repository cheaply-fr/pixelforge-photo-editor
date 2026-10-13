/** Deterministic bounded bristle-like opacity modulation for brush-family stamps. */
export const BRUSH_BRISTLE_MIN = 0;
export const BRUSH_BRISTLE_MAX = 100;
export const BRUSH_BRISTLE_DEFAULT = 0;

export function normalizeBrushBristle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BRUSH_BRISTLE_DEFAULT;
  return Math.max(BRUSH_BRISTLE_MIN, Math.min(BRUSH_BRISTLE_MAX, Math.round(value)));
}

/** Return a replay-stable opacity multiplier for local dab buildup. */
export function bristleOpacity(x: number, y: number, amount: number): number {
  const bristle = normalizeBrushBristle(amount);
  if (bristle === 0) return 1;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const filament = 0.5 + 0.5 * Math.sin(safeX * 0.73 + safeY * 0.11 + Math.sin(safeY * 0.29) * 3);
  return Math.max(0.45, Math.min(1, 1 - (bristle / BRUSH_BRISTLE_MAX) * 0.55 * filament));
}

/** Return deterministic filament coverage for a stamp pixel, with zero as an exact identity. */
export function bristleCoverage(dx: number, dy: number, radius: number, amount: number): number {
  const bristle = normalizeBrushBristle(amount);
  if (bristle === 0) return 1;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(radius) || radius <= 0) return 0;
  const count = 3 + Math.round((bristle / BRUSH_BRISTLE_MAX) * 5),
    filamentRadius = Math.max(0.5, radius * (0.24 + bristle / BRUSH_BRISTLE_MAX * 0.16));
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const position = count === 1 ? 0.5 : index / (count - 1),
      offset = (position - 0.5) * radius * 1.35,
      distance = Math.hypot(dx, dy - offset);
    total += Math.max(0, Math.min(1, 1 - distance / filamentRadius));
  }
  return Math.max(0, Math.min(1, 0.18 + (total / count) * 0.82));
}
