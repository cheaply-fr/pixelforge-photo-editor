/**
 * Edit > Stroke Selection… (docs/stroke-selection-contract.md).
 *
 * The stroke follows the selection edge the marching ants show: where the
 * rendered coverage crosses 50 %. That makes Lasso, feathered and compound
 * (Add/Subtract/Intersect, mask-based) selections behave the same way, since
 * all of them resolve to one alpha plane first. The band is measured with an
 * exact Euclidean distance transform, so a 12 px stroke is 12 px wide on
 * curves and diagonals as well as on straight edges, and its edges are
 * antialiased over one pixel.
 *
 * This is a bounded local raster stroke, not an editable vector stroke.
 */
import { NATIVE_CANVAS_BLEND_MODES, type LayerBlendMode } from './blendModes.ts';

export const STROKE_POSITIONS = [
  { value: 'inside', label: 'Inside' },
  { value: 'center', label: 'Center' },
  { value: 'outside', label: 'Outside' },
] as const;
export type StrokePosition = (typeof STROKE_POSITIONS)[number]['value'];

export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 250;

export type StrokeSelectionOptions = {
  /** Stroke width in layer pixels, 1–250. */
  width: number;
  /** #rrggbb */
  color: string;
  position: StrokePosition;
  /** Percent, 1–100. */
  opacity: number;
  /** A blend mode the Canvas 2D compositor implements natively. */
  mode: LayerBlendMode;
};

export const DEFAULT_STROKE_SELECTION: Omit<StrokeSelectionOptions, 'color'> = {
  width: 4,
  position: 'center',
  opacity: 100,
  mode: 'source-over',
};

const HEX = /^#[0-9a-f]{6}$/i;

const number = (value: number | string) =>
  typeof value === 'number' ? value : String(value).trim() === '' ? Number.NaN : Number(String(value).trim().replace(',', '.'));

/**
 * Validate dialog input. Width accepts 0.5 px steps (1–250); opacity whole
 * percents 1–100. Returns null for anything the stroke cannot apply exactly.
 */
export function normalizeStrokeSelectionOptions(value: {
  width: number | string;
  color: string;
  position: string;
  opacity: number | string;
  mode: string;
}): StrokeSelectionOptions | null {
  const width = number(value.width), opacity = number(value.opacity);
  const position = STROKE_POSITIONS.find((item) => item.value === value.position)?.value;
  if (
    !Number.isFinite(width) ||
    width < MIN_STROKE_WIDTH ||
    width > MAX_STROKE_WIDTH ||
    Math.round(width * 2) !== width * 2 ||
    !Number.isInteger(opacity) ||
    opacity < 1 ||
    opacity > 100 ||
    !position ||
    !HEX.test(value.color) ||
    !NATIVE_CANVAS_BLEND_MODES.has(value.mode as LayerBlendMode)
  )
    return null;
  return { width, color: value.color.toLowerCase(), position, opacity, mode: value.mode as LayerBlendMode };
}

/** Coverage at or above this counts as selected (the marching-ants cut). */
export const STROKE_EDGE_THRESHOLD = 128;
const INF = 1e20;

/**
 * Felzenszwalb–Huttenlocher 1-D squared distance transform of `f` (length
 * `n`, read and written with `stride` from `start`). `v`, `z` and `d` are
 * scratch arrays of at least n, n + 1 and n entries.
 */
function edt1d(
  grid: Float64Array,
  start: number,
  stride: number,
  n: number,
  v: Int32Array,
  z: Float64Array,
  d: Float64Array,
) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q += 1) {
    const fq = grid[start + q * stride];
    let s: number;
    // Drop parabolas the new one hides; z[0] = -Infinity stops at k = 0.
    for (;;) {
      const p = v[k], fp = grid[start + p * stride];
      s = (fq + q * q - (fp + p * p)) / (2 * (q - p));
      if (s <= z[k]) k -= 1;
      else break;
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1] < q) k += 1;
    const p = v[k];
    d[q] = (q - p) * (q - p) + grid[start + p * stride];
  }
  for (let q = 0; q < n; q += 1) grid[start + q * stride] = d[q];
}

/**
 * Squared Euclidean distance from every cell to the nearest cell whose
 * `cells` value equals `target`, on a `width × height` grid.
 */
export function squaredDistanceTransform(
  cells: Uint8Array,
  target: 0 | 1,
  width: number,
  height: number,
): Float64Array {
  if (cells.length < width * height) throw new Error('Distance grid is too small');
  const grid = new Float64Array(width * height);
  for (let index = 0; index < grid.length; index += 1) grid[index] = cells[index] === target ? 0 : INF;
  const longest = Math.max(width, height),
    v = new Int32Array(longest),
    z = new Float64Array(longest + 1),
    d = new Float64Array(longest);
  for (let row = 0; row < height; row += 1) edt1d(grid, row * width, 1, width, v, z, d);
  // Columns run on a transposed copy so both passes read memory in order.
  const transposed = new Float64Array(width * height);
  for (let row = 0; row < height; row += 1)
    for (let column = 0; column < width; column += 1) transposed[column * height + row] = grid[row * width + column];
  for (let column = 0; column < width; column += 1) edt1d(transposed, column * height, 1, height, v, z, d);
  for (let column = 0; column < width; column += 1)
    for (let row = 0; row < height; row += 1) grid[row * width + column] = transposed[column * height + row];
  return grid;
}

