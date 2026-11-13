/**
 * Options-bar settings for the marquee and lasso tools.
 *
 * `feather` applies to the *next* selections those tools create (the
 * Photoshop options-bar behaviour); Select > Modify > Feather still edits the
 * current selection. `style` constrains Rectangular and Elliptical Marquee
 * drags: Normal (free), Fixed Ratio (width:height) or Fixed Size (a click or
 * drag places exactly width × height pixels from the start point).
 */

export type MarqueeStyle = 'normal' | 'fixed-ratio' | 'fixed-size';
export const MARQUEE_STYLES: readonly MarqueeStyle[] = ['normal', 'fixed-ratio', 'fixed-size'];

export type MarqueeOptions = {
  feather: number;
  style: MarqueeStyle;
  /** Ratio terms for Fixed Ratio, pixels for Fixed Size. */
  width: number;
  height: number;
};

/** Same bound as Select > Modify > Feather (MAX_SELECTION_FEATHER). */
export const MARQUEE_FEATHER_MAX = 1000;
export const MARQUEE_DIMENSION_MAX = 30000;

export const DEFAULT_MARQUEE_OPTIONS: MarqueeOptions = Object.freeze({
  feather: 0,
  style: 'normal',
  width: 1,
  height: 1,
});

const bounded = (value: unknown, min: number, max: number, fallback: number, round = false) => {
  const number = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(number)) return fallback;
  const clamped = Math.max(min, Math.min(max, number));
  return round ? Math.round(clamped) : Math.round(clamped * 10) / 10;
};

/** Older drafts omit the options; malformed fields fall back individually. */
export function normalizeMarqueeOptions(value: unknown): MarqueeOptions {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const style = MARQUEE_STYLES.includes(record.style as MarqueeStyle)
    ? (record.style as MarqueeStyle)
    : DEFAULT_MARQUEE_OPTIONS.style;
  return {
    feather: bounded(record.feather, 0, MARQUEE_FEATHER_MAX, DEFAULT_MARQUEE_OPTIONS.feather),
    style,
    width: bounded(record.width, 1, MARQUEE_DIMENSION_MAX, DEFAULT_MARQUEE_OPTIONS.width, true),
    height: bounded(record.height, 1, MARQUEE_DIMENSION_MAX, DEFAULT_MARQUEE_OPTIONS.height, true),
  };
}

export type MarqueeRect = { left: number; top: number; width: number; height: number };

/**
 * The rectangle a marquee drag from `start` to `end` describes under `options`.
 * Fixed styles grow from the start point toward the drag direction, so the
 * start corner stays anchored like the Normal style.
 */
export function marqueeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
  options: Pick<MarqueeOptions, 'style' | 'width' | 'height'>,
): MarqueeRect {
  const dx = end.x - start.x, dy = end.y - start.y;
  const signX = dx < 0 ? -1 : 1, signY = dy < 0 ? -1 : 1;
  // Fixed Size boxes snap their anchor to whole pixels so W × H is exact.
  if (options.style === 'fixed-size') start = { x: Math.round(start.x), y: Math.round(start.y) };
  let width = Math.abs(dx), height = Math.abs(dy);
  if (options.style === 'fixed-size') {
    width = options.width;
    height = options.height;
  } else if (options.style === 'fixed-ratio') {
    const ratio = options.width / options.height;
    // The larger normalised extent wins so the box always reaches the pointer.
    if (width / ratio >= height) height = width / ratio;
    else width = height * ratio;
  }
  return {
    left: signX < 0 ? start.x - width : start.x,
    top: signY < 0 ? start.y - height : start.y,
    width,
    height,
  };
}
