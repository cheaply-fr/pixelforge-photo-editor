/**
 * Pure geometry behind the Crop and Perspective Crop tool options: aspect
 * ratio constraints, the straighten inscribed rectangle, Delete Cropped
 * Pixels trimming plans, resampled-size annotations and perspective quad
 * construction / hit testing. DOM-free so Node tests cover it exactly.
 */
import type { CropPoint, CropQuad } from './cropTools.ts';
import type { MeasurementAnnotation } from './measurements.ts';
import type { CropRatioPreset } from './navigationOptions.ts';

type Matrix = [number, number, number, number, number, number];

const PRESET_RATIOS: Partial<Record<CropRatioPreset, number>> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '5:7': 5 / 7,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

/** Width / height ratio for a preset, or null for an unconstrained crop. */
export function cropAspectRatio(
  preset: CropRatioPreset,
  options: { canvasWidth: number; canvasHeight: number; width: number; height: number },
): number | null {
  if (preset === 'free') return null;
  if (preset === 'original')
    return options.canvasWidth > 0 && options.canvasHeight > 0 ? options.canvasWidth / options.canvasHeight : null;
  if (preset === 'ratio' || preset === 'size')
    return options.width > 0 && options.height > 0 ? options.width / options.height : null;
  return PRESET_RATIOS[preset] ?? null;
}

/**
 * Constrain a crop drag to `ratio` (width / height). The start is clamped to
 * the canvas; the box shrinks to fit inside both the drag and the canvas,
 * keeping the drag direction. Returns the constrained end point.
 */
export function constrainCropEnd(
  start: CropPoint,
  end: CropPoint,
  ratio: number | null,
  canvasWidth: number,
  canvasHeight: number,
): CropPoint {
  if (!ratio || !(ratio > 0) || !Number.isFinite(ratio)) return end;
  // Whole-pixel start and size so the planned crop keeps the exact ratio.
  const sx = Math.floor(Math.max(0, Math.min(canvasWidth, start.x))),
    sy = Math.floor(Math.max(0, Math.min(canvasHeight, start.y)));
  const directionX = end.x >= sx ? 1 : -1,
    directionY = end.y >= sy ? 1 : -1;
  const availableX = directionX > 0 ? canvasWidth - sx : sx,
    availableY = directionY > 0 ? canvasHeight - sy : sy;
  let width = Math.min(Math.abs(end.x - sx), availableX),
    height = Math.min(Math.abs(end.y - sy), availableY);
  if (width / Math.max(height, 1e-9) > ratio) width = height * ratio;
  else height = width / ratio;
  let w = Math.floor(width),
    h = Math.round(w / ratio);
  if (h > availableY) {
    h = Math.floor(availableY);
    w = Math.min(Math.floor(availableX), Math.round(h * ratio));
  }
  return { x: sx + directionX * w, y: sy + directionY * h };
}

/**
 * Largest centred axis-aligned rectangle, with the canvas aspect ratio, that
 * stays inside a w × h canvas rotated by `degrees` about its centre (the
 * crop Straighten uses it so no transparent corners remain).
 */
export function inscribedCropAfterRotation(
  width: number,
  height: number,
  degrees: number,
): { left: number; top: number; width: number; height: number } {
  const angle = (Math.abs(degrees % 180) * Math.PI) / 180;
  const theta = angle > Math.PI / 2 ? Math.PI - angle : angle;
  const cos = Math.cos(theta),
    sin = Math.sin(theta);
  const scale = Math.min(1, width / (width * cos + height * sin), height / (width * sin + height * cos));
  // Whole pixels, shrunk by one where needed so the box is exactly centred
  // (an off-centre half pixel could poke a corner outside the rotated canvas).
  let w = Math.max(1, Math.floor(width * scale)),
    h = Math.max(1, Math.floor(height * scale));
  if ((width - w) % 2 && w > 1) w -= 1;
  if ((height - h) % 2 && h > 1) h -= 1;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}

export type CropTrimPlan =
  | { empty: true }
  | { empty: false; crop: { x: number; y: number; width: number; height: number }; matrix: Matrix };

/**
 * Delete Cropped Pixels for one raster layer placed by `matrix` on the new
 * canvas. Only whole-pixel translations are trimmed (a lossless copy);
 * scaled/rotated layers return null and keep their pixels, as do layers
 * already inside the canvas.
 */
export function planCropTrim(
  matrix: readonly number[],
  assetWidth: number,
  assetHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): CropTrimPlan | null {
  const [a, b, c, d, e, f] = matrix;
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1 || !Number.isInteger(e) || !Number.isInteger(f)) return null;
  const left = Math.max(0, e),
    top = Math.max(0, f),
    right = Math.min(canvasWidth, e + assetWidth),
    bottom = Math.min(canvasHeight, f + assetHeight);
  if (right <= left || bottom <= top) return { empty: true };
  if (left === e && top === f && right === e + assetWidth && bottom === f + assetHeight) return null;
  return {
    empty: false,
    crop: { x: left - e, y: top - f, width: right - left, height: bottom - top },
    matrix: [1, 0, 0, 1, left, top],
  };
}

/** Scale annotation coordinates after a crop is resampled to a fixed size. */
export function scaleMeasurements(
  annotations: readonly MeasurementAnnotation[] | undefined,
  sx: number,
  sy: number,
): MeasurementAnnotation[] | undefined {
  if (!annotations) return undefined;
  return annotations.map((item) => {
    if (item.kind === 'ruler') {
      const start = { x: item.start.x * sx, y: item.start.y * sy },
        end = { x: item.end.x * sx, y: item.end.y * sy };
      return {
        ...item,
        start,
        end,
        pixels: Math.hypot(end.x - start.x, end.y - start.y),
        angle: Math.round(((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI) * 10) / 10,
      };
    }
    return { ...item, x: item.x * sx, y: item.y * sy };
  });
}

/** Axis-aligned perspective quad (TL, TR, BR, BL) for a drag, clipped to the canvas. */
export function rectangleQuad(
  start: CropPoint,
  end: CropPoint,
  canvasWidth: number,
  canvasHeight: number,
): CropQuad {
  const left = Math.max(0, Math.min(start.x, end.x)),
    top = Math.max(0, Math.min(start.y, end.y)),
    right = Math.min(canvasWidth, Math.max(start.x, end.x)),
    bottom = Math.min(canvasHeight, Math.max(start.y, end.y));
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/**
 * Order four clicked corners clockwise on screen starting at the top-left
 * (smallest x + y), whatever order they were clicked in.
 */
export function orderQuadCorners(points: readonly CropPoint[]): CropQuad {
  if (points.length !== 4) throw new Error('A perspective crop needs four corners');
  const cx = points.reduce((sum, point) => sum + point.x, 0) / 4,
    cy = points.reduce((sum, point) => sum + point.y, 0) / 4;
  const sorted = [...points]
    .map((point) => ({ ...point }))
    .sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  let first = 0;
  for (let index = 1; index < 4; index += 1)
    if (sorted[index].x + sorted[index].y < sorted[first].x + sorted[first].y) first = index;
  return [0, 1, 2, 3].map((offset) => sorted[(first + offset) % 4]) as CropQuad;
}

/** Index of the quad corner within `tolerance` of the point (nearest wins), or null. */
export function nearestQuadCorner(
  quad: readonly CropPoint[],
  point: CropPoint,
  tolerance: number,
): number | null {
  let best: number | null = null,
    bestDistance = tolerance;
  quad.forEach((corner, index) => {
    const distance = Math.hypot(corner.x - point.x, corner.y - point.y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
