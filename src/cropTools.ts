/**
 * Pure geometry and raster helpers for the Crop/Slice tool family.
 *
 * The editor keeps source assets immutable. These helpers therefore return
 * serializable plans and fresh RGBA buffers; a UI command can apply a plan to
 * a document history frame without making a destructive edit while a user is
 * dragging.
 */

import type { MeasurementAnnotation } from './measurements.ts';

export type CropPoint = { x: number; y: number };
export type RectangularCropPlan = {
  left: number;
  top: number;
  width: number;
  height: number;
  changed: boolean;
};
export type CropQuad = [CropPoint, CropPoint, CropPoint, CropPoint];
export type PerspectiveMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type PerspectiveCropRequest = {
  quad: CropQuad;
  /** Output dimensions are optional; otherwise the quad's average edge lengths are used. */
  width?: number;
  height?: number;
};

export type PerspectiveCropPlan = {
  width: number;
  height: number;
  quad: CropQuad;
  /** Maps output-space points to source canvas points. */
  sourceFromOutput: PerspectiveMatrix;
  changed: boolean;
};

export type FrameFit = 'contain' | 'cover' | 'stretch';
export type FramePlacementRequest = {
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  fit?: FrameFit;
};
export type FramePlacement = {
  rect: { x: number; y: number; width: number; height: number };
  sourceRect: { x: number; y: number; width: number; height: number };
  matrix: [number, number, number, number, number, number];
  fit: FrameFit;
};

export type SliceRect = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type SlicePlan = {
  canvasWidth: number;
  canvasHeight: number;
  slices: SliceRect[];
};
export type SlicePixels = SliceRect & { pixels: Uint8ClampedArray };

const MAX_DIMENSION = 16000;
const MAX_PIXELS = 16_000_000;
const EPSILON = 1e-9;

function validDimension(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_DIMENSION;
}

function assertCanvas(width: number, height: number): void {
  if (!validDimension(width) || !validDimension(height) || width * height > MAX_PIXELS)
    throw new Error('Canvas dimensions must be whole values up to 16,000 pixels and 16 megapixels total');
}

/** Pixel-aligned rectangular bounds, clipped to the source canvas. */
export function planRectangularCrop(
  canvasWidth: number,
  canvasHeight: number,
  start: CropPoint,
  end: CropPoint,
): RectangularCropPlan {
  assertCanvas(canvasWidth, canvasHeight);
  if (!finitePoint(start) || !finitePoint(end)) throw new Error('Crop points must be finite');
  const left = Math.max(0, Math.floor(Math.min(start.x, end.x))),
    top = Math.max(0, Math.floor(Math.min(start.y, end.y))),
    right = Math.min(canvasWidth, Math.floor(Math.max(start.x, end.x))),
    bottom = Math.min(canvasHeight, Math.floor(Math.max(start.y, end.y)));
  if (right <= left || bottom <= top) throw new Error('Crop must contain at least one pixel inside the image');
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    changed: left !== 0 || top !== 0 || right !== canvasWidth || bottom !== canvasHeight,
  };
}

/**
 * Keep workspace annotations inside a cropped document. Point annotations
 * outside the retained area disappear from this frame, while undo retains
 * them in the source frame. Rulers are clipped to the retained rectangle and
 * their distance/angle is recalculated; source annotations are never mutated.
 */
