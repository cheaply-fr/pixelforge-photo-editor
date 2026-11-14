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

/** Shown when an Outside stroke's whole band falls beyond the canvas. */
export const STROKE_OUTSIDE_NOTHING_NOTICE =
  'Nothing to stroke: an Outside stroke of a selection that fills the canvas lies entirely beyond the canvas edge';

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

type StrokePlane = {
  selected: Uint8Array;
  gw: number;
  gh: number;
  x0: number;
  y0: number;
  low: number;
  high: number;
};

/** Validate input and build the work grid; null when nothing is selected. */
function strokePlane(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  strokeWidth: number,
  position: StrokePosition,
): StrokePlane | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Stroke plane dimensions are invalid');
  if (alpha.length < width * height) throw new Error('Stroke plane is too small');
  if (!(strokeWidth >= MIN_STROKE_WIDTH && strokeWidth <= MAX_STROKE_WIDTH))
    throw new Error('Stroke width is out of range');
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
  if (right < 0) return null;
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
  const half = strokeWidth / 2,
    [low, high] = position === 'inside' ? [0, strokeWidth] : position === 'outside' ? [-strokeWidth, 0] : [-half, half];
  return { selected, gw, gh, x0, y0, low, high };
}

type StrokeWriter = {
  needOutside: boolean;
  needInside: boolean;
  /** Squared distance beyond which no cell gets coverage. */
  reach: number;
  write: (gx: number, gy: number, inside: boolean, toOutside: number, toInside: number) => void;
  result: () => { coverage: Uint8ClampedArray; bounds: StrokeBounds | null };
};

/**
 * Coverage writer shared by the tiled and reference paths. `write` takes the
 * squared distances to the nearest unselected / selected cell, which must be
 * exact at least up to `reach`.
 */
function strokeWriter(plane: StrokePlane, width: number, height: number, position: StrokePosition): StrokeWriter {
  const { low, high, x0, y0 } = plane;
  const coverage = new Uint8ClampedArray(width * height);
  const needOutside = position !== 'outside', needInside = position !== 'inside';
  // Cells deeper than the band (plus its 1 px ramp) are skipped before sqrt.
  const insideLimit = (Math.max(0, high) + 1.5) ** 2,
    outsideLimit = (Math.max(0, -low) + 1.5) ** 2;
  let bl = width, br = -1, bt = height, bb = -1;
  return {
    needOutside,
    needInside,
    reach: Math.max(needOutside ? insideLimit : 0, needInside ? outsideLimit : 0),
    write(gx, gy, inside, toOutside, toInside) {
      if (inside ? !needOutside || toOutside > insideLimit : !needInside || toInside > outsideLimit) return;
      const x = x0 + gx, y = y0 + gy;
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const s = inside ? Math.sqrt(toOutside) - 0.5 : 0.5 - Math.sqrt(toInside);
      // Distance of the pixel centre into the band, clamped to a 1 px ramp.
      const depth = Math.min(s - low, high - s) + 0.5;
      if (depth <= 0) return;
      const value = Math.round(Math.min(1, depth) * 255);
      if (!value) return;
      coverage[y * width + x] = value;
      if (x < bl) bl = x;
      if (x > br) br = x;
      if (y < bt) bt = y;
      if (y > bb) bb = y;
    },
    result: () => ({ coverage, bounds: br < 0 ? null : { x: bl, y: bt, w: br - bl + 1, h: bb - bt + 1 } }),
  };
}

/** Smallest tile the band search walks; tiles far from any edge are skipped. */
const STROKE_TILE = 64;