export type StrokeBounds = { x: number; y: number; w: number; h: number };

/**
 * The stroke band as one coverage byte per pixel (0–255) for a selection
 * alpha plane of `width × height` (layer pixels). Pixels beyond the plane
 * count as unselected, so a selection touching the canvas edge is stroked
 * along it (Select All + Inside draws a frame).
 *
 * Signed distance s (pixels, positive inside) is measured from the 50 %
 * edge, which lies half a pixel from the nearest pixel centre across it.
 * Inside strokes cover 0 ≤ s ≤ width, Outside −width ≤ s ≤ 0 and Center
 * |s| ≤ width / 2; coverage ramps over one pixel at both band edges.
 */
export function strokeSelectionAlpha(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  strokeWidth: number,
  position: StrokePosition,
): { coverage: Uint8ClampedArray; bounds: StrokeBounds | null } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Stroke plane dimensions are invalid');
  if (alpha.length < width * height) throw new Error('Stroke plane is too small');
  if (!(strokeWidth >= MIN_STROKE_WIDTH && strokeWidth <= MAX_STROKE_WIDTH))
    throw new Error('Stroke width is out of range');
  const coverage = new Uint8ClampedArray(width * height);
  // Covered bounding box at the 50 % cut.
  let left = width, right = -1, top = height, bottom = -1;
  for (let row = 0; row < height; row += 1) {
    const offset = row * width;
    let first = -1, last = -1;
    for (let column = 0; column < width; column += 1)
      if (alpha[offset + column] >= STROKE_EDGE_THRESHOLD) {
        first = column;
        break;
      }
    if (first < 0) continue;
    for (let column = width - 1; column >= first; column -= 1)
      if (alpha[offset + column] >= STROKE_EDGE_THRESHOLD) {
        last = column;
        break;
      }
    if (first < left) left = first;
    if (last > right) right = last;
    if (row < top) top = row;
    bottom = row;
  }
  if (right < 0) return { coverage, bounds: null };
  const reachOut = position === 'inside' ? 1 : Math.ceil(position === 'outside' ? strokeWidth : strokeWidth / 2) + 2;
  // Work grid: the covered box grown by the outward reach plus one guard cell
  // of "unselected" on every side (this is what makes canvas-edge strokes).
  const x0 = left - reachOut - 1, y0 = top - reachOut - 1,
    gw = right - left + 1 + 2 * (reachOut + 1), gh = bottom - top + 1 + 2 * (reachOut + 1);
  const selected = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    const y = y0 + gy;
    if (y < 0 || y >= height) continue;
    for (let gx = 0; gx < gw; gx += 1) {
      const x = x0 + gx;
      if (x >= 0 && x < width && alpha[y * width + x] >= STROKE_EDGE_THRESHOLD) selected[gy * gw + gx] = 1;
    }
  }
  // An Inside band never reaches unselected pixels and an Outside band never
  // reaches selected ones, so each needs only one of the two transforms.
  const toOutside = position === 'outside' ? undefined : squaredDistanceTransform(selected, 0, gw, gh),
    toInside = position === 'inside' ? undefined : squaredDistanceTransform(selected, 1, gw, gh);
  const half = strokeWidth / 2,
    [low, high] = position === 'inside' ? [0, strokeWidth] : position === 'outside' ? [-strokeWidth, 0] : [-half, half];
  // Cells deeper than the band (plus its 1 px ramp) are skipped before sqrt.
  const insideLimit = (Math.max(0, high) + 1.5) ** 2,
    outsideLimit = (Math.max(0, -low) + 1.5) ** 2;
  let bl = width, br = -1, bt = height, bb = -1;
  for (let gy = 0; gy < gh; gy += 1) {
    const y = y0 + gy;
    if (y < 0 || y >= height) continue;
    for (let gx = 0; gx < gw; gx += 1) {
      const x = x0 + gx;
      if (x < 0 || x >= width) continue;
      const cell = gy * gw + gx,
        inside = selected[cell] === 1;
      if (inside ? !toOutside || toOutside[cell] > insideLimit : !toInside || toInside[cell] > outsideLimit) continue;
      const s = inside ? Math.sqrt(toOutside![cell]) - 0.5 : 0.5 - Math.sqrt(toInside![cell]);
      // Distance of the pixel centre into the band, clamped to a 1 px ramp.
      const depth = Math.min(s - low, high - s) + 0.5;
      if (depth <= 0) continue;
      const value = Math.round(Math.min(1, depth) * 255);
      if (!value) continue;
      coverage[y * width + x] = value;
      if (x < bl) bl = x;
      if (x > br) br = x;
      if (y < bt) bt = y;
      if (y > bb) bb = y;
    }
  }
  return { coverage, bounds: br < 0 ? null : { x: bl, y: bt, w: br - bl + 1, h: bb - bt + 1 } };
}

/** #rrggbb to [r, g, b]. */
export function hexRgb(color: string): [number, number, number] {
  if (!HEX.test(color)) throw new Error('Stroke color must be a six-digit hex color');
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
}
