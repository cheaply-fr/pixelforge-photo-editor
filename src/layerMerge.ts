import type { Frame } from './document.ts';

/**
 * The first Merge Layers contract intentionally handles an adjacent pair of
 * ungrouped layers.  Rendering a non-adjacent pair or a folder member would
 * change blend order or apply folder opacity twice without a dedicated folder
 * merge command contract, so those cases stay visibly guarded at the command
 * boundary even though ordinary folder rendering is isolated.
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
