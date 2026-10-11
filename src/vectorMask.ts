/**
 * Nondestructive Photoshop-style vector mask primitives.
 *
 * A vector mask is an editable local PathModel. Rendering is performed in the
 * document compositor, while this module owns strict model validation and the
 * immutable RGBA alpha operation used by browser/worker tests.
 */
import { pathContours, validatePath, type PathModel } from './paths.ts';

export type VectorMaskModel = {
  path: PathModel;
  /** Whether the mask participates in compositing. */
  enabled: boolean;
  /** Complement the filled path alpha before compositing. */
  inverted: boolean;
};

export const VECTOR_MASK_MAX_NODES = 10_000;
export const VECTOR_MASK_MAX_CONTOURS = 64;

export function effectiveVectorMask(value: Partial<VectorMaskModel> | null | undefined): VectorMaskModel | undefined {
  if (!value?.path) return undefined;
  return {
    path: validateVectorMaskPath(value.path),
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    inverted: typeof value.inverted === 'boolean' ? value.inverted : false,
  };
}

/** Vector masks need at least one closed filled contour; strokes are ignored. */
export function validateVectorMaskPath(value: unknown): PathModel {
  const path = validatePath(value);
  const contours = pathContours(path);
  if (!contours.length || !contours.some((contour) => contour.closed && contour.nodes.length >= 3))
    throw new Error('Vector mask needs a closed contour with at least three nodes');
  if (!path.fill) throw new Error('Vector mask path must have fill enabled');
  if (contours.length > VECTOR_MASK_MAX_CONTOURS)
    throw new Error('Vector mask contains too many contours');
  const nodes = contours.reduce((total, contour) => total + contour.nodes.length, 0);
  if (nodes > VECTOR_MASK_MAX_NODES) throw new Error('Vector mask contains too many nodes');
  return {
    ...path,
    stroke: false,
    fill: true,
  };
}

export function validVectorMask(value: unknown): value is VectorMaskModel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<VectorMaskModel>;
  if (typeof candidate.enabled !== 'boolean' || typeof candidate.inverted !== 'boolean') return false;
  try {
    validateVectorMaskPath(candidate.path);
    return true;
  } catch {
    return false;
  }
}

/** Apply a frame-space vector alpha mask without mutating source pixels. */
export function applyVectorMaskPixels(
  source: ArrayLike<number>,
  maskAlpha: ArrayLike<number>,
  settings?: Partial<Pick<VectorMaskModel, 'enabled' | 'inverted'>>,
): Uint8ClampedArray {
  if (source.length % 4 !== 0) throw new Error('Vector mask source must contain RGBA pixels');
  const pixels = source.length / 4;
  if (maskAlpha.length !== pixels) throw new Error('Vector mask alpha must contain one value per pixel');
  const enabled = settings?.enabled !== false;
  const inverted = settings?.inverted === true;
  const result = new Uint8ClampedArray(source.length);
  for (let i = 0; i < source.length; i += 1) {
    const value = Number(source[i]);
    if (!Number.isFinite(value) || value < 0 || value > 255)
      throw new Error('Vector mask source pixels are invalid');
    result[i] = value;
  }
  if (!enabled) return result;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const alphaValue = Number(maskAlpha[pixel]);
    if (!Number.isFinite(alphaValue) || alphaValue < 0 || alphaValue > 255)
      throw new Error('Vector mask alpha is invalid');
    const alpha = inverted ? 255 - alphaValue : alphaValue;
    const offset = pixel * 4;
    result[offset + 3] = Math.round((result[offset + 3] * alpha) / 255);
  }
  return result;
}

/** Create a closed rectangle path in the layer-local coordinate system. */
export function defaultVectorMaskPath(width: number, height: number): PathModel {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 16000 || height > 16000)
    throw new Error('Vector mask bounds are invalid');
  return validateVectorMaskPath({
    nodes: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    closed: true,
    fill: true,
    stroke: false,
    strokeWidth: 0,
    fillColor: '#ffffff',
    strokeColor: '#000000',
  });
}

/** Trace an editable PathModel into a Canvas 2D path. */
export function traceVectorMaskPath(context: CanvasRenderingContext2D, path: PathModel): void {
  const valid = validateVectorMaskPath(path);
  context.beginPath();
  for (const contour of pathContours(valid)) {
    const [first, ...rest] = contour.nodes;
    if (!first || !contour.closed) continue;
    context.moveTo(first.x, first.y);
    for (const [index, node] of rest.entries()) {
      const previous = contour.nodes[index];
      if (previous.outHandle || node.inHandle) {
        const out = previous.outHandle ?? previous;
        const incoming = node.inHandle ?? node;
        context.bezierCurveTo(out.x, out.y, incoming.x, incoming.y, node.x, node.y);
      } else context.lineTo(node.x, node.y);
    }
    const previous = contour.nodes[contour.nodes.length - 1];
    const out = previous.outHandle ?? previous;
    const incoming = first.inHandle ?? first;
    if (previous.outHandle || first.inHandle)
      context.bezierCurveTo(out.x, out.y, incoming.x, incoming.y, first.x, first.y);
    else context.lineTo(first.x, first.y);
    context.closePath();
  }
}
