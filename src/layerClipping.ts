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

/** Return the directly lower pixel-producing base eligible for a new mask. */
export function clippingCandidateBase(
  frame: Pick<Frame, 'layers'>,
  source: Layer,
): Layer | undefined {
  const sourceIndex = frame.layers.findIndex((layer) => layer.id === source.id);
  if (sourceIndex < 1) return undefined;
  const base = frame.layers[sourceIndex - 1];
  return validClippingRelationship(frame, source.id, base.id)
    ? base
    : undefined;
}

/** Return the directly lower base for an existing persisted clipping link. */
export function clippingBase(
  frame: Pick<Frame, 'layers'>,
  source: Layer,
): Layer | undefined {
  const base = clippingCandidateBase(frame, source);
  return base && source.clippingTo === base.id ? base : undefined;
}

/**
 * The base of a layer's clipping group. Consecutive clipped layers above one
 * base all use that base's alpha (a layer clipped to an already-clipped layer
 * joins the same group), so the persisted adjacent `clippingTo` links are
 * followed down to the first layer that is not itself clipped.
 */
export function clippingGroupBase(
  frame: Pick<Frame, 'layers'>,
  source: Layer,
): Layer | undefined {
  let base = clippingBase(frame, source);
  // Each valid link points one index lower, so this terminates.
  while (base) {
    const lower = clippingBase(frame, base);
    if (!lower) return base;
    base = lower;
  }
  return undefined;
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

/**
 * Keep clipping groups intact across a stack reorder (Bring Forward, Send
 * Backward, …). A layer that was clipped before the move stays clipped when it
 * now sits directly above its clipping group's base or above another layer
 * that is still clipped to that same base; its adjacent `clippingTo` link is
 * re-pointed to the new lower neighbour. Any other previously clipped layer is
 * released and reported, so the caller can say so instead of dropping it
 * silently. Links are processed bottom-to-top so chains resolve in order.
 */
export function preserveClippingAfterReorder<T extends Frame>(
  before: Pick<Frame, 'layers'>,
  after: T,
): { frame: T; released: Layer[] } {
  const groupKey = new Map<string, string>();
  for (const layer of before.layers) {
    const base = layer.clippingTo !== undefined ? clippingGroupBase(before, layer) : undefined;
    if (layer.clippingTo !== undefined && base) groupKey.set(layer.id, base.id);
  }
  const released: Layer[] = [];
  let changed = false;
  const layers = [...after.layers];
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index],
      key = groupKey.get(layer.id);
    if (key === undefined) continue;
    const below = index > 0 ? layers[index - 1] : undefined;
    const belowKey = below ? (below.clippingTo !== undefined ? groupKey.get(below.id) : below.id) : undefined;
    if (
      below &&
      belowKey === key &&
      // A lower member must itself still be clipped after this pass.
      (below.id === key || below.clippingTo !== undefined) &&
      validClippingRelationship({ layers }, layer.id, below.id)
    ) {
      if (layer.clippingTo !== below.id) {
        layers[index] = { ...layer, clippingTo: below.id };
        changed = true;
      }
      continue;
    }
    const { clippingTo: _clippingTo, ...withoutClipping } = layer;
    layers[index] = withoutClipping as Layer;
    released.push(layer);
    changed = true;
  }
  return { frame: changed ? ({ ...after, layers } as T) : after, released };
}
