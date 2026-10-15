import type { Frame, Layer } from './document.ts';
import { selectedLayerIdsForFrame } from './layerSelection.ts';

export type LinkLayersReason =
  | 'no-selection'
  | 'missing-selection-layer'
  | 'insufficient-selection'
  | 'locked-selection';

export type LinkLayersPlan =
  | { ok: true; layerIds: string[]; linkId: string }
  | { ok: false; reason: LinkLayersReason; layerIds: string[] };

export type UnlinkLayersPlan =
  | { ok: true; layerIds: string[] }
  | { ok: false; reason: 'no-selection' | 'missing-selection-layer' | 'no-linked-selection'; layerIds: string[] };
type UnlinkLayersReason = 'no-selection' | 'missing-selection-layer' | 'no-linked-selection';

function selected(frame: Frame): string[] {
  return selectedLayerIdsForFrame(frame);
}

function rawSelectionError(frame: Frame): string[] | undefined {
  const known = new Set(frame.layers.map((layer) => layer.id));
  const raw = frame.selectedLayerIds;
  return Array.isArray(raw) && raw.some((id) => !known.has(id)) ? raw : undefined;
}

function groupLocked(frame: Frame, layer: Layer): boolean {
  return Boolean(layer.groupId && frame.groups?.some((group) => group.id === layer.groupId && group.locked));
}

export function planLinkLayers(frame: Frame, linkId: string): LinkLayersPlan {
  const stale = rawSelectionError(frame);
  if (stale) return { ok: false, reason: 'missing-selection-layer', layerIds: stale };
  const ids = selected(frame);
  if (!ids.length) return { ok: false, reason: 'no-selection', layerIds: ids };
  if (ids.some((id) => !frame.layers.some((layer) => layer.id === id)))
    return { ok: false, reason: 'missing-selection-layer', layerIds: ids };
  if (ids.length < 2) return { ok: false, reason: 'insufficient-selection', layerIds: ids };
  const layers = ids.map((id) => frame.layers.find((layer) => layer.id === id)!);
  if (layers.some((layer) => layer.locked || groupLocked(frame, layer)))
    return { ok: false, reason: 'locked-selection', layerIds: ids };
  if (typeof linkId !== 'string' || !/^[a-f\d-]{8,160}$/i.test(linkId))
    throw new Error('Layer link identity is invalid');
  return { ok: true, layerIds: ids, linkId };
}

export function applyLinkLayers(frame: Frame, planOrLinkId: LinkLayersPlan | string): Frame {
  const plan = typeof planOrLinkId === 'string' ? planLinkLayers(frame, planOrLinkId) : planOrLinkId;
  if (!plan.ok) return frame;
  const current = planLinkLayers(frame, plan.linkId);
  if (!current.ok || current.layerIds.join('|') !== plan.layerIds.join('|')) return frame;
  const ids = new Set(plan.layerIds);
  const changed = frame.layers.some((layer) => ids.has(layer.id) && layer.layerLinkId !== plan.linkId);
  return changed
    ? { ...frame, layers: frame.layers.map((layer) => ids.has(layer.id) ? { ...layer, layerLinkId: plan.linkId } : layer) }
    : frame;
}

export function planUnlinkLayers(frame: Frame): UnlinkLayersPlan {
  const stale = rawSelectionError(frame);
  if (stale) return { ok: false, reason: 'missing-selection-layer', layerIds: stale };
  const ids = selected(frame);
  if (!ids.length) return { ok: false, reason: 'no-selection', layerIds: ids };
  if (ids.some((id) => !frame.layers.some((layer) => layer.id === id)))
    return { ok: false, reason: 'missing-selection-layer', layerIds: ids };
  const linked = ids.filter((id) => frame.layers.find((layer) => layer.id === id)?.layerLinkId);
  return linked.length ? { ok: true, layerIds: linked } : { ok: false, reason: 'no-linked-selection', layerIds: ids };
}

export function applyUnlinkLayers(frame: Frame, plan: UnlinkLayersPlan = planUnlinkLayers(frame)): Frame {
  if (!plan.ok) return frame;
  const ids = new Set(plan.layerIds);
  return { ...frame, layers: frame.layers.map((layer) => {
    if (!ids.has(layer.id) || layer.layerLinkId === undefined) return layer;
    const { layerLinkId: _layerLinkId, ...unlinked } = layer;
    return unlinked as Layer;
  }) };
}

export function linkLayersReason(reason: LinkLayersReason | UnlinkLayersReason): string {
  switch (reason) {
    case 'no-selection': return 'Select layers before changing links';
    case 'missing-selection-layer': return 'One or more selected layers are missing';
    case 'insufficient-selection': return 'Select at least two layers to link';
    case 'locked-selection': return 'Unlock all selected layers before linking';
    case 'no-linked-selection': return 'Select a linked layer before unlinking';
  }
}