export function cropMeasurements(
  annotations: readonly MeasurementAnnotation[] | undefined,
  plan: RectangularCropPlan,
): MeasurementAnnotation[] | undefined {
  if (!annotations) return undefined;
  const inside = (point: CropPoint) => point.x >= plan.left && point.y >= plan.top && point.x <= plan.left + plan.width && point.y <= plan.top + plan.height;
  const translate = (point: CropPoint) => ({ x: point.x - plan.left, y: point.y - plan.top });
  const output: MeasurementAnnotation[] = [];
  for (const annotation of annotations) {
    if (annotation.kind !== 'ruler') {
      if (inside(annotation)) output.push({ ...annotation, ...translate(annotation) });
      continue;
    }
    const dx = annotation.end.x - annotation.start.x,
      dy = annotation.end.y - annotation.start.y;
    let minimum = 0, maximum = 1, visible = true;
    for (const [p, q] of [
      [-dx, annotation.start.x - plan.left],
      [dx, plan.left + plan.width - annotation.start.x],
      [-dy, annotation.start.y - plan.top],
      [dy, plan.top + plan.height - annotation.start.y],
    ]) {
      if (p === 0) {
        if (q < 0) { visible = false; break; }
      } else {
        const ratio = q / p;
        if (p < 0) minimum = Math.max(minimum, ratio);
        else maximum = Math.min(maximum, ratio);
        if (minimum > maximum) { visible = false; break; }
      }
    }
    if (!visible) continue;
    const start = translate({ x: annotation.start.x + minimum * dx, y: annotation.start.y + minimum * dy }),
      end = translate({ x: annotation.start.x + maximum * dx, y: annotation.start.y + maximum * dy }),
      pixels = Math.hypot(end.x - start.x, end.y - start.y);
    if (pixels < 1) continue;
    output.push({ ...annotation, start, end, pixels, angle: Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI });
  }
  return output;
}

function finitePoint(point: unknown): point is CropPoint {
  if (!point || typeof point !== 'object') return false;
  const value = point as CropPoint;
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function cross(a: CropPoint, b: CropPoint, c: CropPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Validate a clockwise or counter-clockwise convex crop quadrilateral. */
export function validCropQuad(
  quad: unknown,
  canvasWidth?: number,
  canvasHeight?: number,
): quad is CropQuad {
  if (!Array.isArray(quad) || quad.length !== 4 || !quad.every(finitePoint)) return false;
  if (canvasWidth !== undefined && canvasHeight !== undefined) {
    if (!validDimension(canvasWidth) || !validDimension(canvasHeight)) return false;
    if (quad.some((point) => point.x < 0 || point.y < 0 || point.x > canvasWidth || point.y > canvasHeight)) return false;
  }
  const signs = quad.map((point, index) =>
    cross(point, quad[(index + 1) % 4], quad[(index + 2) % 4]),
  );
  if (signs.some((value) => Math.abs(value) < EPSILON)) return false;
  const orientation = Math.sign(signs[0]);
  if (signs.some((value) => Math.sign(value) !== orientation)) return false;
  // Shoelace area also rejects folded or duplicate points that can evade the
  // local convexity checks when coordinates are extremely close together.
  const area = quad.reduce(
    (sum, point, index) => sum + point.x * quad[(index + 1) % 4].y - point.y * quad[(index + 1) % 4].x,
    0,
  );
  return Math.abs(area) >= EPSILON;
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] {
  const n = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1)
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < EPSILON) throw new Error('Perspective crop corners are degenerate');
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let entry = column; entry <= n; entry += 1) augmented[column][entry] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (Math.abs(factor) < EPSILON) continue;
      for (let entry = column; entry <= n; entry += 1)
        augmented[row][entry] -= factor * augmented[column][entry];
    }
  }
  return augmented.map((row) => row[n]);
}

/** Build the output-to-source projective transform for four corner pairs. */
export function perspectiveMatrixFromQuad(
  quad: CropQuad,
  width: number,
  height: number,
): PerspectiveMatrix {
  if (!validCropQuad(quad) || !validDimension(width) || !validDimension(height))
    throw new Error('Perspective crop corners or output dimensions are invalid');
  const destination: CropPoint[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const coefficients: number[][] = [];
  const values: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const { x: u, y: v } = destination[index];
    const { x, y } = quad[index];
    coefficients.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    values.push(x);
    coefficients.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    values.push(y);
  }
  const result = solveLinearSystem(coefficients, values) as PerspectiveMatrix;
  if (!result.every(Number.isFinite)) throw new Error('Perspective crop transform is invalid');
  return result.map((value) => (Math.abs(value) < EPSILON ? 0 : value)) as PerspectiveMatrix;
}

export function mapPerspectivePoint(matrix: PerspectiveMatrix, point: CropPoint): CropPoint {
  if (!Array.isArray(matrix) || matrix.length !== 8 || !matrix.every(Number.isFinite))
    throw new Error('Perspective matrix is invalid');
  const denominator = matrix[6] * point.x + matrix[7] * point.y + 1;
  if (Math.abs(denominator) < EPSILON) throw new Error('Perspective matrix maps through infinity');
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator,
  };
}

