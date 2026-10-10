import type { Frame, Layer } from './document.ts';

/** A layer that can provide visible alpha to a clipping mask. */
export function isPixelProducingLayer(layer: Layer | undefined): boolean {
  return Boolean(
    layer &&
    layer.kind !== 'adjustment' &&
    (layer.kind === 'raster' ||
      layer.kind === 'smart-object' ||
      layer.kind === 'text' ||
      layer.kind === 'rectangle' ||
      layer.kind === 'ellipse' ||
      layer.kind === 'line' ||
      layer.kind === 'polygon' ||
      layer.kind === 'path'),
  );
}

/** Only embedded/raster content is a clipping source in this first slice. */
export function isClippingSourceLayer(layer: Layer | undefined): boolean {
  return layer?.kind === 'raster' || layer?.kind === 'smart-object';
}

/**
 * Validate one persisted relationship. Layers are bottom-to-top in the flat
 * stack, so the clipping source must sit immediately above its base (index - 1
 * for the active layer) and both layers must share a root/folder.
 */
export function validClippingRelationship(
  frame: Pick<Frame, 'layers'>,
  sourceId: unknown,
  baseId: unknown,
): boolean {
  if (
    typeof sourceId !== 'string' ||
    typeof baseId !== 'string' ||
    sourceId === baseId
  )
    return false;
  const sourceIndex = frame.layers.findIndex((layer) => layer.id === sourceId),
    baseIndex = frame.layers.findIndex((layer) => layer.id === baseId),
    source = sourceIndex >= 0 ? frame.layers[sourceIndex] : undefined,
    base = baseIndex >= 0 ? frame.layers[baseIndex] : undefined;
  return Boolean(
    source &&
    base &&
    isClippingSourceLayer(source) &&
    isPixelProducingLayer(base) &&
    sourceIndex === baseIndex + 1 &&
    source.groupId === base.groupId,
  );
}

/** Return the directly lower pixel-producing base for a source, when valid. */
export function clippingBase(
  frame: Pick<Frame, 'layers'>,
  source: Layer,
): Layer | undefined {
  const sourceIndex = frame.layers.findIndex((layer) => layer.id === source.id);
  if (sourceIndex < 1) return undefined;
  const base = frame.layers[sourceIndex - 1];
  return source.clippingTo === base.id && validClippingRelationship(frame, source.id, base.id)
    ? base
    : undefined;
}

/**
 * Remove relationships invalidated by reorder/delete/group edits. This helper
 * is immutable and intentionally leaves valid links byte-for-byte unchanged.
 */
export function sanitizeClippingRelations<T extends Frame>(frame: T): T {
  let changed = false;
  const layers = frame.layers.map((layer) => {
    if (
      layer.clippingTo === undefined ||
      validClippingRelationship(frame, layer.id, layer.clippingTo)
    )
      return layer;
    changed = true;
    const { clippingTo: _clippingTo, ...withoutClipping } = layer;
    return withoutClipping as Layer;
  });
  return changed ? ({ ...frame, layers } as T) : frame;
}

/** Multiply source alpha by a base alpha buffer without mutating either input. */
export function applyClippingAlpha(
  source: Uint8ClampedArray,
  base: Uint8ClampedArray,
): Uint8ClampedArray {
  if (source.length !== base.length || source.length % 4 !== 0)
    throw new Error('Clipping buffers must have matching RGBA dimensions');
  const output = source.slice();
  for (let offset = 0; offset < output.length; offset += 4)
    output[offset + 3] = Math.round(
      (output[offset + 3] * base[offset + 3]) / 255,
    );
  return output;
}
