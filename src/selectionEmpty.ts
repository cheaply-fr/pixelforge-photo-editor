/**
 * Explicit empty selections (docs/selection-composition-contract.md).
 *
 * A selection gesture whose result covers no canvas pixels (a lasso drawn
 * entirely off the canvas, or an Intersect/Subtract that removes everything)
 * must not silently turn into "no selection": with no selection, Fill,
 * Clear and other selection-scoped edits act on the whole layer. Instead the
 * document keeps an explicit empty selection, encoded with the existing
 * schema as a full-canvas rectangle minus itself, so drafts, undo, Reselect,
 * Invert (which then selects everything) and portable projects need no new
 * fields. Selection-scoped edits check the rendered coverage and stop with
 * EMPTY_SELECTION_NOTICE when nothing is selected.
 */

import type { Selection, SelectionOperation } from './document.ts';

export const EMPTY_SELECTION_NOTICE = 'No pixels are selected';

/** A valid, explicitly empty selection for a `width` × `height` canvas. */
export function emptySelection(width: number, height: number): Selection {
  const w = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1,
    h = Number.isFinite(height) ? Math.max(1, Math.floor(height)) : 1;
  return {
    shape: 'rectangle',
    x: 0,
    y: 0,
    w,
    h,
    feather: 0,
    inverted: false,
    parts: [
      { shape: 'rectangle', x: 0, y: 0, w, h, operation: 'replace' },
      { shape: 'rectangle', x: 0, y: 0, w, h, operation: 'subtract' },
    ],
  };
}

/** True when `selection` is the geometric encoding made by emptySelection. */
export function isExplicitEmptySelection(selection: Selection | undefined): boolean {
  if (!selection || selection.inverted || selection.mask || selection.matrix) return false;
  const parts = selection.parts;
  if (!parts || parts.length < 2) return false;
  const last = parts[parts.length - 1];
  return (
    last.shape === 'rectangle' &&
    last.operation === 'subtract' &&
    last.x === 0 &&
    last.y === 0 &&
    parts.every((part) => part.shape === 'rectangle' && part.x >= last.x && part.y >= last.y &&
      part.x + part.w <= last.x + last.w && part.y + part.h <= last.y + last.h)
  );
}

/**
 * What a selection gesture whose new shape covers nothing on the canvas
 * leaves behind. `keep` leaves the current selection unchanged (Add or
 * Subtract of nothing); `empty` commits an explicit empty selection
 * (Replace, Intersect, or Add/Subtract with no current selection).
 */
export function emptyGestureResult(
  operation: SelectionOperation,
  hasSelection: boolean,
): 'keep' | 'empty' {
  if (!hasSelection) return 'empty';
  return operation === 'add' || operation === 'subtract' ? 'keep' : 'empty';
}

/** True when no alpha sample (every 4th byte of RGBA, or each byte of a plane) is above zero. */
export function selectionCoverageIsEmpty(data: ArrayLike<number>, rgba = true): boolean {
  const step = rgba ? 4 : 1;
  for (let index = rgba ? 3 : 0; index < data.length; index += step) if (data[index] > 0) return false;
  return true;
}

/** Photoshop-style quick fills: Alt/Option+Backspace (foreground) and Ctrl/Cmd+Backspace (background). */
export type QuickFillShortcut = 'foreground' | 'background';

export function quickFillShortcut(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): QuickFillShortcut | null {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return null;
  if (event.shiftKey) return null;
  const command = event.ctrlKey || event.metaKey;
  if (event.altKey && !command) return 'foreground';
  if (command && !event.altKey) return 'background';
  return null;
}