function averageDistance(a: CropPoint, b: CropPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Plan a bounded perspective crop while leaving the source layer untouched. */
export function planPerspectiveCrop(
  canvasWidth: number,
  canvasHeight: number,
  request: PerspectiveCropRequest,
): PerspectiveCropPlan {
  assertCanvas(canvasWidth, canvasHeight);
  if (!validCropQuad(request.quad, canvasWidth, canvasHeight))
    throw new Error('Perspective crop must be a convex quadrilateral inside the canvas');
  const [topLeft, topRight, bottomRight, bottomLeft] = request.quad;
  const width = request.width ?? Math.max(1, Math.round((averageDistance(topLeft, topRight) + averageDistance(bottomLeft, bottomRight)) / 2));
  const height = request.height ?? Math.max(1, Math.round((averageDistance(topLeft, bottomLeft) + averageDistance(topRight, bottomRight)) / 2));
  if (!validDimension(width) || !validDimension(height) || width * height > MAX_PIXELS)
    throw new Error('Perspective crop output exceeds the supported image limits');
  const sourceFromOutput = perspectiveMatrixFromQuad(request.quad, width, height);
  const axisAligned =
    topLeft.x === 0 && topLeft.y === 0 && topRight.x === canvasWidth && topRight.y === 0 &&
    bottomRight.x === canvasWidth && bottomRight.y === canvasHeight && bottomLeft.x === 0 && bottomLeft.y === canvasHeight;
  return {
    width,
    height,
    quad: request.quad.map((point) => ({ ...point })) as CropQuad,
    sourceFromOutput,
    changed: !axisAligned || width !== canvasWidth || height !== canvasHeight,
  };
}

/** Apply a nearest-neighbour perspective crop to an RGBA source buffer. */
export function warpPerspectiveRgba(
  pixels: ArrayLike<number>,
  sourceWidth: number,
  sourceHeight: number,
  plan: PerspectiveCropPlan,
): Uint8ClampedArray {
  assertCanvas(sourceWidth, sourceHeight);
  if (pixels.length !== sourceWidth * sourceHeight * 4) throw new Error('Perspective source pixels have invalid length');
  if (!plan || !validDimension(plan.width) || !validDimension(plan.height)) throw new Error('Perspective crop plan is invalid');
  const output = new Uint8ClampedArray(plan.width * plan.height * 4);
  for (let y = 0; y < plan.height; y += 1) {
    for (let x = 0; x < plan.width; x += 1) {
      const source = mapPerspectivePoint(plan.sourceFromOutput, { x: x + 0.5, y: y + 0.5 });
      const sx = Math.max(0, Math.min(sourceWidth - 1, Math.floor(source.x)));
      const sy = Math.max(0, Math.min(sourceHeight - 1, Math.floor(source.y)));
      const from = (sy * sourceWidth + sx) * 4;
      output.set([pixels[from], pixels[from + 1], pixels[from + 2], pixels[from + 3]], (y * plan.width + x) * 4);
    }
  }
  return output;
}

/** Calculate a Frame-tool placement for a source image in a rectangular mask. */
export function planFramePlacement(request: FramePlacementRequest): FramePlacement {
  const values = [request.x, request.y, request.width, request.height, request.sourceWidth, request.sourceHeight];
  if (!values.every(Number.isFinite) || request.width <= 0 || request.height <= 0 || request.sourceWidth <= 0 || request.sourceHeight <= 0)
    throw new Error('Frame placement dimensions must be positive finite values');
  const fit = request.fit ?? 'cover';
  if (!['contain', 'cover', 'stretch'].includes(fit)) throw new Error('Frame fit is invalid');
  let sourceRect = { x: 0, y: 0, width: request.sourceWidth, height: request.sourceHeight };
  let scaleX = request.width / request.sourceWidth;
  let scaleY = request.height / request.sourceHeight;
  let offsetX = request.x;
  let offsetY = request.y;
  if (fit !== 'stretch') {
    const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    scaleX = scale;
    scaleY = scale;
    const visibleWidth = request.width / scale;
    const visibleHeight = request.height / scale;
    sourceRect = {
      x: (request.sourceWidth - visibleWidth) / 2,
      y: (request.sourceHeight - visibleHeight) / 2,
      width: visibleWidth,
      height: visibleHeight,
    };
    // Contain leaves transparent letterbox space; centre the source inside it.
    if (fit === 'contain') {
      sourceRect = { x: 0, y: 0, width: request.sourceWidth, height: request.sourceHeight };
      offsetX += (request.width - request.sourceWidth * scale) / 2;
      offsetY += (request.height - request.sourceHeight * scale) / 2;
    }
  }
  return {
    rect: { x: request.x, y: request.y, width: request.width, height: request.height },
    sourceRect,
    matrix: [scaleX, 0, 0, scaleY, offsetX - sourceRect.x * scaleX, offsetY - sourceRect.y * scaleY],
    fit,
  };
}

/** Build a canvas-sized alpha mask for a rectangular Frame placeholder. */
export function frameMask(
  canvasWidth: number,
  canvasHeight: number,
  rect: { x: number; y: number; width: number; height: number },
  radius = 0,
): Uint8ClampedArray {
  assertCanvas(canvasWidth, canvasHeight);
  if (![rect.x, rect.y, rect.width, rect.height, radius].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || radius < 0)
    throw new Error('Frame mask rectangle is invalid');
  const output = new Uint8ClampedArray(canvasWidth * canvasHeight);
  const r = Math.min(radius, rect.width / 2, rect.height / 2);
  for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(canvasHeight, Math.ceil(rect.y + rect.height)); y += 1) {
    for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(canvasWidth, Math.ceil(rect.x + rect.width)); x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const nearCornerX = px < rect.x + r ? rect.x + r : px > rect.x + rect.width - r ? rect.x + rect.width - r : px;
      const nearCornerY = py < rect.y + r ? rect.y + r : py > rect.y + rect.height - r ? rect.y + rect.height - r : py;
      if ((px - nearCornerX) ** 2 + (py - nearCornerY) ** 2 <= r ** 2 + EPSILON) output[y * canvasWidth + x] = 255;
    }
  }
  return output;
}

