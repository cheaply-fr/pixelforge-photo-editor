/**
 * Selection outline ("marching ants") geometry.
 *
 * The editor stores selections as geometry, masks, feathers, inversions and
 * transforms; the only representation shared by all of them is the rendered
 * frame-space alpha plane. This module turns that plane into a compact SVG
 * path tracing the boundary between pixels at or above `threshold` (50 % alpha
 * by default, so feathered edges sit where coverage crosses one half) and
 * pixels below it. Boundary edges are merged into maximal horizontal and
 * vertical runs, so a rectangle costs four segments and an ellipse a few
 * hundred, independent of image size.
 *
 * The scan is O(width × height) over typed arrays and runs once per selection
 * change, never per frame: the animation is a CSS dash offset on the path.
 * Very busy masks (noise-like magic wand results) are traced on a coarser
 * grid so the path stays bounded.
 */

export type SelectionOutline = {
  /** SVG path data in frame pixel coordinates ("M x y H x2" / "M x y V y2" runs). */
  path: string;
  /** Number of merged boundary runs in `path`. */
  segments: number;
  /** Grid cell edge used for tracing (1 = exact pixel boundary). */
  step: number;
  /** True when no pixel reaches the threshold (nothing is selected). */
  empty: boolean;
  /** True when every pixel reaches the threshold (outline is the canvas edge). */
  full: boolean;
};

/** Upper bound on merged runs before tracing on a coarser grid. */
export const SELECTION_OUTLINE_MAX_SEGMENTS = 60000;
/** Default coverage cut: a feathered edge is outlined where it crosses 50 %. */
export const SELECTION_OUTLINE_THRESHOLD = 128;

const EMPTY: SelectionOutline = { path: '', segments: 0, step: 1, empty: true, full: false };

/**
 * Binary coverage on a `step`-pixel grid; a cell is inside when its centre
 * pixel is. `first`/`last` hold each grid row's first and last inside column
 * (`columns` and -1 for an empty row) so tracing can skip empty spans.
 */
function binaryGrid(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  threshold: number,
  step: number,
) {
  const columns = Math.ceil(width / step),
    rows = Math.ceil(height / step),
    grid = new Uint8Array(columns * rows),
    first = new Int32Array(rows).fill(columns),
    last = new Int32Array(rows).fill(-1),
    half = step >> 1;
  let inside = 0;
  for (let row = 0; row < rows; row += 1) {
    const source = Math.min(height - 1, row * step + half) * width, target = row * columns;
    let low = columns, high = -1;
    for (let column = 0; column < columns; column += 1) {
      const x = step === 1 ? column : Math.min(width - 1, column * step + half);
      if (alpha[source + x] >= threshold) {
        grid[target + column] = 1;
        inside += 1;
        if (low > column) low = column;
        high = column;
      }
    }
    first[row] = low;
    last[row] = high;
  }
  return { grid, columns, rows, inside, first, last };
}

type Grid = ReturnType<typeof binaryGrid>;

/**
 * Merged boundary runs: every horizontal run (row by row), then every
 * vertical run (column by column). Both directions are found in row-major
 * sweeps limited to each row's inside span, so large mostly-empty planes are
 * cheap; vertical runs are kept per column to preserve the column-by-column
 * path order. Null once the total exceeds `limit`.
 */
function traceGrid(
  { grid, columns, rows, first, last }: Grid,
  step: number,
  width: number,
  height: number,
  limit: number,
) {
  const parts: string[] = [];
  const px = (column: number) => Math.min(width, column * step);
  const py = (row: number) => Math.min(height, row * step);
  const low = (row: number) => (row >= 0 && row < rows ? first[row] : columns);
  const high = (row: number) => (row >= 0 && row < rows ? last[row] : -1);
  // Horizontal boundaries lie between grid rows row-1 and row; outside both
  // rows' inside spans the cells match, so there is no edge.
  for (let row = 0; row <= rows; row += 1) {
    const above = (row - 1) * columns, below = row * columns, hasAbove = row > 0, hasBelow = row < rows;
    const from = Math.min(low(row - 1), low(row)), to = Math.max(high(row - 1), high(row)) + 1;
    let start = -1;
    for (let column = from; column <= to; column += 1) {
      const edge = column < columns &&
        (hasAbove ? grid[above + column] : 0) !== (hasBelow ? grid[below + column] : 0);
      if (edge && start < 0) start = column;
      else if (!edge && start >= 0) {
        parts.push(`M${px(start)} ${py(row)}H${px(column)}`);
        if (parts.length > limit) return null;
        start = -1;
      }
    }
  }
  // Vertical boundaries lie between grid columns column-1 and column. A row
  // has edges only within [first, last + 1]; runs still open from the row
  // above lie within its span, so visiting both spans closes them.
  const vertical: string[][] = [], starts = new Int32Array(columns + 1).fill(-1);
  for (let column = 0; column <= columns; column += 1) vertical.push([]);
  let count = parts.length;
  for (let row = 0; row <= rows; row += 1) {
    const base = row * columns, inRows = row < rows;
    const from = Math.min(low(row - 1), low(row)), to = Math.min(columns, Math.max(high(row - 1), high(row)) + 1);
    for (let column = from; column <= to; column += 1) {
      const edge = inRows &&
        (column > 0 ? grid[base + column - 1] : 0) !== (column < columns ? grid[base + column] : 0);
      const start = starts[column];
      if (edge && start < 0) starts[column] = row;
      else if (!edge && start >= 0) {
        vertical[column].push(`M${px(column)} ${py(start)}V${py(row)}`);
        count += 1;
        if (count > limit) return null;
        starts[column] = -1;
      }
    }
  }
  for (const runs of vertical) for (const run of runs) parts.push(run);
  return parts;
}

/**
 * Trace the outline of a frame-space selection alpha plane. `alpha` holds one
 * coverage byte per pixel (row-major, `width × height`).
 */
export function selectionOutline(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  options: { threshold?: number; maxSegments?: number } = {},
): SelectionOutline {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Selection outline dimensions are invalid');
  if (alpha.length < width * height) throw new Error('Selection outline plane is too small');
  const threshold = Math.max(1, Math.min(255, Math.round(options.threshold ?? SELECTION_OUTLINE_THRESHOLD)));
  const limit = Math.max(4, Math.floor(options.maxSegments ?? SELECTION_OUTLINE_MAX_SEGMENTS));
  for (let step = 1; ; step *= 2) {
    const coverage = binaryGrid(alpha, width, height, threshold, step),
      { columns, rows, inside } = coverage;
    if (inside === 0) return { ...EMPTY, step };
    const parts = traceGrid(coverage, step, width, height, limit);
    // A 1×1 grid always fits, so the loop terminates.
    if (parts || (columns <= 1 && rows <= 1))
      return {
        path: (parts ?? []).join(''),
        segments: parts?.length ?? 0,
        step,
        empty: false,
        full: inside === columns * rows,
      };
  }
}
