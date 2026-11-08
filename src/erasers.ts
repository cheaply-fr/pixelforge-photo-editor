/**
 * Deterministic Background Eraser and Magic Eraser primitives.
 *
 * The byte-array APIs deliberately return a fresh pixel buffer.  This keeps an
 * edit command undo-friendly: callers can retain the old asset and publish the
 * returned buffer as the next immutable asset.  Canvas wrappers are provided at
 * the bottom for the legacy in-place tool helpers used by the editor.
 */

import { radialCoverage } from './brush.ts';
import { strokeWindow, strokeWindowReach, windowedCanvasStroke } from './strokeWindow.ts';

export const ERASER_MAX_SIZE = 10000;
export const ERASER_MAX_DIMENSION = 16000;
export const ERASER_MAX_PIXELS = 16000000;

export type EraserColor = [number, number, number, number];
export type EraserBounds = { left: number; top: number; right: number; bottom: number };

export type MagicEraserOptions = {
  width: number;
  height: number;
  x: number;
  y: number;
  /** Maximum absolute channel distance for a matching pixel (0..255). */
  tolerance?: number;
  /** Connected 4-neighbour matching region; false removes every match. */
  contiguous?: boolean;
  /** Alpha removal amount, where 1 fully removes a match. */
  opacity?: number;
  /** Explicit sample color; omitted means the pixel at x/y. */
  target?: EraserColor;
};

export type BackgroundEraserOptions = {
  width: number;
  height: number;
  x: number;
  y: number;
  size: number;
  hardness?: number;
  tolerance?: number;
  opacity?: number;
  contiguous?: boolean;
  /** Explicit sample color; omitted means the pixel at x/y. */
  target?: EraserColor;
};

export type EraserResult = {
  /** A newly allocated RGBA buffer. The input buffer is never changed. */
  pixels: Uint8ClampedArray;
  /** A full-canvas alpha mask describing the requested removal amount. */
  mask: Uint8ClampedArray;
  changed: boolean;
  target: EraserColor;
  bounds: EraserBounds;
};

export type BackgroundEraserStrokeOptions = {
  width: number;
  height: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  tolerance?: number;
  opacity?: number;
  hardness?: number;
  target: EraserColor;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && width >= 1 && width <= ERASER_MAX_DIMENSION &&
    Number.isInteger(height) && height >= 1 && height <= ERASER_MAX_DIMENSION &&
    width * height <= ERASER_MAX_PIXELS;
}

function assertDimensions(width: number, height: number): void {
  if (!validDimensions(width, height)) throw new Error('Eraser canvas dimensions are invalid');
}

function validChannel(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 255;
}

function assertColor(value: unknown, label = 'Eraser color'): asserts value is EraserColor {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(validChannel))
    throw new Error(`${label} must contain four 8-bit channels`);
}

function assertPixels(value: ArrayLike<number>, width: number, height: number, label: string): void {
  if (!value || value.length !== width * height * 4)
    throw new Error(`${label} must contain RGBA data for every pixel`);
  // Canvas ImageData and Uint8ClampedArray already guarantee byte channels.
  // Skip a full scan for those hot-path buffers; tests/import paths may pass a
  // normal array, for which malformed values must fail before output.
  if (!(value instanceof Uint8ClampedArray))
    for (let i = 0; i < value.length; i += 1)
      if (!validChannel(value[i])) throw new Error(`${label} contains invalid RGBA channels`);
}

function assertTolerance(value: number): void {
  if (!finite(value) || value < 0 || value > 255) throw new Error('Eraser tolerance must be between 0 and 255');
}

function assertOpacity(value: number): void {
  if (!finite(value) || value < 0 || value > 1) throw new Error('Eraser opacity must be between 0 and 1');
}

function assertHardness(value: number): void {
  if (!finite(value) || value < 0 || value > 100) throw new Error('Eraser hardness must be between 0 and 100');
}

