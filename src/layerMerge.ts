import type { Frame, Layer } from './document.ts';

/**
 * The first Merge Layers contract handles an adjacent pair of ungrouped
 * layers. Folder members are supported through the multi-selection planner,
 * which expands a complete folder into one isolated merge unit.
 */
export type LayerMergePlan =
  | {
      ok: true;
      activeIndex: number;
      lowerIndex: number;
    }
  | {
      ok: false;
      reason:
        | 'missing-active'
        | 'no-lower-layer'
        | 'lower-layer-hidden'
        | 'active-layer-hidden'
        | 'lower-layer-locked'
        | 'active-layer-locked'
        | 'grouped-layers';
    };

/**
 * A merge plan for Photoshop-style multi-selection merging.
 *
 * The flat layer stack is the source of truth for ordering. Root selections
 * must be contiguous; a complete folder may be non-contiguous in the flat
 * stack because its isolated compositor surface is the merge boundary.
 */
export type SelectedLayerMergePlan =
  | {
      ok: true;
      firstIndex: number;
      lastIndex: number;
      selectedIndices: number[];
      selectedLayerIds: string[];
    }
  | {
      ok: false;
      reason:
        | 'insufficient-selection'
        | 'missing-selection-layer'
        | 'non-contiguous-selection'
        | 'grouped-layers'
        | 'hidden-layer'
        | 'locked-layer'
        | 'artboard-partial-membership';
    };

/**
 * Plan a merge of the persisted layer selection.
 *
 * IDs are normalized into stack order so callers cannot change compositing
 * order by supplying a different selection-array order. The input is never
 * mutated and no assets are read or copied during planning.
 */
export function planSelectedLayerMerge(frame: Frame): SelectedLayerMergePlan {
  const rawIds = frame.selectedLayerIds ?? [frame.active];
  if (!Array.isArray(rawIds) || rawIds.length < 1)
    return { ok: false, reason: 'insufficient-selection' };
  const selectedIds = [...new Set(rawIds)];
  const initiallySelected = selectedIds.map((id) => frame.layers.find((layer) => layer.id === id));
  if (initiallySelected.some((layer) => !layer))
    return { ok: false, reason: 'missing-selection-layer' };
  const groupIds = new Set(initiallySelected.flatMap((layer) => layer?.groupId ? [layer.groupId] : []));
  if (groupIds.size > 1 || (groupIds.size === 1 && initiallySelected.some((layer) => !layer?.groupId)))
    return { ok: false, reason: 'grouped-layers' };
  if (groupIds.size === 1) {
    const groupId = [...groupIds][0];
    const group = frame.groups?.find((item) => item.id === groupId);
    if (!group || group.locked || !group.visible) return { ok: false, reason: 'grouped-layers' };
    for (const layer of frame.layers) if (layer.groupId === groupId && !selectedIds.includes(layer.id)) selectedIds.push(layer.id);
  }
  if (selectedIds.length < 2)
    return { ok: false, reason: 'insufficient-selection' };
  const indexes = selectedIds.map((id) => frame.layers.findIndex((layer) => layer.id === id));
  if (indexes.some((index) => index < 0))
    return { ok: false, reason: 'missing-selection-layer' };
  indexes.sort((a, b) => a - b);
  if (groupIds.size === 0 && indexes.some((index, offset) => offset > 0 && index !== indexes[offset - 1] + 1))
    return { ok: false, reason: 'non-contiguous-selection' };
  const selectedLayers = indexes.map((index) => frame.layers[index]);
  if (selectedLayers.some((layer) => !layer.visible))
    return { ok: false, reason: 'hidden-layer' };
  if (selectedLayers.some((layer) => layer.locked))
    return { ok: false, reason: 'locked-layer' };
  const selectedSet = new Set(selectedIds);
  if (
    frame.artboards?.some((artboard) => {
      if (artboard.layerIds === undefined) return false;
      const members = artboard.layerIds.filter((id) => selectedSet.has(id));
      return members.length > 0 && members.length < selectedSet.size;
    })
  )
    return { ok: false, reason: 'artboard-partial-membership' };
  return {
    ok: true,
    firstIndex: indexes[0],
    lastIndex: indexes[indexes.length - 1],
    selectedIndices: indexes,
    selectedLayerIds: indexes.map((index) => frame.layers[index].id),
  };
}

