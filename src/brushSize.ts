/**
 * Shared painting-tool Size range and its UI mappings.
 *
 * Every tool that reads the editor's shared `size` setting (brush, pencil,
 * erasers, mask/Quick Mask brushes, clone/heal, retouch, tonal, smudge,
 * history/mixer brushes, …) is bounded by this range. The per-engine
 * validators accept up to 10,000 px, so 5,000 px leaves headroom for
 * layer-local scaling (see `localSize`) while matching the largest common
 * desktop-editor brush. One pixel is the smallest diameter every engine
 * accepts and is useful for pixel-level pencil/eraser work.
 */
export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 5000;
/** Number of discrete positions on the perceptual Size slider track. */
export const BRUSH_SIZE_SLIDER_STEPS = 1000;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function validBrushSize(value: unknown): value is number {
  return finite(value) && value >= BRUSH_SIZE_MIN && value <= BRUSH_SIZE_MAX;
}

/** Clamp to the shared range and round to whole pixels; invalid input falls back. */
export function clampBrushSize(value: unknown, fallback = 18): number {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  const candidate = finite(numeric) ? numeric : finite(fallback) ? fallback : 18;
  return Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, Math.round(candidate)));
}

/**
 * Size bands for the `[` / `]` shortcuts and slider arrow keys. Each band's
 * step applies while the size is below `upTo`, so small brushes stay precise
 * and very large ones change by a perceptually similar fraction.
 */
const SIZE_BANDS: readonly { upTo: number; step: number }[] = [
  { upTo: 10, step: 1 },
  { upTo: 100, step: 5 },
  { upTo: 200, step: 10 },
  { upTo: 300, step: 25 },
  { upTo: 500, step: 50 },
  { upTo: 1000, step: 100 },
  { upTo: 2000, step: 200 },
  { upTo: Infinity, step: 500 },
];

/** Step used when moving away from `size` in the given direction. */
export function brushSizeStep(size: number, direction: 1 | -1 = 1): number {
  // Decreasing from a band boundary uses the finer band below it, so
  // 100 → 95 and 200 → 190 retrace the values reached on the way up.
  const probe = direction > 0 ? size : size - 1e-9;
  return (SIZE_BANDS.find((band) => probe < band.upTo) ?? SIZE_BANDS[SIZE_BANDS.length - 1]).step;
}

/**
 * Photoshop-like proportional resize: snap to the next multiple of the band
 * step in the requested direction, clamped to the shared range.
 */
export function stepBrushSize(size: number, direction: 1 | -1): number {
  const current = clampBrushSize(size);
  const step = brushSizeStep(current, direction);
  const next = direction > 0
    ? Math.floor(current / step) * step + step
    : Math.ceil(current / step) * step - step;
  return clampBrushSize(next);
}

const LOG_MAX = Math.log(BRUSH_SIZE_MAX / BRUSH_SIZE_MIN);

/** Map a size to a perceptual (logarithmic) slider position 0…BRUSH_SIZE_SLIDER_STEPS. */
export function brushSizeToSliderPosition(size: number): number {
  const value = Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, finite(size) ? size : BRUSH_SIZE_MIN));
  return Math.round((Math.log(value / BRUSH_SIZE_MIN) / LOG_MAX) * BRUSH_SIZE_SLIDER_STEPS);
}

/** Inverse of `brushSizeToSliderPosition`, rounded to whole pixels. */
export function sliderPositionToBrushSize(position: number): number {
  const t = Math.max(0, Math.min(BRUSH_SIZE_SLIDER_STEPS, finite(position) ? position : 0)) / BRUSH_SIZE_SLIDER_STEPS;
  return clampBrushSize(BRUSH_SIZE_MIN * Math.exp(t * LOG_MAX));
}

export function brushSizeValueText(size: number): string {
  return `${clampBrushSize(size)} px`;
}

/**
 * Brush dab placement with spacing carried across pointer segments.
 *
 * Returns the parametric positions (0…1 along `from`→`to`) where dabs fall and
 * the distance travelled since the last dab. The first segment of a stroke
 * (`state.started === false`) dabs at its start; later segments never re-dab
 * their start point, so dab count scales with path length ÷ (size × spacing)
 * instead of pointer-event count. This keeps very large brushes responsive.
 */
export type BrushSpacingState = {
  started: boolean;
  carry: number;
  /**
   * First dab held back until the stroke has a direction (perpendicular-only
   * scatter); see `deferFirstBrushDab` in `brushDynamics.ts`.
   */
  deferredFirst?: { x: number; y: number };
};

export function spacedDabPositions(
  distance: number,
  spacingPixels: number,
  state: BrushSpacingState,
  maxDabs = 4096,
): number[] {
  const interval = Math.max(1, finite(spacingPixels) ? spacingPixels : 1),
    length = Math.max(0, finite(distance) ? distance : 0),
    positions: number[] = [];
  if (!state.started) {
    state.started = true;
    state.carry = 0;
    positions.push(0);
  }
  let next = interval - Math.max(0, Math.min(interval, state.carry));
  let last = -1;
  while (next <= length && positions.length < maxDabs) {
    positions.push(length > 0 ? next / length : 0);
    last = next;
    next += interval;
  }
  state.carry = last >= 0 ? length - last : state.carry + length;
  return positions;
}

/** Sizes above the legacy 100 px ceiling coalesce pointer moves for whole-layer engines. */
export const BRUSH_SEGMENT_GATE_SIZE = 100;

/**
 * Whether a whole-layer stroke engine (Smudge, Blur/Sharpen, Dodge/Burn/
 * Sponge, Quick Mask) should process the pointer travel since its last
 * applied point. Those engines interpolate along each segment, so coalescing
 * moves shorter than 10% of a large brush keeps coverage continuous while
 * avoiding a multi-megapixel pass per pointer event. Sizes within the legacy
 * 1–100 px range keep processing every move.
 */
export function brushSegmentDue(distance: number, size: number): boolean {
  if (!finite(size) || size <= BRUSH_SEGMENT_GATE_SIZE) return true;
  return finite(distance) && distance >= size * 0.1;
}
