/**
 * The Layer opacity field: one source of truth (the layer's `opacity`, 0..1)
 * for both the slider and its "Opacity N%" label.
 *
 * The slider listens to React's onChange and to native input/change events,
 * because a value set from script (browser automation, extensions, assistive
 * tools) updates React's value tracker and never reaches onChange. Both paths
 * call the same handler, so a value is applied once even when both fire.
 */

/** The whole percentage the field shows for a stored opacity. */
export function layerOpacityPercent(opacity: number): number {
  if (!Number.isFinite(opacity)) return 100;
  return Math.round(Math.max(0, Math.min(1, opacity)) * 100);
}

/** A slider value as a whole percentage, or undefined when it is not a number. */
export function parseLayerOpacityPercent(raw: unknown): number | undefined {
  if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
  if (typeof raw === 'string' && raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.round(Math.max(0, Math.min(100, value)));
}

/**
 * The percentage to apply for a slider value, or undefined when it is
 * already the layer's opacity or the value just requested for that layer
 * (the second of a native event and React's onChange for one change).
 */
export function layerOpacityChange(
  raw: unknown,
  layer: { id: string; opacity: number },
  requested: { id: string; value: number } | null,
): number | undefined {
  const value = parseLayerOpacityPercent(raw);
  if (value === undefined) return undefined;
  const current = requested && requested.id === layer.id ? requested.value : layerOpacityPercent(layer.opacity);
  return value === current ? undefined : value;
}
