/**
 * Windowed pixel access for pointer-driven retouch strokes.
 *
 * Dodge, Burn, Sponge, Smudge, Blur, Sharpen, the Mixer/History brushes,
 * Color Replacement and the Background Eraser run DOM-free kernels over RGBA
 * arrays. Feeding them the whole layer on every pointer move read, validated,
 * copied and wrote back the full layer (about 43 MB for a 2646 x 4096 layer)
 * per segment, which blocked the main thread for roughly half a second per
 * move on large documents. A segment can only change pixels within the brush
 * reach of its points, so each segment now runs on the bounding window of
 * those points plus the kernel's read margin. Pixels outside the window are
 * never read or written.
 *
 * Every helper here is DOM-free so the window plan and the windowed run can be
 * checked byte-for-byte against the full-layer kernels in Node tests.
 */
import type { PixelRect } from './selectionClip.ts';

export type { PixelRect };

type Point = { x: number; y: number };

/** Bounding rectangle of `points` grown by `reach`, clamped to the raster; null when outside. */
export function strokeWindow(
  points: readonly Point[],
  reach: number,
  width: number,
  height: number,
): PixelRect | null {
  if (!points.length || !Number.isFinite(reach) || reach < 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  const left = Math.max(0, Math.floor(minX - reach)),
    top = Math.max(0, Math.floor(minY - reach)),
    right = Math.min(width, Math.ceil(maxX + reach) + 1),
    bottom = Math.min(height, Math.ceil(maxY + reach) + 1);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

const safeSize = (size: number) => (Number.isFinite(size) ? Math.max(1, size) : 1);

/**
 * Window reach (layer pixels from a stroke point) per tool: the furthest pixel
 * the kernel can change plus the furthest pixel it reads around a changed one,
 * with a margin of two pixels for rounding. Larger is always safe; smaller is
 * not.
 */
export const strokeWindowReach = {
  /** Dodge, Burn and Sponge change pixels under the radial stamp only. */
  tonal: (size: number) => safeSize(size) / 2 + 2,
  /** Smudge also reads the source a quarter of the brush behind each pixel. */
  smudge: (size: number) => safeSize(size) / 2 + Math.ceil(Math.max(1, safeSize(size) * 0.25)) + 3,
  /** Blur and Sharpen average a neighbourhood of at most 4 px. */
  retouch: (size: number) => Math.max(0.5, safeSize(size) / 2) + 4 + 3,
  /** Mixer Brush and History Brush change and read pixels under the dab only. */
  mixer: (size: number) => safeSize(size) / 2 + 2,
  /** Art History Brush samples a dab colour up to `style` (<= 24) px around each point. */
  artHistory: (size: number, style: number) =>
    safeSize(size) / 2 + Math.max(1, Math.round(Number.isFinite(style) ? style : 24)) + 3,
  /** Color Replacement and the Background Eraser read and change pixels under the stamp only. */
  sampled: (size: number) => Math.max(1, safeSize(size) / 2) + 2,
} as const;

/** Copy the RGBA pixels of `rect` out of a full raster `width` pixels wide. */
export function cropRgba(pixels: ArrayLike<number>, width: number, rect: PixelRect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  const typed = pixels instanceof Uint8ClampedArray ? pixels : Uint8ClampedArray.from(pixels as ArrayLike<number>);
  for (let row = 0; row < rect.height; row += 1) {
    const start = ((rect.y + row) * width + rect.x) * 4;
    out.set(typed.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  return out;
}

/** Copy one alpha value per pixel of `rect` out of a full mask `width` pixels wide. */
export function cropAlpha(mask: ArrayLike<number>, width: number, rect: PixelRect): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height);
  for (let row = 0; row < rect.height; row += 1) {
    const start = (rect.y + row) * width + rect.x;
    for (let column = 0; column < rect.width; column += 1) out[row * rect.width + column] = mask[start + column];
  }
  return out;
}

/** Write window pixels back into a full raster `width` pixels wide (in place). */
export function pasteRgba(target: Uint8ClampedArray, width: number, rect: PixelRect, window: ArrayLike<number>): void {
  const typed = window instanceof Uint8ClampedArray ? window : Uint8ClampedArray.from(window as ArrayLike<number>);
  for (let row = 0; row < rect.height; row += 1)
    target.set(typed.subarray(row * rect.width * 4, (row + 1) * rect.width * 4), ((rect.y + row) * width + rect.x) * 4);
}

/** A point in window coordinates. */
export const windowPoint = <T extends Point>(point: T, rect: PixelRect): T => ({
  ...point,
  x: point.x - rect.x,
  y: point.y - rect.y,
});

/** Whether two equally long byte arrays differ. */
export function pixelsDiffer(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return true;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return true;
  return false;
}

/** The slice of a 2D context the windowed stroke needs (a canvas or a test double). */
export type WindowContext = {
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
  putImageData(image: never, x: number, y: number): void;
};
export type WindowCanvas = {
  width: number;
  height: number;
  getContext(type: '2d'): unknown;
};

export type StrokeWindowInput = {
  /** Window pixels of the stroke-start source, when the tool reads one. */
  source?: Uint8ClampedArray;
  /** Window pixels of the gesture buffer; kernels must not mutate them. */
  destination: Uint8ClampedArray;
  /** Selection coverage inside the window, when a selection confines the stroke. */
  selectionMask?: Uint8ClampedArray;
  rect: PixelRect;
  width: number;
  height: number;
};

/**
 * Run one stroke segment of a tool on the window `rect` of `destination`
 * (a canvas), reading `source` (a canvas or full-layer pixels) and the
 * selection mask only inside it. `apply` receives window-sized arrays and
 * must use window coordinates (see `windowPoint`). Returns whether any pixel
 * changed; unchanged windows are not written back.
 */
export function windowedCanvasStroke(
  destination: WindowCanvas,
  rect: PixelRect | null,
  apply: (input: StrokeWindowInput) => { pixels: Uint8ClampedArray; changed?: boolean },
  options: {
    source?: WindowCanvas | Uint8ClampedArray;
    selectionMask?: ArrayLike<number>;
    /** Tool name for the `pixelforge.stroke-window` diagnostics mark. */
    tool?: string;
  } = {},
): boolean {
  if (!rect) return false;
  const context = destination.getContext('2d') as WindowContext | null;
  if (!context) throw new Error('Stroke canvas context is unavailable');
  const image = context.getImageData(rect.x, rect.y, rect.width, rect.height),
    before = image.data;
  let source: Uint8ClampedArray | undefined;
  if (options.source instanceof Uint8ClampedArray) source = cropRgba(options.source, destination.width, rect);
  else if (options.source) {
    const sourceContext = options.source.getContext('2d') as WindowContext | null;
    if (!sourceContext) throw new Error('Stroke source context is unavailable');
    source = sourceContext.getImageData(rect.x, rect.y, rect.width, rect.height).data;
  }
  const result = apply({
    source,
    destination: before,
    selectionMask: options.selectionMask ? cropAlpha(options.selectionMask, destination.width, rect) : undefined,
    rect,
    width: rect.width,
    height: rect.height,
  });
  markStrokeWindow(options.tool, rect, destination.width * destination.height);
  const changed = result.changed ?? pixelsDiffer(result.pixels, before);
  if (!changed) return false;
  if (result.pixels !== before) before.set(result.pixels);
  context.putImageData(image as never, rect.x, rect.y);
  return true;
}

/**
 * Best-effort diagnostics: one `pixelforge.stroke-window` mark per segment
 * with the window and layer pixel counts, so tests and DevTools can confirm a
 * pointer move did not process the whole layer. The timeline keeps at most
 * the latest few hundred, so a long painting session cannot grow it.
 */
let strokeWindowMarks = 0;
function markStrokeWindow(tool: string | undefined, rect: PixelRect, layerPixels: number): void {
  try {
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    if (++strokeWindowMarks > 512 && typeof performance.clearMarks === 'function') {
      performance.clearMarks('pixelforge.stroke-window');
      strokeWindowMarks = 1;
    }
    performance.mark('pixelforge.stroke-window', {
        detail: { tool: tool ?? 'unknown', pixels: rect.width * rect.height, layerPixels },
      });
  } catch {
    // Diagnostics must never affect editing.
  }
}
