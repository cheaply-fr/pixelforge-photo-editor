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

/** Resolve alpha before its affine transform, then clip to the document canvas. */
export async function renderSelection(
  selection: Selection,
  w: number,
  h: number,
  assets: Assets,
) {
  const raw = surface(w, h), context = raw.getContext('2d')!;
  if (selection.mask) {
    context.drawImage(await decodeAsset(assets[selection.mask]), 0, 0);
  } else {
    const parts: SelectionPart[] = selection.parts?.length ? selection.parts : [{
      shape: selection.shape, x: selection.x, y: selection.y,
      w: selection.w, h: selection.h, points: selection.points, operation: 'replace',
    }];
    for (const part of parts) {
      const shape = surface(w, h);
      drawPart(shape.getContext('2d')!, part);
      if (part.operation === 'replace') context.clearRect(0, 0, w, h);
      context.globalCompositeOperation = part.operation === 'subtract' ? 'destination-out'
        : part.operation === 'intersect' ? 'destination-in' : 'source-over';
      context.drawImage(shape, 0, 0);
    }
  }
  const out = surface(w, h), target = out.getContext('2d')!;
  const feather = validSelectionFeather(selection.feather) ? selection.feather : 0;
  // Large radii keep the canvas blur (unchanged output for existing
  // documents); small and fractional radii, where the browser's box
  // quantisation is visible, use the exact fractional Gaussian below.
  const exact = feather > 0 && feather < CANVAS_FEATHER_THRESHOLD;
  target.filter = feather >= CANVAS_FEATHER_THRESHOLD ? `blur(${feather}px)` : 'none';
  target.drawImage(raw, 0, 0);
  target.filter = 'none';
  if (exact || selection.inverted) {
    const image = target.getImageData(0, 0, w, h), data = image.data;
    if (exact) {
      // Fractional Gaussian on the alpha plane; selection coverage is white.
      const alpha = new Uint8ClampedArray(w * h);
      for (let pixel = 0; pixel < alpha.length; pixel += 1) alpha[pixel] = data[pixel * 4 + 3];
      const blurred = featherAlpha(alpha, w, h, feather);
      for (let pixel = 0; pixel < blurred.length; pixel += 1) {
        const offset = pixel * 4;
        if (blurred[pixel] > 0 && data[offset + 3] === 0) {
          data[offset] = 255;
          data[offset + 1] = 255;
          data[offset + 2] = 255;
        }
        data[offset + 3] = blurred[pixel];
      }
    }
    if (selection.inverted)
      for (let i = 3; i < data.length; i += 4) data[i] = 255 - data[i];
    target.putImageData(image, 0, 0);
  }
  if (!selection.matrix) return out;
  const transformed = surface(w, h), transformedContext = transformed.getContext('2d')!;
  transformedContext.setTransform(...selection.matrix);
  transformedContext.drawImage(out, 0, 0);
  return transformed;
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
