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

/** Binary coverage on a `step`-pixel grid; a cell is inside when its centre pixel is. */
function binaryGrid(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  threshold: number,
  step: number,
) {
  const columns = Math.ceil(width / step),
    rows = Math.ceil(height / step),
    grid = new Uint8Array(columns * rows);
  let inside = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, row * step + (step >> 1));
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, column * step + (step >> 1));
      if (Number(alpha[y * width + x]) >= threshold) {
        grid[row * columns + column] = 1;
        inside += 1;
      }
    }
  }
  return { grid, columns, rows, inside };
}

function traceGrid(
  grid: Uint8Array,
  columns: number,
  rows: number,
  step: number,
  width: number,
  height: number,
  limit: number,
) {
  const parts: string[] = [];
  const at = (column: number, row: number) =>
    column >= 0 && row >= 0 && column < columns && row < rows ? grid[row * columns + column] : 0;
  const px = (column: number) => Math.min(width, column * step);
  const py = (row: number) => Math.min(height, row * step);
  // Horizontal boundaries lie between grid rows row-1 and row.
  for (let row = 0; row <= rows; row += 1) {
    let start = -1;
    for (let column = 0; column <= columns; column += 1) {
      const edge = column < columns && at(column, row - 1) !== at(column, row);
      if (edge && start < 0) start = column;
      else if (!edge && start >= 0) {
        parts.push(`M${px(start)} ${py(row)}H${px(column)}`);
        if (parts.length > limit) return null;
        start = -1;
      }
    }
  }
  // Vertical boundaries lie between grid columns column-1 and column.
  for (let column = 0; column <= columns; column += 1) {
    let start = -1;
    for (let row = 0; row <= rows; row += 1) {
      const edge = row < rows && at(column - 1, row) !== at(column, row);
      if (edge && start < 0) start = row;
      else if (!edge && start >= 0) {
        parts.push(`M${px(column)} ${py(start)}V${py(row)}`);
        if (parts.length > limit) return null;
        start = -1;
      }
    }
  }
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
    const { grid, columns, rows, inside } = binaryGrid(alpha, width, height, threshold, step);
    if (inside === 0) return { ...EMPTY, step };
    const parts = traceGrid(grid, columns, rows, step, width, height, limit);
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
