import {
  decodeAsset,
  surface,
  type Assets,
  type Selection,
  type SelectionOperation,
  type SelectionPart,
} from './document';
import {
  CANVAS_FEATHER_THRESHOLD,
  featherAlpha,
  validSelectionFeather,
} from './selectionFeather';
import {
  alphaBounds,
  selectionParts,
  selectionRenderRect,
  type SelectionRect,
} from './selectionBounds';

function drawPart(context: CanvasRenderingContext2D, part: SelectionPart) {
  context.fillStyle = '#fff';
  if (part.shape === 'ellipse') {
    context.beginPath();
    context.ellipse(part.x + part.w / 2, part.y + part.h / 2, part.w / 2, part.h / 2, 0, 0, Math.PI * 2);
    context.fill();
  } else if (part.shape === 'polygon' && part.points) {
    context.beginPath();
    context.moveTo(part.points[0].x, part.points[0].y);
    for (const point of part.points.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
    context.fill();
  } else context.fillRect(part.x, part.y, part.w, part.h);
}

/**
 * Pre-matrix selection pixels for `rect` of a `w × h` canvas: composed
 * coverage, feathered and inverted. Pixels of the canvas outside `rect` are
 * transparent (opaque black when inverted). `alpha` is the region's alpha
 * plane when it was already read back.
 */
type SelectionRegion = {
  canvas: HTMLCanvasElement;
  rect: SelectionRect;
  alpha?: Uint8ClampedArray;
};

/**
 * Resolve a selection inside `rect` (default: the padded selection bounds,
 * see src/selectionBounds.ts). With `rect` covering the whole canvas this is
 * the original full-canvas render; tests compare the two.
 */
export async function renderSelectionRegion(
  selection: Selection,
  w: number,
  h: number,
  assets: Assets,
  rect?: SelectionRect,
): Promise<SelectionRegion> {
  const feather = validSelectionFeather(selection.feather) ? selection.feather : 0;
  let maskImage: HTMLImageElement | undefined;
  if (selection.mask) {
    maskImage = await decodeAsset(assets[selection.mask]);
    if (!rect && feather > 0) {
      // A color mask's bounds are its nonzero pixels; one readback is far
      // cheaper than blurring the whole canvas.
      const probe = surface(w, h), probeContext = probe.getContext('2d')!;
      probeContext.drawImage(maskImage, 0, 0);
      rect = selectionRenderRect(selection, w, h,
        alphaBounds(probeContext.getImageData(0, 0, w, h).data, w, h, 4, 3));
    } else if (!rect) rect = { x: 0, y: 0, w, h };
  }
  rect ??= selectionRenderRect(selection, w, h);
  const { x: left, y: top, w: width, h: height } = rect;
  let raw: HTMLCanvasElement;
  if (maskImage) {
    raw = surface(width, height);
    raw.getContext('2d')!.drawImage(maskImage, -left, -top);
  } else {
    // Shapes are drawn at their document coordinates: Chromium's
    // anti-aliasing of curves depends on the absolute position, so drawing
    // into a translated crop would shift edge alpha by up to ~11.
    const right = left + width, bottom = top + height;
    const composed = surface(right, bottom), context = composed.getContext('2d')!;
    const shape = surface(right, bottom), shapeContext = shape.getContext('2d')!;
    for (const part of selectionParts(selection)) {
      shapeContext.clearRect(0, 0, right, bottom);
      drawPart(shapeContext, part);
      if (part.operation === 'replace') context.clearRect(0, 0, right, bottom);
      context.globalCompositeOperation = part.operation === 'subtract' ? 'destination-out'
        : part.operation === 'intersect' ? 'destination-in' : 'source-over';
      context.drawImage(shape, 0, 0);
    }
    if (left === 0 && top === 0) raw = composed;
    else {
      raw = surface(width, height);
      raw.getContext('2d')!.drawImage(composed, -left, -top);
    }
  }
  const out = surface(width, height), target = out.getContext('2d')!;
  // Large radii keep the canvas blur (unchanged output for existing
  // documents); small and fractional radii, where the browser's box
  // quantisation is visible, use the exact fractional Gaussian below.
  const exact = feather > 0 && feather < CANVAS_FEATHER_THRESHOLD;
  target.filter = feather >= CANVAS_FEATHER_THRESHOLD ? `blur(${feather}px)` : 'none';
  target.drawImage(raw, 0, 0);
  target.filter = 'none';
  if (!exact && !selection.inverted) return { canvas: out, rect };
  const image = target.getImageData(0, 0, width, height), data = image.data,
    alpha = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = data[pixel * 4 + 3];
  if (exact) {
    // Fractional Gaussian on the alpha plane; selection coverage is white.
    const blurred = featherAlpha(alpha, width, height, feather);
    for (let pixel = 0; pixel < blurred.length; pixel += 1) {
      const offset = pixel * 4;
      if (blurred[pixel] > 0 && data[offset + 3] === 0) {
        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
      }
      data[offset + 3] = alpha[pixel] = blurred[pixel];
    }
  }
  if (selection.inverted)
    for (let pixel = 0; pixel < alpha.length; pixel += 1)
      data[pixel * 4 + 3] = alpha[pixel] = 255 - alpha[pixel];
  target.putImageData(image, 0, 0);
  return { canvas: out, rect, alpha };
}

/** Place a region on a full `w × h` canvas, filling the rest as it renders. */
function regionCanvas(region: SelectionRegion, w: number, h: number, inverted: boolean) {
  const { canvas, rect } = region;
  if (rect.x === 0 && rect.y === 0 && rect.w === w && rect.h === h) return canvas;
  const out = surface(w, h), context = out.getContext('2d')!;
  if (inverted) {
    // Outside the bounds an inverted selection is fully selected; the
    // full-canvas render leaves those pixels opaque black.
    context.fillStyle = '#000';
    context.fillRect(0, 0, w, h);
    context.clearRect(rect.x, rect.y, rect.w, rect.h);
  }
  context.drawImage(canvas, rect.x, rect.y);
  return out;
}

/** Resolve alpha before its affine transform, then clip to the document canvas. */
export async function renderSelection(
  selection: Selection,
  w: number,
  h: number,
  assets: Assets,
) {
  const out = regionCanvas(await renderSelectionRegion(selection, w, h, assets), w, h, !!selection.inverted);
  if (!selection.matrix) return out;
  const transformed = surface(w, h), transformedContext = transformed.getContext('2d')!;
  transformedContext.setTransform(...selection.matrix);
  transformedContext.drawImage(out, 0, 0);
  return transformed;
}

type AlphaEntry = {
  selection: Selection;
  w: number;
  h: number;
  mask: unknown;
  alpha: Promise<Uint8ClampedArray>;
};
/** Most recent selection alpha planes; a stroke, its outline and fills reuse one. */
const alphaCache: AlphaEntry[] = [];
const ALPHA_CACHE_SIZE = 2;

async function resolveSelectionAlpha(selection: Selection, w: number, h: number, assets: Assets) {
  const plane = new Uint8ClampedArray(w * h);
  if (selection.matrix) {
    const data = (await renderSelection(selection, w, h, assets)).getContext('2d')!
      .getImageData(0, 0, w, h).data;
    for (let pixel = 0; pixel < plane.length; pixel += 1) plane[pixel] = data[pixel * 4 + 3];
    return plane;
  }
  const region = await renderSelectionRegion(selection, w, h, assets), { rect } = region;
  let alpha = region.alpha;
  if (!alpha) {
    const data = region.canvas.getContext('2d')!.getImageData(0, 0, rect.w, rect.h).data;
    alpha = new Uint8ClampedArray(rect.w * rect.h);
    for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = data[pixel * 4 + 3];
  }
  if (selection.inverted) plane.fill(255);
  for (let row = 0; row < rect.h; row += 1)
    plane.set(alpha.subarray(row * rect.w, (row + 1) * rect.w), (rect.y + row) * w + rect.x);
  return plane;
}

/**
 * Frame-space selection coverage: one alpha byte per canvas pixel, equal to
 * the alpha channel of renderSelection. Selections are immutable document
 * values, so the plane for the most recent selections is cached and each call
 * returns a private copy the caller may modify.
 */
export async function selectionAlpha(
  selection: Selection,
  w: number,
  h: number,
  assets: Assets,
): Promise<Uint8ClampedArray> {
  const mask = selection.mask ? assets[selection.mask] : undefined;
  let entry = alphaCache.find((candidate) =>
    candidate.selection === selection && candidate.w === w && candidate.h === h && candidate.mask === mask);
  if (!entry) {
    entry = { selection, w, h, mask, alpha: resolveSelectionAlpha(selection, w, h, assets) };
    alphaCache.unshift(entry);
    alphaCache.length = Math.min(alphaCache.length, ALPHA_CACHE_SIZE);
    const added = entry;
    // A failed render is not cached.
    added.alpha.catch(() => {
      const index = alphaCache.indexOf(added);
      if (index >= 0) alphaCache.splice(index, 1);
    });
  }
  return (await entry.alpha).slice();
}

/** Compose resolved alpha rather than discarding a color mask, feather or inversion. */
export async function composeSelection(
  previous: Selection,
  next: Selection,
  operation: SelectionOperation,
  w: number,
  h: number,
  assets: Assets,
) {
  const left = await renderSelection(previous, w, h, assets),
    right = await renderSelection(next, w, h, assets),
    context = left.getContext('2d')!;
  if (operation === 'replace') context.clearRect(0, 0, w, h);
  context.globalCompositeOperation = operation === 'subtract' ? 'destination-out'
    : operation === 'intersect' ? 'destination-in' : 'source-over';
  context.drawImage(right, 0, 0);
  return left;
}
