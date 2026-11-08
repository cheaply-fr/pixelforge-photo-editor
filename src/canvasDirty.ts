/**
 * Dirty-rectangle tracking for paint gesture buffers
 * (docs/tiled-layer-assets-contract.md, "Dirty-rectangle hints").
 *
 * A gesture starts tracking its buffer right after drawing the layer's stored
 * pixels into it. Every pixel write the gesture's tools make to a tracked
 * canvas reports its rectangle here (`noteCanvasWrite`), and the commit asks
 * for the union. Writes to untracked canvases are ignored, so the helpers can
 * be called unconditionally from shared stamp code. Pure: no DOM access.
 */

export type DirtyBox = { x: number; y: number; w: number; h: number };

type Tracker = { box: DirtyBox | null; invalid: boolean };
const trackers = new WeakMap<object, Tracker>();

/** Smallest box containing both (either may be null = empty). */
export function unionDirtyBox(a: DirtyBox | null, b: DirtyBox | null): DirtyBox | null {
  if (!a) return b && { ...b };
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Start (or restart) tracking writes to `canvas`, with nothing dirty yet. */
export function trackCanvasWrites(canvas: object): void {
  trackers.set(canvas, { box: null, invalid: false });
}

/** Stop tracking `canvas`; later writes are not recorded. */
export function untrackCanvasWrites(canvas: object): void {
  trackers.delete(canvas);
}

/**
 * Record that `w × h` pixels at `(x, y)` of `canvas` may have changed. A
 * non-finite or negative rectangle marks the canvas as unknown (the commit
 * then scans the whole layer).
 */
export function noteCanvasWrite(canvas: object, x: number, y: number, w: number, h: number): void {
  const tracker = trackers.get(canvas);
  if (!tracker || tracker.invalid) return;
  if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
    tracker.invalid = true;
    return;
  }
  if (w === 0 || h === 0) return;
  const left = Math.floor(x),
    top = Math.floor(y);
  tracker.box = unionDirtyBox(tracker.box, {
    x: left,
    y: top,
    w: Math.ceil(x + w) - left,
    h: Math.ceil(y + h) - top,
  });
}

/** Mark a tracked canvas as changed in unknown places (full-layer commit). */
export function noteCanvasWriteUnknown(canvas: object): void {
  const tracker = trackers.get(canvas);
  if (tracker) tracker.invalid = true;
}

/**
 * The union of writes since tracking started: `undefined` when the canvas is
 * not tracked or a write was unknown (callers must scan everything), `null`
 * when nothing was written, otherwise the dirty box.
 */
export function canvasDirtyBox(canvas: object): DirtyBox | null | undefined {
  const tracker = trackers.get(canvas);
  if (!tracker || tracker.invalid) return undefined;
  return tracker.box && { ...tracker.box };
}
