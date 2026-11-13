/**
 * Bounded selection rendering (docs/selection-feather-contract.md, "Large
 * documents").
 *
 * A feathered selection only changes pixels within a few standard deviations
 * of its geometry, so renderSelection resolves alpha inside a padded crop of
 * the canvas instead of blurring the whole document. Outside the crop the
 * alpha is known: 0, or 255 for an inverted selection. These helpers are pure
 * so the crop/full-canvas equivalence can be tested without a canvas.
 */
import type { Selection, SelectionPart } from './document.ts';
import {
  CANVAS_FEATHER_THRESHOLD,
  FEATHER_BOX_PASSES,
  extendedBoxKernel,
  validSelectionFeather,
} from './selectionFeather.ts';

export type SelectionRect = { x: number; y: number; w: number; h: number };

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The selection's parts, or its single legacy shape as a `replace` part. */
export function selectionParts(selection: Selection): SelectionPart[] {
  return selection.parts?.length ? selection.parts : [{
    shape: selection.shape, x: selection.x, y: selection.y,
    w: selection.w, h: selection.h, points: selection.points, operation: 'replace',
  }];
}

function partBox(part: SelectionPart): Box {
  if (part.shape === 'polygon' && part.points?.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const point of part.points) {
      x0 = Math.min(x0, point.x);
      y0 = Math.min(y0, point.y);
      x1 = Math.max(x1, point.x);
      y1 = Math.max(y1, point.y);
    }
    return { x0, y0, x1, y1 };
  }
  return { x0: part.x, y0: part.y, x1: part.x + part.w, y1: part.y + part.h };
}

/**
 * Pixel bounds that can hold coverage after the parts are composed in order
 * (replace resets, add unions, intersect narrows, subtract never grows).
 * Anti-aliasing is covered by rounding outward plus one pixel. Null when no
 * pixel can be covered or a coordinate is not finite.
 */
export function selectionPartsBounds(parts: readonly SelectionPart[]): Box | null {
  let box: Box | null = null;
  for (const part of parts) {
    const next = partBox(part);
    if (part.operation === 'replace') box = next;
    else if (part.operation === 'add')
      box = box ? {
        x0: Math.min(box.x0, next.x0), y0: Math.min(box.y0, next.y0),
        x1: Math.max(box.x1, next.x1), y1: Math.max(box.y1, next.y1),
      } : next;
    else if (part.operation === 'intersect' && box)
      box = {
        x0: Math.max(box.x0, next.x0), y0: Math.max(box.y0, next.y0),
        x1: Math.min(box.x1, next.x1), y1: Math.min(box.y1, next.y1),
      };
  }
  if (!box || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return null;
  if (box.x1 < box.x0 || box.y1 < box.y0) return null;
  return {
    x0: Math.floor(box.x0) - 1, y0: Math.floor(box.y0) - 1,
    x1: Math.ceil(box.x1) + 1, y1: Math.ceil(box.y1) + 1,
  };
}

/** Bounds of the pixels with nonzero alpha in a row-major alpha plane, or null. */
export function alphaBounds(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  stride = 1,
  offset = 0,
): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let first = -1, last = -1;
    for (let x = 0; x < width; x += 1)
      if (alpha[(row + x) * stride + offset] > 0) {
        if (first < 0) first = x;
        last = x;
      }
    if (first < 0) continue;
    if (y0 > y) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * How far a feather of `feather` px spreads coverage. The exact box filter
 * below CANVAS_FEATHER_THRESHOLD has finite support (passes × (radius + 1)),
 * so cropping there is lossless. The canvas blur() is Gaussian; past 3σ its
 * tail is under 0.14 % (< 0.4 of an alpha byte), so 3σ plus a margin keeps
 * the crop within ±1 of the full-canvas render on software raster. (GPU
 * raster blurs depend on the layer size itself, so there the crop drifts a
 * few alpha steps, less than that backend's own difference from software.)
 */
export function selectionFeatherReach(feather: number): number {
  if (!validSelectionFeather(feather) || feather <= 0) return 0;
  if (feather < CANVAS_FEATHER_THRESHOLD)
    return FEATHER_BOX_PASSES * (extendedBoxKernel(feather).radius + 1);
  return Math.ceil(3 * feather) + 4;
}

/**
 * The canvas region renderSelection must resolve for `selection` on a
 * `width × height` document, before any selection matrix: the coverage
 * bounds padded by the feather reach and clamped to the canvas. Outside it the pre-matrix alpha is 0 (255 when inverted).
 * `content` overrides the geometric bounds (for example a color mask's
 * nonzero pixels); null content selects nothing and yields a 1 × 1 rect.
 */
export function selectionRenderRect(
  selection: Selection,
  width: number,
  height: number,
  content?: Box | null,
): SelectionRect {
  const box = content === undefined ? selectionPartsBounds(selectionParts(selection)) : content;
  if (!box) return { x: 0, y: 0, w: Math.min(1, width), h: Math.min(1, height) };
  const feather = validSelectionFeather(selection.feather) ? selection.feather : 0;
  const reach = selectionFeatherReach(feather);
  const x0 = Math.max(0, box.x0 - reach), y0 = Math.max(0, box.y0 - reach);
  const x1 = Math.min(width, box.x1 + reach), y1 = Math.min(height, box.y1 + reach);
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w: Math.min(1, width), h: Math.min(1, height) };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
