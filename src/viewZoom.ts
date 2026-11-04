/**
 * True pixel zoom for the editor view.
 *
 * A view zoom is the percentage of one image pixel per CSS pixel: 100 means
 * actual pixels, 400 means each image pixel covers 4×4 CSS pixels. It is a
 * view setting only and never changes document pixels.
 *
 * Drafts written before this model stored `zoom` as a percentage of the
 * stage width (20–140). That field is still written (as the old default) so
 * older builds keep accepting new drafts; new builds prefer `viewZoom`.
 */

export const MIN_VIEW_ZOOM = 1;
export const MAX_VIEW_ZOOM = 3200;

/** Photoshop-style preset steps used by zoom in/out and the slider. */
export const ZOOM_STEPS: readonly number[] = [
  1, 2, 3, 4, 5, 6.25, 8.33, 12.5, 16.67, 25, 33.33, 50, 66.67, 100, 150, 200,
  300, 400, 600, 800, 1200, 1600, 2400, 3200,
];

const EPSILON = 1e-6;

export function validViewZoom(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_VIEW_ZOOM &&
    value <= MAX_VIEW_ZOOM
  );
}

export function clampViewZoom(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, value));
}

/** The next preset step above (`direction` 1) or below (-1) the zoom. */
export function stepViewZoom(zoom: number, direction: 1 | -1): number {
  const current = clampViewZoom(zoom);
  if (direction > 0) {
    const next = ZOOM_STEPS.find((step) => step > current + EPSILON);
    return next ?? MAX_VIEW_ZOOM;
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1)
    if (ZOOM_STEPS[i] < current - EPSILON) return ZOOM_STEPS[i];
  return MIN_VIEW_ZOOM;
}

/** Index of the preset step nearest to the zoom (on a log scale). */
export function nearestZoomStepIndex(zoom: number): number {
  const target = Math.log(clampViewZoom(zoom));
  let best = 0;
  for (let i = 1; i < ZOOM_STEPS.length; i += 1)
    if (Math.abs(Math.log(ZOOM_STEPS[i]) - target) < Math.abs(Math.log(ZOOM_STEPS[best]) - target))
      best = i;
  return best;
}

/**
 * Largest zoom showing the whole image inside the stage, after padding.
 * Fit may magnify a small image but never beyond `maxFit` (default 100%,
 * like Photoshop's Fit on Screen for images smaller than the window).
 */
export function fitViewZoom(input: {
  imageWidth: number;
  imageHeight: number;
  stageWidth: number;
  stageHeight: number;
  padding?: number;
  maxFit?: number;
}): number {
  const { imageWidth, imageHeight, stageWidth, stageHeight } = input;
  const padding = input.padding ?? 0;
  if (!(imageWidth > 0 && imageHeight > 0)) return 100;
  const width = Math.max(1, stageWidth - padding * 2);
  const height = Math.max(1, stageHeight - padding * 2);
  const fit = Math.min(width / imageWidth, height / imageHeight) * 100;
  return clampViewZoom(Math.min(fit, input.maxFit ?? 100));
}

/** Readable label: whole numbers when exact, otherwise up to two decimals. */
export function formatViewZoom(zoom: number): string {
  const rounded = Math.round(clampViewZoom(zoom) * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')}%`;
}

type Box = { left: number; top: number; width: number; height: number };

/**
 * Scroll change that keeps the image point under the anchor (client
 * coordinates) fixed when the displayed image moves from `before` to `after`
 * because of a zoom. Add the result to the stage's scrollLeft/scrollTop.
 */
export function anchorScrollDelta(
  before: Box,
  after: Box,
  anchorX: number,
  anchorY: number,
): { dx: number; dy: number } {
  const fx = (anchorX - before.left) / Math.max(1e-9, before.width);
  const fy = (anchorY - before.top) / Math.max(1e-9, before.height);
  return {
    dx: after.left + fx * after.width - anchorX,
    dy: after.top + fy * after.height - anchorY,
  };
}

/**
 * Value written to the legacy `zoom` field. Older builds validate it as a
 * stage-width percentage (20–140) and open new drafts at their default.
 */
export const LEGACY_STAGE_ZOOM = 72;