/** One distance transform per needed side over the whole work grid. */
function writeWholeGrid(plane: StrokePlane, writer: StrokeWriter) {
  const { selected, gw, gh } = plane;
  // An Inside band never reaches unselected pixels and an Outside band never
  // reaches selected ones, so each needs only one of the two transforms.
  const toOutside = writer.needOutside ? squaredDistanceTransform(selected, 0, gw, gh) : undefined,
    toInside = writer.needInside ? squaredDistanceTransform(selected, 1, gw, gh) : undefined;
  for (let gy = 0; gy < gh; gy += 1)
    for (let gx = 0; gx < gw; gx += 1) {
      const cell = gy * gw + gx;
      writer.write(gx, gy, selected[cell] === 1, toOutside ? toOutside[cell] : INF, toInside ? toInside[cell] : INF);
    }
}

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
 *
 * Only cells near the selection edge can be stroked, so the work grid is cut
 * into tiles (64 px, or twice the band's reach when that is larger). A tile
 * whose neighbourhood (the tile grown by the reach) is all selected or all
 * unselected is skipped; the others get an exact distance transform over that
 * neighbourhood alone, unless those neighbourhoods add up to more than the
 * whole grid, when the grid is transformed once instead. A cell whose
 * nearest edge lies within the reach finds it inside its tile's
 * neighbourhood, so the result is byte-identical to transforming the whole
 * grid (`strokeSelectionAlphaReference`).
 */
export function strokeSelectionAlpha(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  strokeWidth: number,
  position: StrokePosition,
): { coverage: Uint8ClampedArray; bounds: StrokeBounds | null } {
  const plane = strokePlane(alpha, width, height, strokeWidth, position);
  if (!plane) return { coverage: new Uint8ClampedArray(width * height), bounds: null };
  const { selected, gw, gh } = plane;
  const writer = strokeWriter(plane, width, height, position);
  const margin = Math.ceil(Math.sqrt(writer.reach)) + 1;
  const tile = Math.max(STROKE_TILE, 2 * margin);
  const tw = Math.ceil(gw / tile), th = Math.ceil(gh / tile);
  // Selected cells per 16 px block, to find tiles with no edge nearby.
  const BLOCK = 16;
  const bw = Math.ceil(gw / BLOCK), bh = Math.ceil(gh / BLOCK);
  const counts = new Int32Array(bw * bh);
  for (let gy = 0; gy < gh; gy += 1) {
    const rowBlocks = Math.floor(gy / BLOCK) * bw, offset = gy * gw;
    for (let bx = 0; bx < bw; bx += 1) {
      let count = 0;
      const end = Math.min(gw, (bx + 1) * BLOCK);
      for (let gx = bx * BLOCK; gx < end; gx += 1) count += selected[offset + gx];
      counts[rowBlocks + bx] += count;
    }
  }
  const blockCells = (bx: number, by: number) =>
    (Math.min(gw, (bx + 1) * BLOCK) - bx * BLOCK) * (Math.min(gh, (by + 1) * BLOCK) - by * BLOCK);
  type Window = { cx0: number; cy0: number; cx1: number; cy1: number; wx0: number; wy0: number; wx1: number; wy1: number };
  const windows: Window[] = [];
  let work = 0;
  for (let ty = 0; ty < th; ty += 1) {
    for (let tx = 0; tx < tw; tx += 1) {
      const cx0 = tx * tile, cy0 = ty * tile,
        cx1 = Math.min(gw, cx0 + tile), cy1 = Math.min(gh, cy0 + tile);
      const wx0 = Math.max(0, cx0 - margin), wy0 = Math.max(0, cy0 - margin),
        wx1 = Math.min(gw, cx1 + margin), wy1 = Math.min(gh, cy1 + margin);
      // The blocks covering the neighbourhood: all selected or all
      // unselected means no cell of this tile is within reach of an edge.
      let sum = 0, total = 0;
      for (let y = Math.floor(wy0 / BLOCK); y <= Math.floor((wy1 - 1) / BLOCK); y += 1)
        for (let x = Math.floor(wx0 / BLOCK); x <= Math.floor((wx1 - 1) / BLOCK); x += 1) {
          sum += counts[y * bw + x];
          total += blockCells(x, y);
        }
      if (sum === 0 || sum === total) continue;
      windows.push({ cx0, cy0, cx1, cy1, wx0, wy0, wx1, wy1 });
      work += (wx1 - wx0) * (wy1 - wy0);
    }
  }
  if (work > gw * gh) {
    writeWholeGrid(plane, writer);
    return writer.result();
  }
  let neighbourhood = new Uint8Array(0);
  for (const { cx0, cy0, cx1, cy1, wx0, wy0, wx1, wy1 } of windows) {
    const ww = wx1 - wx0, wh = wy1 - wy0;
    if (neighbourhood.length < ww * wh) neighbourhood = new Uint8Array(ww * wh);
    for (let y = 0; y < wh; y += 1)
      neighbourhood.set(selected.subarray((wy0 + y) * gw + wx0, (wy0 + y) * gw + wx1), y * ww);
    const toOutside = writer.needOutside ? squaredDistanceTransform(neighbourhood, 0, ww, wh) : undefined,
      toInside = writer.needInside ? squaredDistanceTransform(neighbourhood, 1, ww, wh) : undefined;
    for (let gy = cy0; gy < cy1; gy += 1)
      for (let gx = cx0; gx < cx1; gx += 1) {
        const local = (gy - wy0) * ww + (gx - wx0);
        writer.write(gx, gy, selected[gy * gw + gx] === 1, toOutside ? toOutside[local] : INF, toInside ? toInside[local] : INF);
      }
  }
  return writer.result();
}

/**
 * Reference implementation: one distance transform over the whole work grid.
 * `strokeSelectionAlpha` must match it byte for byte (tests compare them).
 */
export function strokeSelectionAlphaReference(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  strokeWidth: number,
  position: StrokePosition,
): { coverage: Uint8ClampedArray; bounds: StrokeBounds | null } {
  const plane = strokePlane(alpha, width, height, strokeWidth, position);
  if (!plane) return { coverage: new Uint8ClampedArray(width * height), bounds: null };
  const writer = strokeWriter(plane, width, height, position);
  writeWholeGrid(plane, writer);
  return writer.result();
}

/** #rrggbb to [r, g, b]. */
export function hexRgb(color: string): [number, number, number] {
  if (!HEX.test(color)) throw new Error('Stroke color must be a six-digit hex color');
  return [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)) as [number, number, number];
}
