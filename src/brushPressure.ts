/**
 * Deterministic pen/touch pressure response curves for brush-family tools.
 * Curves only remap normalized pressure; they never change mouse fallback
 * behavior or permit values outside the 0..1 range.
 */
export const BRUSH_PRESSURE_CURVES = ['linear', 'soft', 'firm'] as const;
export type BrushPressureCurve = (typeof BRUSH_PRESSURE_CURVES)[number];

export function validBrushPressureCurve(value: unknown): value is BrushPressureCurve {
  return typeof value === 'string' && BRUSH_PRESSURE_CURVES.includes(value as BrushPressureCurve);
}

export function normalizeBrushPressureCurve(value: unknown): BrushPressureCurve {
  return validBrushPressureCurve(value) ? value : 'linear';
}

/** Apply a bounded response curve to normalized pressure. */
export function mapBrushPressure(
  pressure: number,
  curve: BrushPressureCurve = 'linear',
): number {
  if (!Number.isFinite(pressure)) throw new Error('Brush pressure must be finite');
  if (!validBrushPressureCurve(curve)) throw new Error('Brush pressure curve is invalid');
  const normalized = Math.max(0, Math.min(1, pressure));
  if (curve === 'soft') return Math.sqrt(normalized);
  if (curve === 'firm') return normalized * normalized;
  return normalized;
}
