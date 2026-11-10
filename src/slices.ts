import type { SliceRect } from './cropTools.ts';
import type { Matrix } from './document.ts';

export type { SliceRect } from './cropTools.ts';

export const MAX_DOCUMENT_SLICES = 256;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

/** Validate one persisted slice against its containing canvas. */
export function validDocumentSlice(
  value: unknown,
  canvasWidth: number,
  canvasHeight: number,
): value is SliceRect {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<SliceRect>;
  return (
    typeof item.id === 'string' && ID_PATTERN.test(item.id) &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 120 &&
    Number.isInteger(item.x) && Number(item.x) >= 0 && Number(item.x) < canvasWidth &&
    Number.isInteger(item.y) && Number(item.y) >= 0 && Number(item.y) < canvasHeight &&
    Number.isInteger(item.width) && Number(item.width) >= 1 && Number(item.x) + Number(item.width) <= canvasWidth &&
    Number.isInteger(item.height) && Number(item.height) >= 1 && Number(item.y) + Number(item.height) <= canvasHeight
  );
}

/** Validate bounded, uniquely identified persisted slice metadata. */
export function validDocumentSlices(
  value: unknown,
  canvasWidth: number,
  canvasHeight: number,
  activeId?: unknown,
): value is SliceRect[] {
  if (!Array.isArray(value) || value.length > MAX_DOCUMENT_SLICES) return false;
  const ids = new Set<string>();
  for (const slice of value) {
    if (!validDocumentSlice(slice, canvasWidth, canvasHeight)) return false;
    if (ids.has(slice.id)) return false;
    ids.add(slice.id);
  }
  return activeId === undefined || (typeof activeId === 'string' && ids.has(activeId));
}

/** Return the topmost persisted slice under a canvas-space point. */
export function sliceAtPoint(
  slices: readonly SliceRect[] | undefined,
  x: number,
  y: number,
): SliceRect | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  for (let index = (slices?.length ?? 0) - 1; index >= 0; index -= 1) {
    const item = slices![index];
    if (x >= item.x && y >= item.y && x < item.x + item.width && y < item.y + item.height)
      return { ...item };
  }
  return undefined;
}

/** Part of a selected slice a Slice Select drag grabs. */
export type SliceHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type SliceBounds = Pick<SliceRect, 'x' | 'y' | 'width' | 'height'>;

/**
 * Hit-test a slice: corners first, then edges (both within `tolerance`
 * canvas pixels of the border), then the interior (move). Null outside.
 */
export function hitTestSliceHandle(
  slice: SliceBounds,
  x: number,
  y: number,
  tolerance: number,
): SliceHandle | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const t = Math.max(0, tolerance);
  const left = slice.x,
    top = slice.y,
    right = slice.x + slice.width,
    bottom = slice.y + slice.height;
  if (x < left - t || x > right + t || y < top - t || y > bottom + t) return null;
  // Keep the interior reachable on tiny slices: edges never take more than a third.
  const tx = Math.min(t, slice.width / 3),
    ty = Math.min(t, slice.height / 3);
  const nearLeft = x <= left + tx,
    nearRight = x >= right - tx,
    nearTop = y <= top + ty,
    nearBottom = y >= bottom - ty;
  const vertical = nearTop ? 'n' : nearBottom ? 's' : '';
  const horizontal = nearLeft ? 'w' : nearRight ? 'e' : '';
  const handle = `${vertical}${horizontal}`;
  if (handle) return handle as SliceHandle;
  return 'move';
}

/**
 * Move or resize a slice by a canvas-pixel drag delta. Results are whole
 * pixels, at least 1 × 1 and kept inside the canvas; a move keeps the size.
 */
export function adjustSliceRect<T extends SliceBounds>(
  slice: T,
  handle: SliceHandle,
  dx: number,
  dy: number,
  canvasWidth: number,
  canvasHeight: number,
): T {
  const rx = Math.round(Number.isFinite(dx) ? dx : 0),
    ry = Math.round(Number.isFinite(dy) ? dy : 0);
  if (handle === 'move') {
    const x = Math.max(0, Math.min(canvasWidth - slice.width, slice.x + rx)),
      y = Math.max(0, Math.min(canvasHeight - slice.height, slice.y + ry));
    return { ...slice, x, y };
  }
  let left = slice.x,
    top = slice.y,
    right = slice.x + slice.width,
    bottom = slice.y + slice.height;
  if (handle.includes('w')) left = Math.max(0, Math.min(right - 1, left + rx));
  if (handle.includes('e')) right = Math.min(canvasWidth, Math.max(left + 1, right + rx));
  if (handle.includes('n')) top = Math.max(0, Math.min(bottom - 1, top + ry));
  if (handle.includes('s')) bottom = Math.min(canvasHeight, Math.max(top + 1, bottom + ry));
  return { ...slice, x: left, y: top, width: right - left, height: bottom - top };
}

/** Return a cloned, validated collection for safe persistence. */
export function cloneDocumentSlices(slices: readonly SliceRect[] | undefined): SliceRect[] | undefined {
  return slices?.map((slice) => ({ ...slice }));
}

/** Transform a persisted slice to the clipped axis-aligned bounds of a new canvas. */
export function transformDocumentSlice(
  slice: SliceRect,
  matrix: Matrix,
  canvasWidth: number,
  canvasHeight: number,
): SliceRect | undefined {
  const points = [
    [slice.x, slice.y],
    [slice.x + slice.width, slice.y],
    [slice.x, slice.y + slice.height],
    [slice.x + slice.width, slice.y + slice.height],
  ].map(([x, y]) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }));
  const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const right = Math.min(canvasWidth, Math.ceil(Math.max(...points.map((point) => point.x))));
  const bottom = Math.min(canvasHeight, Math.ceil(Math.max(...points.map((point) => point.y))));
  if (right <= left || bottom <= top) return undefined;
  return { ...slice, x: left, y: top, width: right - left, height: bottom - top };
}
