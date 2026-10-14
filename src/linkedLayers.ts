import type { Frame, Layer } from './document.ts';
import { selectedLayerIdsForFrame } from './layerSelection.ts';

export type SelectLinkedLayersReason =
  | 'no-selection'
  | 'missing-selection-layer'
  | 'no-linked-selection';

export type SelectLinkedLayersPlan =
  | { ok: true; layerIds: string[]; linkIds: string[] }
  | { ok: false; reason: SelectLinkedLayersReason; layerIds: string[] };

/**
 * Resolve all smart-object instances linked to any currently selected linked
 * instance. The operation changes selection metadata only; assets, transforms
 * and the active layer remain untouched.
 */
export function planSelectLinkedLayers(frame: Frame): SelectLinkedLayersPlan {
  const known = new Set(frame.layers.map((layer) => layer.id));
  const selected = frame.selectedLayerIds ?? [frame.active];
  if (!Array.isArray(selected) || selected.some((id) => !known.has(id))) {
    return { ok: false, reason: 'missing-selection-layer', layerIds: [] };
  }
  const selectedIds = selectedLayerIdsForFrame(frame);
  if (!selectedIds.length) return { ok: false, reason: 'no-selection', layerIds: [] };
  const linkIds = [
    ...new Set(
      selectedIds.flatMap((id) => {
        const layer = frame.layers.find((candidate) => candidate.id === id);
        return layer?.kind === 'smart-object' && layer.linkId ? [layer.linkId] : [];
      }),
    ),
  ];
  if (!linkIds.length)
    return { ok: false, reason: 'no-linked-selection', layerIds: selectedIds };
  const links = new Set(linkIds);
  const layerIds = frame.layers
    .filter((layer): layer is Layer & { kind: 'smart-object'; linkId: string } =>
      layer.kind === 'smart-object' && layer.linkId !== undefined && links.has(layer.linkId),
    )
    .map((layer) => layer.id);
  return { ok: true, layerIds, linkIds };
}

/** Apply a validated plan immutably and retain the current active layer. */
export function applySelectLinkedLayers(
  frame: Frame,
  planOrSelect: SelectLinkedLayersPlan | 'select' = 'select',
): Frame {
  const plan = planOrSelect === 'select' ? planSelectLinkedLayers(frame) : planOrSelect;
  if (!plan.ok) return frame;
  const current = planSelectLinkedLayers(frame);
  if (
    !current.ok ||
    current.layerIds.length !== plan.layerIds.length ||
    current.layerIds.some((id, index) => id !== plan.layerIds[index])
  )
    return frame;
  const same =
    frame.selectedLayerIds !== undefined &&
    frame.selectedLayerIds.length === plan.layerIds.length &&
    frame.selectedLayerIds.every((id, index) => id === plan.layerIds[index]);
  return same ? frame : { ...frame, selectedLayerIds: plan.layerIds };
}

export function selectLinkedLayersReason(reason: SelectLinkedLayersReason): string {
  switch (reason) {
    case 'no-selection':
      return 'Select a linked smart-object layer first';
    case 'missing-selection-layer':
      return 'The selected layer is no longer available';
    case 'no-linked-selection':
      return 'Select a linked smart-object layer first';
  }
}