function assertPoint(x: number, y: number): void {
  if (!finite(x) || !finite(y)) throw new Error('Eraser point is invalid');
}

function assertSize(size: number): void {
  if (!finite(size) || size < 1 || size > ERASER_MAX_SIZE) throw new Error('Eraser size must be between 1 and 10,000');
}

function pointForCanvas(x: number, y: number, width: number, height: number): [number, number] {
  return [clamp(Math.floor(x), 0, width - 1), clamp(Math.floor(y), 0, height - 1)];
}

function pixelColor(data: ArrayLike<number>, width: number, x: number, y: number): EraserColor {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

/** Return a deterministic max-channel distance, treating transparent RGB as irrelevant. */
export function eraserColorDistance(left: EraserColor, right: EraserColor): number {
  assertColor(left, 'Left color');
  assertColor(right, 'Right color');
  if (left[3] === 0 && right[3] === 0) return 0;
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
    Math.abs(left[3] - right[3]),
  );
}

export function eraserColorMatches(left: EraserColor, right: EraserColor, tolerance: number): boolean {
  assertTolerance(tolerance);
  return eraserColorDistance(left, right) <= tolerance;
}

function destinationOut(data: Uint8ClampedArray, offset: number, amount: number): boolean {
  const before = data[offset + 3], after = Math.round(before * (1 - clamp(amount, 0, 1)));
  if (after === before) {
    // A fully transparent imported pixel may still contain hidden RGB. An
    // eraser operation normalizes that stale data so transparent edges remain
    // deterministic when the result is exported or compared in history.
    if (after === 0 && (data[offset] || data[offset + 1] || data[offset + 2])) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      return true;
    }
    return false;
  }
  data[offset + 3] = after;
  // Fully transparent pixels carry no hidden RGB. This makes transparent-edge
  // fixtures stable across repeated eraser operations and exports.
  if (after === 0) {
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
  }
  return true;
}

function fullMask(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height);
}

function floodMask(
  data: ArrayLike<number>,
  width: number,
  height: number,
  target: EraserColor,
  tolerance: number,
  contiguous: boolean,
  startX: number,
  startY: number,
): Uint8Array {
  const result = new Uint8Array(width * height), matches = (x: number, y: number) =>
    eraserColorMatches(pixelColor(data, width, x, y), target, tolerance);
  if (!contiguous) {
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1)
        if (matches(x, y)) result[y * width + x] = 1;
    return result;
  }
  if (!matches(startX, startY)) return result;
  const queue: number[] = [startX, startY];
  while (queue.length) {
    const y = queue.pop()!, x = queue.pop()!, index = y * width + x;
    if (result[index] || !matches(x, y)) continue;
    result[index] = 1;
    if (x > 0) queue.push(x - 1, y);
    if (x + 1 < width) queue.push(x + 1, y);
    if (y > 0) queue.push(x, y - 1);
    if (y + 1 < height) queue.push(x, y + 1);
  }
  return result;
}

