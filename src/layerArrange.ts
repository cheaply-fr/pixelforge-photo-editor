import type { Frame, Layer } from './document.ts';

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
    layers = [...frame.layers];
    if (plan.mode === 'forward') {
      for (let index = layers.length - 2; index >= 0; index -= 1) {
        if (selected.has(layers[index].id) && !selected.has(layers[index + 1].id))
          [layers[index], layers[index + 1]] = [layers[index + 1], layers[index]];
      }
    } else {
      for (let index = 1; index < layers.length; index += 1) {
        if (selected.has(layers[index].id) && !selected.has(layers[index - 1].id))
          [layers[index - 1], layers[index]] = [layers[index], layers[index - 1]];
      }
    }
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

