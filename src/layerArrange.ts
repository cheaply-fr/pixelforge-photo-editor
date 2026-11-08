import type { Frame, Layer } from './document.ts';
import { clippingGroupBase } from './layerClipping.ts';

/** Photoshop-style moves in the document's bottom-to-top layer stack. */
export type LayerArrangeMode = 'front' | 'forward' | 'backward' | 'back';

export type LayerArrangeReason =
  | 'no-selection'
  | 'missing-selection-layer'
  | 'duplicate-selection'
  | 'grouped-selection'
  | 'locked-selection'
  | 'boundary';

export type LayerArrangePlan =
  | {
      ok: true;
      mode: LayerArrangeMode;
      selectedLayerIds: string[];
      selectedIndices: number[];
    }
  | {
      ok: false;
      mode: LayerArrangeMode;
      reason: LayerArrangeReason;
      selectedLayerIds: string[];
    };

/**
 * Resolve the persisted selection in stack order. Legacy documents use the
 * active layer as their implicit selection; an explicit empty selection stays
 * empty so menu and panel guards do not unexpectedly move the active layer.
 */
function selectedIds(frame: Frame): string[] {
  return frame.selectedLayerIds === undefined
    ? frame.active
      ? [frame.active]
      : []
    : [...frame.selectedLayerIds];
}

function selectedStack(frame: Frame, ids: readonly string[]) {
  return ids
    .map((id) => ({ id, index: frame.layers.findIndex((layer) => layer.id === id) }))
    .sort((a, b) => a.index - b.index);
}

/**
 * Map every member of a clipping group (its base and each layer clipped to it)
 * to the group's base ID. Layers outside any clipping group are absent.
 */
export function clippingGroupKeys(frame: Pick<Frame, 'layers'>): Map<string, string> {
  const keys = new Map<string, string>();
  for (const layer of frame.layers) {
    if (layer.clippingTo === undefined) continue;
    const base = clippingGroupBase(frame, layer);
    if (!base) continue;
    keys.set(layer.id, base.id);
    keys.set(base.id, base.id);
  }
  return keys;
}

/**
 * Selecting the base of a clipping group selects the whole group: a base
 * moving without its clipped layers would release them. Clipped layers
 * selected on their own still move individually within (or out of) their
 * group.
 */
export function expandClippingGroupSelection(
  frame: Pick<Frame, 'layers'>,
  ids: Iterable<string>,
  keys: Map<string, string> = clippingGroupKeys(frame),
): Set<string> {
  const expanded = new Set(ids);
  const bases = new Set<string>();
  for (const layer of frame.layers)
    if (expanded.has(layer.id) && keys.get(layer.id) === layer.id) bases.add(layer.id);
  if (bases.size)
    for (const layer of frame.layers) {
      const key = keys.get(layer.id);
      if (key !== undefined && bases.has(key)) expanded.add(layer.id);
    }
  return expanded;
}

/**
 * Move every maximal run of selected layers one step toward the top
 * (`direction` 1) or the bottom (-1). A step past a clipping group the run
 * does not belong to jumps the whole unselected part of that group (base and
 * clipped layers), so an outside layer never lands between a base and its
 * clipped layers. A clipped layer stepping past a member of its own group
 * moves one layer, so it can still be reordered inside, or moved out of, its
 * group. The input array is not mutated.
 */
export function stepLayerRuns(
  layers: readonly Layer[],
  selected: ReadonlySet<string>,
  direction: 1 | -1,
  keys: Map<string, string>,
): Layer[] {
  const out = [...layers];
  const isSelected = (index: number) => selected.has(out[index].id);
  if (direction < 0) {
    let index = 0;
    while (index < out.length) {
      if (!isSelected(index)) {
        index += 1;
        continue;
      }
      let end = index;
      while (end + 1 < out.length && isSelected(end + 1)) end += 1;
      if (index > 0) {
        const edge = out[index],
          neighbourKey = keys.get(out[index - 1].id);
        // A clipped layer moving down onto its own group steps one layer.
        const withinOwnGroup =
          edge.clippingTo !== undefined &&
          neighbourKey !== undefined &&
          keys.get(edge.id) === neighbourKey;
        let start = index - 1;
        if (!withinOwnGroup && neighbourKey !== undefined)
          while (
            start > 0 &&
            !isSelected(start - 1) &&
            keys.get(out[start - 1].id) === neighbourKey
          )
            start -= 1;
        const obstacle = out.slice(start, index),
          run = out.slice(index, end + 1);
        out.splice(start, end + 1 - start, ...run, ...obstacle);
      }
      index = end + 1;
    }
    return out;
  }
  let index = out.length - 1;
  while (index >= 0) {
    if (!isSelected(index)) {
      index -= 1;
      continue;
    }
    let start = index;
    while (start > 0 && isSelected(start - 1)) start -= 1;
    if (index + 1 < out.length) {
      const edge = out[index],
        neighbour = out[index + 1],
        neighbourKey = keys.get(neighbour.id);
      // A group member moving up past a layer clipped in the same group steps one layer.
      const withinOwnGroup =
        neighbour.clippingTo !== undefined &&
        neighbourKey !== undefined &&
        keys.get(edge.id) === neighbourKey;
      let end = index + 1;
      if (!withinOwnGroup && neighbourKey !== undefined)
        while (
          end + 1 < out.length &&
          !isSelected(end + 1) &&
          keys.get(out[end + 1].id) === neighbourKey
        )
          end += 1;
      const run = out.slice(start, index + 1),
        obstacle = out.slice(index + 1, end + 1);
      out.splice(start, end + 1 - start, ...obstacle, ...run);
    }
    index = start - 1;
  }
  return out;
}