function stampBounds(width: number, height: number, x: number, y: number, radius: number): EraserBounds {
  const left = Math.max(0, Math.floor(x - radius));
  const top = Math.max(0, Math.floor(y - radius));
  const right = Math.min(width, Math.floor(x + radius) + 1);
  const bottom = Math.min(height, Math.floor(y + radius) + 1);
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

/**
 * Remove a clicked Magic-Eraser color region. The returned pixels and mask are
 * fresh allocations; `source` remains byte-for-byte unchanged.
 */
export function applyMagicEraser(source: ArrayLike<number>, options: MagicEraserOptions): EraserResult {
  assertDimensions(options.width, options.height);
  assertPixels(source, options.width, options.height, 'Magic Eraser source');
  assertPoint(options.x, options.y);
  const tolerance = options.tolerance ?? 32,
    opacity = options.opacity ?? 1,
    contiguous = options.contiguous ?? true;
  assertTolerance(tolerance);
  assertOpacity(opacity);
  if (typeof contiguous !== 'boolean') throw new Error('Magic Eraser contiguous setting is invalid');
  const [x, y] = pointForCanvas(options.x, options.y, options.width, options.height),
    target = options.target ? [...options.target] as EraserColor : pixelColor(source, options.width, x, y);
  assertColor(target);
  const region = floodMask(source, options.width, options.height, target, tolerance, contiguous, x, y),
    pixels = Uint8ClampedArray.from(source),
    mask = fullMask(options.width, options.height);
  let changed = false;
  for (let index = 0; index < region.length; index += 1) {
    if (!region[index]) continue;
    const amount = opacity,
      offset = index * 4;
    mask[index] = Math.round(amount * 255);
    changed = destinationOut(pixels, offset, amount) || changed;
  }
  return {
    pixels,
    mask,
    changed,
    target,
    bounds: { left: 0, top: 0, right: options.width, bottom: options.height },
  };
}

/**
 * Remove a sampled background under one radial brush stamp. `contiguous`
 * restricts the color match to the four-connected region containing x/y;
 * disabling it erases every matching pixel inside the circular stamp.
 */
export function applyBackgroundEraser(source: ArrayLike<number>, options: BackgroundEraserOptions): EraserResult {
  assertDimensions(options.width, options.height);
  assertPixels(source, options.width, options.height, 'Background Eraser source');
  assertPoint(options.x, options.y);
  assertSize(options.size);
  const hardness = options.hardness ?? 100,
    tolerance = options.tolerance ?? 32,
    opacity = options.opacity ?? 1,
    contiguous = options.contiguous ?? true;
  assertHardness(hardness);
  assertTolerance(tolerance);
  assertOpacity(opacity);
  if (typeof contiguous !== 'boolean') throw new Error('Background Eraser contiguous setting is invalid');
  const [x, y] = pointForCanvas(options.x, options.y, options.width, options.height),
    target = options.target ? [...options.target] as EraserColor : pixelColor(source, options.width, x, y);
  assertColor(target);
  const region = floodMask(source, options.width, options.height, target, tolerance, contiguous, x, y),
    pixels = Uint8ClampedArray.from(source),
    mask = fullMask(options.width, options.height),
    radius = options.size / 2,
    bounds = stampBounds(options.width, options.height, options.x, options.y, radius);
  let changed = false;
  for (let py = bounds.top; py < bounds.bottom; py += 1) {
    for (let px = bounds.left; px < bounds.right; px += 1) {
      const index = py * options.width + px;
      if (!region[index]) continue;
      const coverage = radialCoverage(Math.hypot(px - options.x, py - options.y), radius, hardness),
        amount = coverage * opacity;
      if (amount <= 0) continue;
      mask[index] = Math.max(mask[index], Math.round(amount * 255));
      changed = destinationOut(pixels, index * 4, amount) || changed;
    }
  }
  return { pixels, mask, changed, target, bounds };
}

/**
 * Apply a straight Background Eraser stroke using an immutable source sample.
 * This is the byte-array equivalent of the existing Color Replacement stroke
 * helper and is useful when a pointer gesture is committed as one history step.
 */
export function applyBackgroundEraserStroke(
  source: ArrayLike<number>,
  destination: ArrayLike<number>,
  options: BackgroundEraserStrokeOptions,
): { pixels: Uint8ClampedArray; mask: Uint8ClampedArray; changed: boolean } {
  assertDimensions(options.width, options.height);
  assertPixels(source, options.width, options.height, 'Background Eraser source');
  assertPixels(destination, options.width, options.height, 'Background Eraser destination');
  assertColor(options.target);
  assertPoint(options.x1, options.y1);
  assertPoint(options.x2, options.y2);
  assertSize(options.size);
  const tolerance = options.tolerance ?? 32,
    opacity = options.opacity ?? 1,
    hardness = options.hardness ?? 100;
  assertTolerance(tolerance);
  assertOpacity(opacity);
  assertHardness(hardness);
  const sourceData = source,
    pixels = Uint8ClampedArray.from(destination),
    mask = fullMask(options.width, options.height),
    amounts = new Map<number, number>(),
    radius = options.size / 2,
    distance = Math.hypot(options.x2 - options.x1, options.y2 - options.y1),
    steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
  let changed = false;
  for (let step = 0; step <= steps; step += 1) {
    const cx = options.x1 + ((options.x2 - options.x1) * step) / steps,
      cy = options.y1 + ((options.y2 - options.y1) * step) / steps,
      bounds = stampBounds(options.width, options.height, cx, cy, radius);
    for (let py = bounds.top; py < bounds.bottom; py += 1) {
      for (let px = bounds.left; px < bounds.right; px += 1) {
        const sample = pixelColor(sourceData, options.width, px, py);
        if (!eraserColorMatches(sample, options.target, tolerance)) continue;
        const coverage = radialCoverage(Math.hypot(px - cx, py - cy), radius, hardness),
          amount = coverage * opacity;
        if (amount <= 0) continue;
        const index = py * options.width + px;
        // A stroke whose endpoints are equal produces two identical samples;
        // union coverage once per pixel so that a 50% stroke remains 50%.
        amounts.set(index, Math.max(amounts.get(index) ?? 0, amount));
        mask[index] = Math.max(mask[index], Math.round(amount * 255));
      }
    }
  }
  for (const [index, amount] of amounts) {
    if (amount <= 0) continue;
    changed = destinationOut(pixels, index * 4, amount) || changed;
  }
  return { pixels, mask, changed };
}

/** Canvas-facing Magic Eraser helper. It commits only a changed fresh frame. */
export function eraseMagicRegion(canvas: HTMLCanvasElement, x: number, y: number, tolerance = 32): boolean {
  if (!canvas || !canvas.getContext) throw new Error('Magic Eraser canvas is invalid');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Magic Eraser canvas context is unavailable');
  const image = context.getImageData(0, 0, canvas.width, canvas.height),
    result = applyMagicEraser(image.data, { width: canvas.width, height: canvas.height, x, y, tolerance });
  if (!result.changed) return false;
  const next = context.createImageData(canvas.width, canvas.height);
  next.data.set(result.pixels);
  context.putImageData(next, 0, 0);
  return true;
}

/** Canvas-facing Background Eraser stroke helper. */
export function eraseBackgroundStroke(
  source: HTMLCanvasElement,
  output: HTMLCanvasElement,
  target: EraserColor,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
  tolerance = 32,
  opacity = 1,
): boolean {
  if (!source || !output || !source.getContext || !output.getContext) throw new Error('Background Eraser canvas is invalid');
  if (source.width !== output.width || source.height !== output.height)
    throw new Error('Background Eraser canvases must have matching dimensions');
  const sourceContext = source.getContext('2d'), outputContext = output.getContext('2d');
  if (!sourceContext || !outputContext) throw new Error('Background Eraser canvas context is unavailable');
  // Only the segment's window is read and written, so a pointer move costs
  // the brush area rather than the whole layer.
  const finiteSize = Number.isFinite(size) ? size : 1;
  return windowedCanvasStroke(
    output,
    strokeWindow([{ x: x1, y: y1 }, { x: x2, y: y2 }], strokeWindowReach.sampled(finiteSize), output.width, output.height),
    ({ source: sourcePixels, destination, rect, width, height }) =>
      applyBackgroundEraserStroke(sourcePixels!, destination, {
        width, height,
        x1: x1 - rect.x, y1: y1 - rect.y, x2: x2 - rect.x, y2: y2 - rect.y,
        size, tolerance, opacity, target,
      }),
    { source, tool: 'background-eraser' },
  );
}

// Short aliases make the byte-array operations discoverable at integration
// call sites while retaining the explicit names in stack traces and docs.
export const magicEraser = applyMagicEraser;
export const backgroundEraser = applyBackgroundEraser;
