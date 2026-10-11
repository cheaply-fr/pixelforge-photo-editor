import type { Frame } from './document.ts';
import { selectedLayerIdsForFrame, validSelectedLayerIds } from './layerSelection.ts';

export type LayerLockMode = 'toggle' | 'lock' | 'unlock';
export type LayerLockReason = 'no-selection' | 'missing-selection-layer' | 'invalid-selection' | 'locked-group';

export type LayerLockPlan =
  | { ok: true; mode: Exclude<LayerLockMode, 'toggle'>; layerIds: string[] }
  | { ok: false; mode: LayerLockMode; reason: LayerLockReason; layerIds: string[] };

/** Plan a Photoshop-style lock operation without mutating the document. */
export function planLayerLock(frame: Frame, mode: LayerLockMode = 'toggle'): LayerLockPlan {
  const knownIds = new Set(frame.layers.map((layer) => layer.id));
  const rawSelection = frame.selectedLayerIds;
  if (Array.isArray(rawSelection) && rawSelection.some((id) => !knownIds.has(id)))
    return { ok: false, mode, reason: 'missing-selection-layer', layerIds: rawSelection };
  if (rawSelection !== undefined && !validSelectedLayerIds(rawSelection, [...knownIds]))
    return { ok: false, mode, reason: 'invalid-selection', layerIds: [] };
  if (rawSelection === undefined && !knownIds.has(frame.active))
    return { ok: false, mode, reason: 'missing-selection-layer', layerIds: [] };

  const layerIds = selectedLayerIdsForFrame(frame);
  if (!layerIds.length) return { ok: false, mode, reason: 'no-selection', layerIds };
  const selected = layerIds.map((id) => frame.layers.find((layer) => layer.id === id));
  if (selected.some((layer) => !layer))
    return { ok: false, mode, reason: 'missing-selection-layer', layerIds };

  const groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  if (selected.some((layer) => layer?.groupId && groups.get(layer.groupId)?.locked))
    return { ok: false, mode, reason: 'locked-group', layerIds };

  const target = mode === 'toggle'
    ? selected.some((layer) => !layer?.locked) ? 'lock' : 'unlock'
    : mode;
  return { ok: true, mode: target, layerIds };
}

/** Apply a plan immutably; invalid plans are deliberate no-ops. */
export function applyLayerLock(
  frame: Frame,
  planOrMode: LayerLockPlan | LayerLockMode = 'toggle',
): Frame {
  const plan = typeof planOrMode === 'string' ? planLayerLock(frame, planOrMode) : planOrMode;
  if (!plan.ok) return frame;
  const currentPlan = planLayerLock(frame, plan.mode);
  if (!currentPlan.ok || currentPlan.layerIds.length !== plan.layerIds.length ||
      currentPlan.layerIds.some((id, index) => id !== plan.layerIds[index])) return frame;
  const ids = new Set(plan.layerIds);
  const locked = plan.mode === 'lock';
  if (frame.layers.every((layer) => !ids.has(layer.id) || layer.locked === locked)) return frame;
  return {
    ...frame,
    layers: frame.layers.map((layer) =>
      ids.has(layer.id) ? { ...layer, locked: plan.mode === 'lock' } : layer,
    ),
  };
}

export function layerLockReason(reason: LayerLockReason): string {
  switch (reason) {
    case 'no-selection':
      return 'Select at least one layer before locking';
    case 'missing-selection-layer':
      return 'The selected layer is no longer available';
    case 'invalid-selection':
      return 'The layer selection is invalid';
    case 'locked-group':
      return 'Unlock the containing group before changing its layers';
  }
}
