/**
 * Source-safe raster Perspective Warp helpers.
 *
 * The editable layer asset remains immutable; callers receive a fresh canvas
 * sized RGBA buffer and commit it through the normal history path. This is a
 * bounded local raster warp, not a mesh or content-aware perspective solver.
 */

import {
  mapPerspectivePoint,
  perspectiveMatrixFromQuad,
  type CropQuad,
  type PerspectiveMatrix,
} from './cropTools.ts';

export type PerspectiveWarpPlan = {
  width: number;
  height: number;
  quad: CropQuad;
  /** Maps source rectangle points into the target quad. */
  targetFromSource: PerspectiveMatrix;
  /** Maps output canvas points back into source rectangle points. */
  sourceFromTarget: PerspectiveMatrix;
};

function invertProjective(matrix: PerspectiveMatrix): PerspectiveMatrix {
  const [a, b, c, d, e, f, g, h] = matrix;
  const determinant = a * (e - f * h) - b * (d - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9)
    throw new Error('Perspective warp matrix is singular');
  const scale = a * e - b * d;
  if (Math.abs(scale) < 1e-9) throw new Error('Perspective warp inverse is unrepresentable');
  return [
    (e - f * h) / scale,
    (c * h - b) / scale,
    (b * f - c * e) / scale,
    (f * g - d) / scale,
    (a - c * g) / scale,
    (c * d - a * f) / scale,
    (d * h - e * g) / scale,
    (b * g - a * h) / scale,
  ];
}

export function planPerspectiveWarp(
  width: number,
  height: number,
  quad: CropQuad,
): PerspectiveWarpPlan {
  const targetFromSource = perspectiveMatrixFromQuad(quad, width, height);
  return {
    width,
    height,
    quad,
    targetFromSource,
    sourceFromTarget: invertProjective(targetFromSource),
  };
}

function validSourcePoint(x: number, y: number, width: number, height: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= width - 1 && y <= height - 1;
}

/** Warp a source-sized RGBA buffer into a new source-sized canvas. */
export function warpPerspectiveRgba(
  source: ArrayLike<number>,
  width: number,
  height: number,
  plan: PerspectiveWarpPlan,
): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      source.length !== width * height * 4 || plan.width !== width || plan.height !== height)
    throw new Error('Perspective warp dimensions or source buffer are invalid');
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = mapPerspectivePoint(plan.sourceFromTarget, { x, y });
      const destination = (y * width + x) * 4;
      if (!validSourcePoint(point.x, point.y, width, height)) continue;
      const sourceX = Math.max(0, Math.min(width - 1, Math.round(point.x)));
      const sourceY = Math.max(0, Math.min(height - 1, Math.round(point.y)));
      const origin = (sourceY * width + sourceX) * 4;
      output[destination] = source[origin];
      output[destination + 1] = source[origin + 1];
      output[destination + 2] = source[origin + 2];
      output[destination + 3] = source[origin + 3];
    }
  }
  return output;
}
