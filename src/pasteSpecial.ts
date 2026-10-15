import type { Matrix } from './document';

export type PasteSpecialMode = 'in-place' | 'center' | 'into-selection';

const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

/**
 * Return an immutable affine matrix for a special paste placement.
 *
 * The center mode preserves the copied layer's scale, rotation and shear. It
 * only translates the layer so the centre of its local bounds lands at the
 * centre of the destination canvas. In-place is an exact matrix copy; callers
 * still clone the layer identity before inserting it into a frame.
 */
export function pastePlacementMatrix(
  matrix: Matrix,
  bounds: { x: number; y: number; width: number; height: number },
  frame: { width: number; height: number },
  mode: PasteSpecialMode,
): Matrix {
  if (!Array.isArray(matrix) || matrix.length !== 6)
    throw new Error('Paste placement matrix must contain six values');
  if (!['in-place', 'center', 'into-selection'].includes(mode))
    throw new Error('Unknown paste placement mode');
  const normalized = matrix.map((value) => finite(value, 0)) as Matrix;
  if (mode !== 'center') return normalized;
  const width = finite(bounds.width, 0),
    height = finite(bounds.height, 0),
    x = finite(bounds.x, 0),
    y = finite(bounds.y, 0),
    frameWidth = finite(frame.width, 0),
    frameHeight = finite(frame.height, 0),
    [a, b, c, d, e, f] = normalized,
    localX = x + width / 2,
    localY = y + height / 2,
    centerX = a * localX + c * localY + e,
    centerY = b * localX + d * localY + f;
  return [
    a,
    b,
    c,
    d,
    e + frameWidth / 2 - centerX,
    f + frameHeight / 2 - centerY,
  ];
}

export function normalizePasteSpecialMode(value: unknown): PasteSpecialMode {
  return value === 'center' || value === 'into-selection' ? value : 'in-place';
}
