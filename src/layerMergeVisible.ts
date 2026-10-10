import type { Frame, Group, Layer } from './document.ts';

/**
 * The immutable plan for Layer > Merge Visible.
 *
 * `Frame.layers` is the document's bottom-to-top stack.  Visible sources are
 * resolved in that order and the replacement is inserted at the highest
 * visible source slot, so hidden layers keep their exact relative position.
 * Group visibility participates in the source set, while the replacement is
 * always a root layer: a flattened composite must not inherit a folder's
 * opacity or blend mode a second time.
 */
export type MergeVisiblePlan =
  | {
      ok: true;
      visibleLayerIds: string[];
      visibleIndices: number[];
      firstVisibleIndex: number;
      lastVisibleIndex: number;
      visibleGroupIds: string[];
    }
  | {
      ok: false;
      reason: 'no-visible-layers' | 'missing-group';
    };

/** Backwards-friendly alias for callers that name the operation by its layer. */
export type LayerMergeVisiblePlan = MergeVisiblePlan;

/** Resolve a pure, deterministic Merge Visible plan without reading assets. */
export function planMergeVisible(frame: Frame): MergeVisiblePlan {
  const groups = new Map<string, Group>(
    (frame.groups ?? []).map((group) => [group.id, group]),
  );
  const visibleIndices: number[] = [];
  const visibleGroupIds: string[] = [];
  const seenGroups = new Set<string>();
  for (const [index, layer] of frame.layers.entries()) {
    if (!layer.visible) continue;
    if (layer.groupId) {
      const group = groups.get(layer.groupId);
      if (!group) return { ok: false, reason: 'missing-group' };
      if (!group.visible) continue;
      if (!seenGroups.has(group.id)) {
        seenGroups.add(group.id);
        visibleGroupIds.push(group.id);
      }
    }
    visibleIndices.push(index);
  }
  if (!visibleIndices.length) return { ok: false, reason: 'no-visible-layers' };
  return {
    ok: true,
    visibleLayerIds: visibleIndices.map((index) => frame.layers[index].id),
    visibleIndices,
    firstVisibleIndex: visibleIndices[0],
    lastVisibleIndex: visibleIndices[visibleIndices.length - 1],
    visibleGroupIds,
  };
}

/** Alias matching the existing layer-merge planner naming convention. */
export const planLayerMergeVisible = planMergeVisible;

function cloneLayer(layer: Layer): Layer {
  // Layer records contain editable nested metadata (adjustments, styles and
  // masks). Clone those records before putting the replacement into history so
  // callers cannot mutate the source frame through the returned frame.
  return structuredClone(layer);
}

function cloneGroup(group: Group): Group {
  return { ...group };
}

/**
 * Apply an approved Merge Visible plan without mutating the input frame.
 *
 * Explicit artboards receive the replacement only when they contain every
 * visible source. An artboard containing a subset cannot safely receive a
 * full-document composite because that would leak layers outside its bounded
 * membership. Partial source IDs are still removed, while hidden/unrelated
 * membership remains in its original order.
 */
export function applyMergeVisible(
  frame: Frame,
  plan: Extract<MergeVisiblePlan, { ok: true }>,
  merged: Layer,
): Frame {
  const visible = new Set(plan.visibleLayerIds);
  const mergedRoot = { ...merged };
  delete mergedRoot.groupId;
  const replacement = cloneLayer(mergedRoot);
  const layers: Layer[] = [];
  for (const [index, layer] of frame.layers.entries()) {
    if (index === plan.lastVisibleIndex) layers.push(replacement);
    if (!visible.has(layer.id)) layers.push(cloneLayer(layer));
  }

  // Keep folders that still contain hidden members. Remove only empty folders,
  // and clone records so the original frame remains history-safe.
  const usedGroups = new Set(
    layers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
  );
  const groups = frame.groups
    ?.filter((group) => usedGroups.has(group.id))
    .map(cloneGroup);

  const artboards = frame.artboards?.map((artboard) => {
    if (artboard.layerIds === undefined) return { ...artboard };
    const membership = [...artboard.layerIds];
    const selectedPositions = membership
      .map((id, index) => (visible.has(id) ? index : -1))
      .filter((index) => index >= 0);
    if (!selectedPositions.length) return { ...artboard, layerIds: membership };
    const remaining = membership.filter((id) => !visible.has(id));
    // A full membership can be replaced by the composite at the first source
    // position. Partial membership intentionally omits it (see contract).
    if (selectedPositions.length === plan.visibleLayerIds.length) {
      remaining.splice(selectedPositions[0], 0, replacement.id);
    }
    return { ...artboard, layerIds: remaining };
  });
  return {
    ...frame,
    layers,
    ...(groups ? { groups } : {}),
    ...(artboards ? { artboards } : {}),
    active: replacement.id,
    selectedLayerIds: [replacement.id],
  };
}

/** Alias matching the selected-layer merge helper naming convention. */
export const applyLayerMergeVisible = applyMergeVisible;

export function mergeVisibleReason(
  reason: Exclude<MergeVisiblePlan, { ok: true }>['reason'],
): string {
  switch (reason) {
    case 'no-visible-layers':
      return 'There are no visible layers to merge';
    case 'missing-group':
      return 'One or more layers reference a missing group';
  }
}

/** Alias for UI callers that use the Layer command terminology. */
export const layerMergeVisibleReason = mergeVisibleReason;
