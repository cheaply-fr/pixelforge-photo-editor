/**
 * Angle and Diamond gradient geometry for the Gradient tool.
 *
 * Canvas 2D has native linear and radial gradients only, so these two types
 * are rendered per pixel: each pixel gets a ramp position `t` in [0, 1] and
 * the colour is read from a 256-entry lookup row rendered with the same
 * colour stops as a linear gradient (so stops, midpoint, reverse and the
 * transparent end behave exactly as for Linear).
 *
 * - Angle: `t` is the sweep angle around the drag start, measured from the
 *   drag direction and increasing counter-clockwise on screen, divided by a
 *   full turn. The ramp therefore restarts (a hard seam) along the drag
 *   direction.
 * - Diamond: `t` is |u| + |v| / drag length, where u and v are the pixel's
 *   offsets along and across the drag direction, giving a square rotated to
 *   the drag with one corner at the drag end.
 */

export const GRADIENT_SHAPE_MODES = ['angle', 'diamond'] as const;
export type GradientShapeMode = (typeof GRADIENT_SHAPE_MODES)[number];
export const GRADIENT_LOOKUP_SIZE = 256;

type Point = { x: number; y: number };

/** Ramp position at pixel centre (x + 0.5, y + 0.5). */
export function gradientShapeT(mode: GradientShapeMode, x: number, y: number, start: Point, end: Point): number {
  const dx = end.x - start.x, dy = end.y - start.y,
    length = Math.max(1e-6, Math.hypot(dx, dy)),
    px = x + 0.5 - start.x, py = y + 0.5 - start.y;
  if (mode === 'angle') {
    if (Math.hypot(dx, dy) < 1e-6) return 0;
    const turn = Math.PI * 2,
      // Screen y points down, so a counter-clockwise sweep decreases atan2.
      delta = Math.atan2(dy, dx) - Math.atan2(py, px);
    return (((delta % turn) + turn) % turn) / turn;
  }
  const ux = dx / length, uy = dy / length,
    along = px * ux + py * uy,
    across = -px * uy + py * ux;
  return Math.min(1, (Math.abs(along) + Math.abs(across)) / length);
}

/**
 * Fill RGBA pixels (row-major `width` × `height`, in the coordinates of
 * `start`/`end`) from a lookup row of `GRADIENT_LOOKUP_SIZE` RGBA entries.
 */
export function renderGradientShape(
  mode: GradientShapeMode,
  width: number,
  height: number,
  start: Point,
  end: Point,
  lookup: ArrayLike<number>,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Gradient dimensions are invalid');
  if (lookup.length !== GRADIENT_LOOKUP_SIZE * 4) throw new Error('Gradient lookup row is invalid');
  if (!GRADIENT_SHAPE_MODES.includes(mode)) throw new Error('Gradient type is invalid');
  const output = new Uint8ClampedArray(width * height * 4), last = GRADIENT_LOOKUP_SIZE - 1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = Math.round(gradientShapeT(mode, x, y, start, end) * last) * 4,
        offset = (y * width + x) * 4;
      output[offset] = lookup[index];
      output[offset + 1] = lookup[index + 1];
      output[offset + 2] = lookup[index + 2];
      output[offset + 3] = lookup[index + 3];
    }
  return output;
}