/**
 * Replace the selected stack range with a rendered raster result.
 *
 * This operation is intentionally separate from rendering: callers render a
 * bounded selection, then pass the immutable result here. Unrelated layers,
 * groups, and artboards remain represented; artboard memberships that include
 * the complete selection are updated to the replacement ID. A partially
 * referencing artboard keeps its own unrelated membership and drops the
 * selected IDs, avoiding a merged full-frame surface leaking into that
 * artboard. The input frame and layer objects are never mutated.
 */
export function applySelectedLayerMerge(
  frame: Frame,
  plan: Extract<SelectedLayerMergePlan, { ok: true }>,
  merged: Layer,
): Frame {
  const selected = new Set(plan.selectedLayerIds);
  const layers = frame.layers.filter((layer) => !selected.has(layer.id));
  layers.splice(plan.firstIndex, 0, { ...merged });
  const artboards = frame.artboards?.map((artboard) => {
    if (artboard.layerIds === undefined) return { ...artboard };
    const membership = artboard.layerIds;
    const includes = membership.filter((id) => selected.has(id));
    if (!includes.length) return { ...artboard, layerIds: [...membership] };
    const remaining = membership.filter((id) => !selected.has(id));
    // Only add the composite when the artboard already contained every source
    // layer. For a partial membership, omitting it is the safe bounded result.
    if (includes.length === selected.size) {
      const first = membership.findIndex((id) => selected.has(id));
      remaining.splice(Math.min(first, remaining.length), 0, merged.id);
    }
    return { ...artboard, layerIds: remaining };
  });
  return {
    ...frame,
    layers,
    ...(artboards ? { artboards } : {}),
    active: merged.id,
    selectedLayerIds: [merged.id],
  };
}

/** Plan the only merge shape currently safe without a folder merge contract. */
export function planLayerMerge(frame: Frame): LayerMergePlan {
  const activeIndex = frame.layers.findIndex((layer) => layer.id === frame.active);
  if (activeIndex < 0) return { ok: false, reason: 'missing-active' };
  if (activeIndex === 0) return { ok: false, reason: 'no-lower-layer' };
  const lowerIndex = activeIndex - 1;
  const active = frame.layers[activeIndex];
  const lower = frame.layers[lowerIndex];
  if (!lower.visible) return { ok: false, reason: 'lower-layer-hidden' };
  if (!active.visible) return { ok: false, reason: 'active-layer-hidden' };
  if (lower.locked) return { ok: false, reason: 'lower-layer-locked' };
  if (active.locked) return { ok: false, reason: 'active-layer-locked' };
  if (lower.groupId || active.groupId) return { ok: false, reason: 'grouped-layers' };
  return { ok: true, activeIndex, lowerIndex };
}

export function layerMergeReason(reason: Exclude<LayerMergePlan, { ok: true }>['reason']): string {
  switch (reason) {
    case 'missing-active':
      return 'Select a layer before merging';
    case 'no-lower-layer':
      return 'Select a layer above another layer before merging';
    case 'lower-layer-hidden':
      return 'The layer directly below must be visible';
    case 'active-layer-hidden':
      return 'The active layer must be visible';
    case 'lower-layer-locked':
      return 'Unlock the layer directly below before merging';
    case 'active-layer-locked':
      return 'Unlock the active layer before merging';
    case 'grouped-layers':
      return 'Ungroup layers before merging; isolated folder compositing is active, but grouped merge is staged';
  }
}

/** Convert a multi-selection guard into a concise menu/status message. */
export function selectedLayerMergeReason(
  reason: Exclude<SelectedLayerMergePlan, { ok: true }>['reason'],
): string {
  switch (reason) {
    case 'insufficient-selection':
      return 'Select at least two layers before merging';
    case 'missing-selection-layer':
      return 'One or more selected layers are missing';
    case 'non-contiguous-selection':
      return 'Selected layers must be contiguous in the layer stack';
    case 'grouped-layers':
      return 'Ungroup selected layers before merging; grouped merge is staged';
    case 'hidden-layer':
      return 'Show all selected layers before merging';
    case 'locked-layer':
      return 'Unlock all selected layers before merging';
    case 'artboard-partial-membership':
      return 'Select every layer referenced by an artboard before merging';
  }
}