/**
 * Build a side-effect-free arrange plan. Selecting one member of a folder
 * expands to the complete folder block, so its isolated blend/opacity surface
 * moves atomically without interleaving unrelated layers.
 */
export function planLayerArrange(
  frame: Frame,
  mode: LayerArrangeMode,
): LayerArrangePlan {
  const ids = selectedIds(frame);
  if (!ids.length)
    return { ok: false, mode, reason: 'no-selection', selectedLayerIds: [] };
  if (new Set(ids).size !== ids.length)
    return { ok: false, mode, reason: 'duplicate-selection', selectedLayerIds: ids };
  const stack = selectedStack(frame, ids);
  if (stack.some((entry) => entry.index < 0))
    return {
      ok: false,
      mode,
      reason: 'missing-selection-layer',
      selectedLayerIds: ids,
    };
  const selected = stack.map((entry) => frame.layers[entry.index]);
  const groupIds = new Set(selected.flatMap((layer) => layer.groupId ? [layer.groupId] : []));
  const expandedIds = new Set(ids);
  for (const groupId of groupIds) {
    const group = frame.groups?.find((item) => item.id === groupId);
    if (!group) return { ok: false, mode, reason: 'grouped-selection', selectedLayerIds: ids };
    if (group.locked) return { ok: false, mode, reason: 'locked-selection', selectedLayerIds: ids };
    for (const layer of frame.layers) if (layer.groupId === groupId) expandedIds.add(layer.id);
  }
  // A clipping group's base carries its clipped layers along.
  for (const id of expandClippingGroupSelection(frame, expandedIds)) expandedIds.add(id);
  const expandedStack = selectedStack(frame, [...expandedIds]);
  const expanded = expandedStack.map((entry) => frame.layers[entry.index]);
  if (expanded.some((layer) => layer.locked))
    return { ok: false, mode, reason: 'locked-selection', selectedLayerIds: [...expandedIds] };
  const selectedIndices = expandedStack.map((entry) => entry.index);
  const selectedSet = new Set(selectedIndices);
  const canMoveForward = selectedIndices.some(
    (index) => index + 1 < frame.layers.length && !selectedSet.has(index + 1),
  );
  const canMoveBackward = selectedIndices.some(
    (index) => index > 0 && !selectedSet.has(index - 1),
  );
  const atBoundary =
    mode === 'front'
      ? !canMoveForward
      : mode === 'forward'
        ? !canMoveForward
        : mode === 'backward'
          ? !canMoveBackward
          : !canMoveBackward;
  if (atBoundary)
    return { ok: false, mode, reason: 'boundary', selectedLayerIds: expanded.map((layer) => layer.id) };
  return {
    ok: true,
    mode,
    selectedLayerIds: expanded.map((layer) => layer.id),
    selectedIndices,
  };
}

/** Apply an approved plan without mutating the input frame or layer objects. */
export function applyLayerArrange(
  frame: Frame,
  planOrMode: LayerArrangePlan | LayerArrangeMode,
): Frame {
  const plan =
    typeof planOrMode === 'string'
      ? planLayerArrange(frame, planOrMode)
      : planOrMode;
  if (!plan.ok) return frame;
  const selected = new Set(plan.selectedLayerIds);
  let layers: Layer[];
  if (plan.mode === 'front' || plan.mode === 'back') {
    const moving = frame.layers.filter((layer) => selected.has(layer.id));
    const remaining = frame.layers.filter((layer) => !selected.has(layer.id));
    layers = plan.mode === 'front' ? [...remaining, ...moving] : [...moving, ...remaining];
  } else {
    layers = stepLayerRuns(
      frame.layers,
      selected,
      plan.mode === 'forward' ? 1 : -1,
      clippingGroupKeys(frame),
    );
  }
  return { ...frame, layers };
}

/** Stable user-facing explanation for a disabled/no-op arrange command. */
export function layerArrangeReason(reason: LayerArrangeReason): string {
  switch (reason) {
    case 'no-selection':
      return 'Select at least one layer before arranging';
    case 'missing-selection-layer':
      return 'One or more selected layers are missing';
    case 'duplicate-selection':
      return 'The layer selection contains duplicate IDs';
    case 'grouped-selection':
      return 'The selected folder is missing from the document';
    case 'locked-selection':
      return 'Unlock all selected layers before arranging';
    case 'boundary':
      return 'Selected layers are already at that stack boundary';
  }
}

