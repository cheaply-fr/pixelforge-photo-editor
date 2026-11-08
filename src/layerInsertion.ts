import type { Frame, Layer } from './document.ts';
import {
  clippingBase,
  clippingGroupBase,
  validClippingRelationship,
} from './layerClipping.ts';

export type LayerInsertion = {
  frame: Frame;
  /** Stack index of the inserted layer (bottom = 0). */
  index: number;
  /** True when the new layer joined the active layer's clipping group. */
  clipped: boolean;
};

/**
 * Insert a new layer directly above the active layer, as image editors do
 * for "New Layer". The result is immutable and becomes the active, only
 * selected layer.
 *
 * - No active layer (or an unknown id): the layer goes on top of the stack.
 * - Inside a folder: the layer joins that folder, keeping it contiguous. A
 *   locked folder is not edited: the layer goes directly above the folder.
 * - Clipping groups stay intact. When the active layer is clipped, or is the
 *   base (or a member) of a clipping group that continues above it, the new
 *   layer joins the group: it clips to the active layer and the clipped
 *   layer above is re-pointed to it, so no existing link is broken and the
 *   group still clips to the same base.
 * - Artboards that list the active layer also list the new layer.
 *
 * The caller supplies the new layer without `groupId` or `clippingTo`.
 */
export function insertLayerAboveActive(frame: Frame, layer: Layer): LayerInsertion {
  const result = insertLayerAbove(frame, layer, frame.active);
  return {
    ...result,
    frame: { ...result.frame, active: layer.id, selectedLayerIds: [layer.id] },
  };
}

/**
 * Duplicate Layer: each copy goes directly above its source, in the source's
 * folder and clipping group (the same rules as a new layer above the active
 * layer). Copies become the selection; the last copy is active. `copies[i]`
 * is the copy of `sources[i]`.
 */
export function insertCopiesAboveSources(
  frame: Frame,
  sources: readonly Layer[],
  copies: readonly Layer[],
): Frame {
  let next = frame;
  sources.forEach((source, index) => {
    next = insertLayerAbove(next, copies[index], source.id).frame;
  });
  return {
    ...next,
    active: copies.at(-1)?.id ?? frame.active,
    selectedLayerIds: copies.map((copy) => copy.id),
  };
}

/**
 * Insert `layer` directly above the layer `anchorId` (see
 * insertLayerAboveActive for the folder and clipping rules). Selection is
 * left unchanged.
 */
export function insertLayerAbove(frame: Frame, layer: Layer, anchorId: string | undefined): LayerInsertion {
  const { groupId: _groupId, clippingTo: _clippingTo, ...plain } = layer;
  let inserted = plain as Layer;
  const activeIndex = anchorId === undefined ? -1 : frame.layers.findIndex((item) => item.id === anchorId);
  const select = (layers: Layer[], index: number, clipped: boolean, artboards = frame.artboards) => ({
    frame: {
      ...frame,
      layers,
      ...(artboards ? { artboards } : {}),
    },
    index,
    clipped,
  });
  if (activeIndex < 0)
    return select([...frame.layers, inserted], frame.layers.length, false);
  const active = frame.layers[activeIndex];
  const group = active.groupId
    ? (frame.groups || []).find((item) => item.id === active.groupId)
    : undefined;
  if (active.groupId && (!group || group.locked)) {
    // Do not add members to a locked (or dangling) folder: place the layer
    // above the folder's top member instead.
    let top = activeIndex;
    for (let index = 0; index < frame.layers.length; index += 1)
      if (frame.layers[index].groupId === active.groupId) top = index;
    const layers = [...frame.layers];
    layers.splice(top + 1, 0, inserted);
    return select(layers, top + 1, false);
  }
  if (group) inserted = { ...inserted, groupId: group.id };
  const above = frame.layers[activeIndex + 1];
  const activeClipped = active.clippingTo !== undefined && Boolean(clippingGroupBase(frame, active));
  const aboveClippedToActive = Boolean(above && clippingBase(frame, above)?.id === active.id);
  const layers = [...frame.layers];
  layers.splice(activeIndex + 1, 0, inserted);
  let clipped = false;
  if (activeClipped || aboveClippedToActive) {
    const candidate = { ...inserted, clippingTo: active.id } as Layer;
    const trial = [...layers];
    trial[activeIndex + 1] = candidate;
    if (validClippingRelationship({ layers: trial }, candidate.id, active.id)) {
      inserted = candidate;
      layers[activeIndex + 1] = candidate;
      clipped = true;
      if (aboveClippedToActive) {
        const repointed = { ...above, clippingTo: candidate.id } as Layer;
        trial[activeIndex + 2] = repointed;
        if (validClippingRelationship({ layers: trial }, repointed.id, candidate.id))
          layers[activeIndex + 2] = repointed;
      }
    }
  }
  const artboards = frame.artboards?.map((artboard) =>
    artboard.layerIds?.includes(active.id) && !artboard.layerIds.includes(inserted.id)
      ? { ...artboard, layerIds: [...artboard.layerIds, inserted.id] }
      : artboard,
  );
  return select(layers, activeIndex + 1, clipped, artboards);
}