function safeSliceName(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return cleaned || fallback;
}

/** Validate and freeze a list of non-empty canvas slices for deterministic export. */
export function planSlices(canvasWidth: number, canvasHeight: number, slices: SliceRect[]): SlicePlan {
  assertCanvas(canvasWidth, canvasHeight);
  if (!Array.isArray(slices) || slices.length === 0 || slices.length > 256) throw new Error('Provide between 1 and 256 slices');
  const ids = new Set<string>();
  const normalized = slices.map((slice, index) => {
    if (!slice || typeof slice.id !== 'string' || ids.has(slice.id)) throw new Error('Slice ids must be non-empty and unique');
    ids.add(slice.id);
    if (![slice.x, slice.y, slice.width, slice.height].every(Number.isInteger) || slice.x < 0 || slice.y < 0 || slice.width < 1 || slice.height < 1 || slice.x + slice.width > canvasWidth || slice.y + slice.height > canvasHeight)
      throw new Error('Slice rectangles must be whole, non-empty and inside the canvas');
    return {
      id: slice.id,
      name: safeSliceName(slice.name, `slice-${index + 1}`),
      x: slice.x,
      y: slice.y,
      width: slice.width,
      height: slice.height,
    };
  });
  return { canvasWidth, canvasHeight, slices: normalized };
}

/** Extract each planned slice without modifying the source buffer. */
export function extractSlices(
  pixels: ArrayLike<number>,
  canvasWidth: number,
  canvasHeight: number,
  plan: SlicePlan,
): SlicePixels[] {
  assertCanvas(canvasWidth, canvasHeight);
  if (pixels.length !== canvasWidth * canvasHeight * 4) throw new Error('Slice source pixels have invalid length');
  if (!plan || plan.canvasWidth !== canvasWidth || plan.canvasHeight !== canvasHeight) throw new Error('Slice plan does not match source canvas');
  return plan.slices.map((slice) => {
    const output = new Uint8ClampedArray(slice.width * slice.height * 4);
    for (let row = 0; row < slice.height; row += 1) {
      const from = ((slice.y + row) * canvasWidth + slice.x) * 4;
      for (let column = 0; column < slice.width * 4; column += 1)
        output[row * slice.width * 4 + column] = pixels[from + column];
    }
    return { ...slice, pixels: output };
  });
}
