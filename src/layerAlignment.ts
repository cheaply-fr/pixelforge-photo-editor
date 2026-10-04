/**
 * Deterministic layer alignment and distribution geometry.
 *
 * The editor stores affine transforms on every layer.  Alignment therefore
 * returns translation deltas instead of baking pixels or changing rotation,
 * scale, masks, or editable source data.  Distribution operates on painted
 * bounds in document space and keeps the first and last item fixed.
 */

export type LayerBounds = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AlignmentMode =
  | 'left'
  | 'center-horizontal'
  | 'right'
  | 'top'
  | 'center-vertical'
  | 'bottom';

export type DistributionAxis = 'horizontal' | 'vertical';

export type Translation = { x: number; y: number };

const finite = (value: number) => Number.isFinite(value);

/** Reject malformed geometry before it can produce a corrupt transform. */
export function validLayerBounds(value: unknown): value is LayerBounds {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<LayerBounds>;
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.x === 'number' && finite(item.x) &&
    typeof item.y === 'number' && finite(item.y) &&
    typeof item.width === 'number' && finite(item.width) &&
    typeof item.height === 'number' && finite(item.height) &&
    item.width >= 0 &&
    item.height >= 0
  );
}

/** Return the canvas-relative translation required for one alignment mode. */
export function alignmentDelta(
  bounds: Pick<LayerBounds, 'x' | 'y' | 'width' | 'height'>,
  canvasWidth: number,
  canvasHeight: number,
  mode: AlignmentMode,
): Translation {
  if (
    !validLayerBounds({ id: 'alignment', ...bounds }) ||
    !finite(canvasWidth) ||
    !finite(canvasHeight) ||
    canvasWidth < 1 ||
    canvasHeight < 1
  )
    throw new Error('Layer alignment geometry is invalid');
  switch (mode) {
    case 'left':
      return { x: -bounds.x, y: 0 };
    case 'center-horizontal':
      return { x: (canvasWidth - bounds.width) / 2 - bounds.x, y: 0 };
    case 'right':
      return { x: canvasWidth - bounds.width - bounds.x, y: 0 };
    case 'top':
      return { x: 0, y: -bounds.y };
    case 'center-vertical':
      return { x: 0, y: (canvasHeight - bounds.height) / 2 - bounds.y };
    case 'bottom':
      return { x: 0, y: canvasHeight - bounds.height - bounds.y };
    default:
      throw new Error('Layer alignment mode is invalid');
  }
}

/**
 * Compute even spacing between painted bounds.  Items are sorted by their
 * current centre along the requested axis; ties are broken by stable id.
 * The outer items remain fixed and interior centres receive equal spacing.
 * One or two items are a deliberate no-op.
 */
export function distributionDeltas(
  items: readonly LayerBounds[],
  axis: DistributionAxis,
): Record<string, Translation> {
  if (
    (axis !== 'horizontal' && axis !== 'vertical') ||
    items.some((item) => !validLayerBounds(item)) ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new Error('Layer distribution geometry is invalid');
  const ordered = [...items].sort((a, b) => {
    const aCenter = axis === 'horizontal' ? a.x + a.width / 2 : a.y + a.height / 2;
    const bCenter = axis === 'horizontal' ? b.x + b.width / 2 : b.y + b.height / 2;
    return aCenter - bCenter || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const deltas: Record<string, Translation> = {};
  for (const item of ordered) deltas[item.id] = { x: 0, y: 0 };
  if (ordered.length < 3) return deltas;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const firstCenter = axis === 'horizontal' ? first.x + first.width / 2 : first.y + first.height / 2;
  const lastCenter = axis === 'horizontal' ? last.x + last.width / 2 : last.y + last.height / 2;
  const step = (lastCenter - firstCenter) / (ordered.length - 1);
  if (!finite(step)) throw new Error('Layer distribution spacing is invalid');
  for (let index = 1; index < ordered.length - 1; index += 1) {
    const item = ordered[index];
    const current = axis === 'horizontal' ? item.x + item.width / 2 : item.y + item.height / 2;
    const delta = step * index - (current - firstCenter);
    deltas[item.id] = axis === 'horizontal' ? { x: delta, y: 0 } : { x: 0, y: delta };
  }
  return deltas;
}

/** Apply a translation to an affine matrix without changing its basis. */
export function translateMatrix(
  matrix: readonly [number, number, number, number, number, number],
  delta: Translation,
): [number, number, number, number, number, number] {
  if (
    matrix.length !== 6 ||
    matrix.some((value) => !finite(value)) ||
    Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 0.000000000001 ||
    !finite(delta.x) ||
    !finite(delta.y)
  )
    throw new Error('Layer transform translation is invalid');
  const next: [number, number, number, number, number, number] = [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4] + delta.x, matrix[5] + delta.y];
  if (next.some((value) => !finite(value) || Math.abs(value) > 1000000))
    throw new Error('Layer transform translation is out of range');
  return next;
}
