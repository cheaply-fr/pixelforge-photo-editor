import type { Frame, Layer } from './document.ts';
import {
  clippingGroupKeys,
  expandClippingGroupSelection,
} from './layerArrange.ts';
import {
  clippingGroupBase,
  isClippingSourceLayer,
  preserveClippingAfterReorder,
  validClippingRelationship,
} from './layerClipping.ts';
import { sanitizeArtboardLayerMembership } from './artboards.ts';

/*
 * Layers panel drag-and-drop and delete planning.
 *
 * `Frame.layers` is stored bottom-to-top; the panel lists it top-first. Every
 * helper here is pure: it returns a new frame (or a refusal) and never mutates
 * its inputs, so the caller commits exactly one history step per drop/delete.
 */

/** Where a dragged item lands relative to a row of the Layers panel. */
export type LayerDropTarget =
  | { kind: 'layer'; id: string; position: 'above' | 'below' }
  | { kind: 'group'; id: string; position: 'above' | 'into' };

/** What is being dragged: layer rows, or a whole folder (its header row). */
export type LayerDragSource =
  | { kind: 'layers'; ids: readonly string[] }
  | { kind: 'group'; id: string };

export type LayerDropMode =
  /** Plain stack move above or below the anchor row. */
  | 'above'
  | 'below'
  /** Into a folder (the top of its member block). */
  | 'into-folder'
  /** Between a clipping base and its clipped layers: joins that group, clipped. */
  | 'join-clipping'
  /** Would land inside a clipping group it cannot join: placed above the group. */
  | 'above-clipping-group';

export type LayerDropRefusal =
  | 'empty'
  | 'missing'
  | 'locked'
  | 'locked-folder'
  | 'onto-self'
  | 'no-change';

export type LayerDropPlan =
  | {
      ok: true;
      frame: Frame;
      mode: LayerDropMode;
      /** IDs that moved (the dragged set expanded by folder/clipping rules). */
      movedIds: string[];
      /** Row the drop was resolved against (layer name or folder name). */
      anchorName: string;
      /** Previously clipped layers that left their clipping group. */
      released: Layer[];
      /** Folder the moved layers now belong to, if any. */
      groupId?: string;
      /** Base name when the moved layers joined a clipping group. */
      clippingBaseName?: string;
    }
  | {
      ok: false;
      reason: LayerDropRefusal;
      mode?: LayerDropMode;
      anchorName?: string;
    };

const nameOf = (layer: { name?: string } | undefined, fallback = 'Untitled layer') =>
  layer?.name?.trim() || fallback;

const layerLocked = (frame: Frame, layer: Layer) =>
  Boolean(
    layer.locked ||
      (layer.groupId && frame.groups?.find((group) => group.id === layer.groupId)?.locked),
  );

/**
 * Split a panel row into drop zones. A layer row's upper half drops above the
 * layer and its lower half below. A folder header row's upper third drops
 * above the whole folder; the rest drops into the folder (at its top).
 */
export function dropPositionFromPointer(
  kind: LayerDropTarget['kind'],
  rowTop: number,
  rowHeight: number,
  pointerY: number,
): LayerDropTarget['position'] {
  const height = rowHeight > 0 ? rowHeight : 1;
  const ratio = (pointerY - rowTop) / height;
  if (kind === 'group') return ratio < 1 / 3 ? 'above' : 'into';
  return ratio < 0.5 ? 'above' : 'below';
}

/** Expand the dragged rows into the ordered stack of layers that will move. */
function movingIds(frame: Frame, source: LayerDragSource): Set<string> | undefined {
  if (source.kind === 'group') {
    const members = frame.layers.filter((layer) => layer.groupId === source.id);
    return members.length ? new Set(members.map((layer) => layer.id)) : undefined;
  }
  const known = new Set(frame.layers.map((layer) => layer.id));
  if (!source.ids.length || source.ids.some((id) => !known.has(id))) return undefined;
  // A clipping group's base carries its clipped layers along (as Arrange does).
  return expandClippingGroupSelection(frame, source.ids);
}

/**
 * Resolve a drop into a complete new frame. Rules (see
 * docs/layers-panel-interaction-contract.md):
 *
 * - The dragged rows move together, keeping their relative stack order.
 * - A dragged clipping base moves with its whole clipping group.
 * - Dropping next to a folder member puts the layers in that folder; dropping
 *   on the lower part of a folder header puts them at the top of the folder;
 *   the upper part of a folder header drops above the folder. Dropping next to
 *   a layer outside any folder takes the layers out of their folder. A dragged
 *   folder never nests: a drop inside another folder lands beside it.
 * - Dropping between a clipping base and its clipped layers joins that
 *   clipping group when every moved layer can be clipped (raster or smart
 *   object, not itself a base carrying clipped layers); otherwise the layers
 *   are placed directly above the clipping group.
 * - A clipped layer dragged out of its group is released (reported).
 * - Locked layers, layers in locked folders and locked destination folders
 *   refuse the drop.
 */
export function planLayerDrop(
  frame: Frame,
  source: LayerDragSource,
  target: LayerDropTarget,
): LayerDropPlan {
  const moving = movingIds(frame, source);
  if (!moving)
    return {
      ok: false,
      reason: source.kind === 'layers' && !source.ids.length ? 'empty' : 'missing',
    };
  const groups = frame.groups || [];
  if (source.kind === 'group' && groups.find((group) => group.id === source.id)?.locked)
    return { ok: false, reason: 'locked-folder' };
  const movers = frame.layers.filter((layer) => moving.has(layer.id));
  if (movers.some((layer) => layerLocked(frame, layer))) return { ok: false, reason: 'locked' };

  // Resolve the anchor to an insertion index in the stack without the movers.
  const rest = frame.layers.filter((layer) => !moving.has(layer.id));
  let insertAt: number; // index in `rest`: movers go between rest[insertAt - 1] and rest[insertAt]
  let groupId: string | undefined;
  let mode: LayerDropMode;
  let anchorName: string;
  if (target.kind === 'group') {
    const group = groups.find((item) => item.id === target.id);
    if (!group) return { ok: false, reason: 'missing' };
    anchorName = nameOf(group, 'Untitled group');
    if (source.kind === 'group' && source.id === group.id)
      return { ok: false, reason: 'onto-self', anchorName };
    const members = rest
      .map((layer, index) => (layer.groupId === group.id ? index : -1))
      .filter((index) => index >= 0);
    if (!members.length) {
      // Every member is being dragged: the folder stays where it is.
      return { ok: false, reason: 'no-change', anchorName };
    }
    const top = Math.max(...members);
    if (target.position === 'above' || source.kind === 'group') {
      insertAt = top + 1;
      mode = 'above';
    } else {
      if (group.locked) return { ok: false, reason: 'locked-folder', mode: 'into-folder', anchorName };
      insertAt = top + 1;
      groupId = group.id;
      mode = 'into-folder';
    }
  } else {
    if (moving.has(target.id)) {
      const anchor = frame.layers.find((layer) => layer.id === target.id);
      return { ok: false, reason: 'onto-self', anchorName: nameOf(anchor) };
    }
    const anchorIndex = rest.findIndex((layer) => layer.id === target.id);
    if (anchorIndex < 0) return { ok: false, reason: 'missing' };
    const anchor = rest[anchorIndex];
    anchorName = nameOf(anchor);
    insertAt = target.position === 'above' ? anchorIndex + 1 : anchorIndex;
    mode = target.position;
    if (anchor.groupId) {
      const group = groups.find((item) => item.id === anchor.groupId);
      if (source.kind === 'group') {
        // Folders never nest: land beside the anchor's whole folder block.
        const members = rest
          .map((layer, index) => (layer.groupId === anchor.groupId ? index : -1))
          .filter((index) => index >= 0);
        insertAt = target.position === 'above' ? Math.max(...members) + 1 : Math.min(...members);
      } else {
        if (!group) return { ok: false, reason: 'missing', anchorName };
        if (group.locked) return { ok: false, reason: 'locked-folder', mode, anchorName };
        groupId = group.id;
      }
    }
  }

  // A drop between a clipping base (or clipped layer) and the clipped layer
  // above it lands inside that clipping group.
  const keys = clippingGroupKeys({ layers: rest });
  const below = rest[insertAt - 1],
    above = rest[insertAt];
  const insideClipGroup =
    below !== undefined &&
    above !== undefined &&
    above.clippingTo !== undefined &&
    keys.get(above.id) !== undefined &&
    keys.get(above.id) === keys.get(below.id);
  let join = false;
  let clippingBaseName: string | undefined;
  if (insideClipGroup) {
    const baseId = keys.get(above.id)!;
    const base = rest.find((layer) => layer.id === baseId);
    clippingBaseName = nameOf(base);
    const beforeKeys = clippingGroupKeys(frame);
    const carriesClipped = movers.some(
      (layer) => beforeKeys.get(layer.id) === layer.id,
    );
    join =
      source.kind === 'layers' &&
      !carriesClipped &&
      movers.every((layer) => isClippingSourceLayer(layer)) &&
      below.groupId === above.groupId;
    if (join) {
      mode = 'join-clipping';
      groupId = above.groupId;
    } else {
      // Redirect directly above the clipping group's top member.
      let top = insertAt;
      while (top < rest.length && keys.get(rest[top].id) === baseId) top += 1;
      insertAt = top;
      mode = 'above-clipping-group';
      // The group may live in a folder; stay beside it in that folder only when
      // the drop was resolved into that folder.
      if (source.kind === 'group') groupId = undefined;
    }
  }

  const placed = movers.map((layer) => {
    const nextGroup = source.kind === 'group' ? layer.groupId : groupId;
    if (layer.groupId === nextGroup) return layer;
    const copy = { ...layer } as Layer;
    if (nextGroup === undefined) delete (copy as { groupId?: string }).groupId;
    else copy.groupId = nextGroup;
    return copy;
  });
  const reordered: Layer[] = [...rest.slice(0, insertAt), ...placed, ...rest.slice(insertAt)];
  const preserved = preserveClippingAfterReorder(frame, { ...frame, layers: reordered });
  let layers = [...preserved.frame.layers];
  let released = preserved.released;
  if (join) {
    // Each joined layer clips to the layer directly below it, and the clipped
    // layer above the drop is re-pointed to the top joined layer, so the group
    // keeps clipping to the same base.
    const start = insertAt;
    for (let index = start; index < start + placed.length; index += 1)
      layers[index] = { ...layers[index], clippingTo: layers[index - 1].id } as Layer;
    const aboveIndex = start + placed.length;
    if (above && layers[aboveIndex]?.id === above.id)
      layers[aboveIndex] = { ...layers[aboveIndex], clippingTo: layers[aboveIndex - 1].id } as Layer;
    const joinedIds = new Set(placed.map((layer) => layer.id));
    released = released.filter((layer) => !joinedIds.has(layer.id) && layer.id !== above?.id);
    // Validate; a link that is not valid is dropped rather than persisted.
    const checked = layers;
    layers = checked.map((layer) => {
      if (layer.clippingTo === undefined || validClippingRelationship({ layers: checked }, layer.id, layer.clippingTo))
        return layer;
      const { clippingTo: _clippingTo, ...unclipped } = layer;
      return unclipped as Layer;
    });
  }

  const usedGroups = new Set(layers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])));
  const nextGroups = frame.groups?.filter((group) => usedGroups.has(group.id));
  const unchanged =
    layers.length === frame.layers.length &&
    layers.every(
      (layer, index) =>
        layer.id === frame.layers[index].id &&
        layer.groupId === frame.layers[index].groupId &&
        layer.clippingTo === frame.layers[index].clippingTo,
    );
  if (unchanged) return { ok: false, reason: 'no-change', mode, anchorName };
  const next: Frame = {
    ...frame,
    layers,
    ...(frame.groups ? { groups: nextGroups } : {}),
  };
  return {
    ok: true,
    frame: next,
    mode,
    movedIds: placed.map((layer) => layer.id),
    anchorName,
    released,
    ...(groupId ? { groupId } : {}),
    ...(join && clippingBaseName ? { clippingBaseName } : {}),
  };
}

/** Short visible label for the insertion indicator while dragging. */
export function describeLayerDrop(plan: LayerDropPlan, frame?: Frame): string {
  if (!plan.ok) {
    switch (plan.reason) {
      case 'locked':
        return 'Locked layers cannot be moved';
      case 'locked-folder':
        return 'Locked folders cannot be changed';
      case 'onto-self':
        return 'Drop on another row';
      case 'no-change':
        return 'Already here';
      default:
        return 'Cannot drop here';
    }
  }
  const folder = plan.groupId ? frame?.groups?.find((group) => group.id === plan.groupId) : undefined;
  const inFolder = folder && plan.mode !== 'into-folder' ? ` in ${nameOf(folder, 'Untitled group')}` : '';
  switch (plan.mode) {
    case 'above':
      return `Drop above ${plan.anchorName}${inFolder}`;
    case 'below':
      return `Drop below ${plan.anchorName}${inFolder}`;
    case 'into-folder':
      return `Drop into folder ${plan.anchorName}`;
    case 'join-clipping':
      return `Drop into clipping group of ${plan.clippingBaseName ?? plan.anchorName}`;
    case 'above-clipping-group':
      return `Drop above the clipping group (cannot join it)`;
  }
}

/** Status line after a successful drop. */
export function layerDropNotice(plan: Extract<LayerDropPlan, { ok: true }>): string {
  const what = plan.movedIds.length === 1 ? 'Layer' : `${plan.movedIds.length} layers`;
  const parts = [
    plan.mode === 'join-clipping'
      ? `${what} moved into the clipping group of ${plan.clippingBaseName}`
      : plan.mode === 'into-folder'
        ? `${what} moved into folder ${plan.anchorName}`
        : plan.mode === 'above-clipping-group'
          ? `${what} placed above the clipping group (only raster or smart-object layers can join it)`
          : `${what} reordered`,
  ];
  if (plan.released.length)
    parts.push(
      `clipping mask released for ${plan.released.map((layer) => nameOf(layer, 'layer')).join(', ')}`,
    );
  return `${parts.join('; ')}. Undo restores the previous order`;
}

export type LayerDeleteRefusal = 'no-selection' | 'missing' | 'locked' | 'last-layer';

export type LayerDeletePlan =
  | {
      ok: true;
      frame: Frame;
      deleted: Layer[];
      /** Clipped layers that became unclipped (their base was deleted). */
      released: Layer[];
      /** Clipped layers re-pointed past a deleted member of their group. */
      repointed: Layer[];
    }
  | { ok: false; reason: LayerDeleteRefusal };

/**
 * Delete layers in one step. Refuses locked layers (or layers in locked
 * folders) and deleting every layer. Clipping follows the stack rules:
 * deleting a clipped member re-points the layer above it to the next
 * surviving member below (the group keeps its base); deleting a base releases
 * the lowest clipped layer, which becomes the base of the remaining clipped
 * layers. Empty folders are removed and artboard membership is cleaned.
 *
 * Selection follows Photoshop: if the active layer survives it stays active;
 * otherwise the layer directly below the lowest deleted layer becomes the
 * active, only selected layer (or the lowest remaining layer above when
 * nothing is below).
 */
export function planLayerDelete(frame: Frame, ids: readonly string[]): LayerDeletePlan {
  if (!ids.length) return { ok: false, reason: 'no-selection' };
  const remove = new Set(ids);
  const deleted = frame.layers.filter((layer) => remove.has(layer.id));
  if (deleted.length !== remove.size) return { ok: false, reason: 'missing' };
  if (deleted.some((layer) => layerLocked(frame, layer))) return { ok: false, reason: 'locked' };
  if (deleted.length >= frame.layers.length) return { ok: false, reason: 'last-layer' };
  const byId = new Map(frame.layers.map((layer) => [layer.id, layer]));
  const released: Layer[] = [];
  const repointed: Layer[] = [];
  let layers = frame.layers.filter((layer) => !remove.has(layer.id));
  layers = layers.map((layer, index) => {
    if (layer.clippingTo === undefined || !remove.has(layer.clippingTo)) return layer;
    // Follow the deleted chain down to the first surviving clipping target.
    let targetId: string | undefined = layer.clippingTo;
    while (targetId !== undefined && remove.has(targetId)) targetId = byId.get(targetId)?.clippingTo;
    const { clippingTo: _clip, ...unclipped } = layer;
    if (targetId !== undefined && layers[index - 1]?.id === targetId) {
      repointed.push(layer);
      return { ...layer, clippingTo: targetId } as Layer;
    }
    released.push(layer);
    return unclipped as Layer;
  });
  const usedGroups = new Set(layers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])));
  let active = frame.active;
  let selectedLayerIds: string[];
  if (!remove.has(active) && layers.some((layer) => layer.id === active)) {
    selectedLayerIds = [active];
  } else {
    const lowest = frame.layers.findIndex((layer) => remove.has(layer.id));
    const belowLayer = frame.layers
      .slice(0, lowest)
      .filter((layer) => !remove.has(layer.id))
      .at(-1);
    const next = belowLayer ?? layers[0];
    active = next.id;
    selectedLayerIds = [next.id];
  }
  const next: Frame = {
    ...frame,
    layers,
    ...(frame.groups ? { groups: frame.groups.filter((group) => usedGroups.has(group.id)) } : {}),
    ...(frame.artboards
      ? {
          artboards: sanitizeArtboardLayerMembership(
            frame.artboards,
            layers.map((layer) => layer.id),
          ),
        }
      : {}),
    active,
    selectedLayerIds,
  };
  return { ok: true, frame: next, deleted, released, repointed };
}

export function layerDeleteReason(reason: LayerDeleteRefusal): string {
  switch (reason) {
    case 'no-selection':
      return 'Select at least one layer before deleting';
    case 'missing':
      return 'One or more selected layers are missing';
    case 'locked':
      return 'Unlock all selected layers before deleting';
    case 'last-layer':
      return 'Keep at least one layer in the document';
  }
}

export function layerDeleteNotice(plan: Extract<LayerDeletePlan, { ok: true }>): string {
  const head =
    plan.deleted.length === 1
      ? `${nameOf(plan.deleted[0])} deleted`
      : `${plan.deleted.length} layers deleted`;
  const notes: string[] = [];
  if (plan.released.length)
    notes.push(
      `clipping mask released for ${plan.released.map((layer) => nameOf(layer)).join(', ')} (its base was deleted)`,
    );
  return `${[head, ...notes].join('; ')}. Undo restores ${plan.deleted.length === 1 ? 'it' : 'them'}.`;
}

/**
 * Stack position for a row's accessible description, counted from the top
 * of the panel: "layer 4 of 9, above Paint 2". The layer directly below in
 * the stack is named; the bottom layer says so.
 */
export function layerStackDescription(frame: Pick<Frame, 'layers'>, id: string): string {
  const index = frame.layers.findIndex((layer) => layer.id === id);
  if (index < 0) return '';
  const total = frame.layers.length;
  const position = total - index;
  const below = frame.layers[index - 1];
  return below
    ? `layer ${position} of ${total}, above ${nameOf(below)}`
    : `layer ${position} of ${total}, bottom of the stack`;
}

/**
 * Live-region text after a move: "Paint 3 moved above Paint 2, 4 of 9".
 * Several moved layers are summarized by their topmost member.
 */
export function describeLayerMove(frame: Pick<Frame, 'layers'>, movedIds: readonly string[]): string {
  const moved = new Set(movedIds);
  const indices = frame.layers
    .map((layer, index) => (moved.has(layer.id) ? index : -1))
    .filter((index) => index >= 0);
  if (!indices.length) return '';
  const total = frame.layers.length;
  const top = Math.max(...indices),
    bottom = Math.min(...indices);
  const subject =
    indices.length === 1 ? nameOf(frame.layers[top]) : `${indices.length} layers`;
  const below = frame.layers[bottom - 1];
  const where = below ? `moved above ${nameOf(below)}` : 'moved to the bottom';
  return `${subject} ${where}, ${total - top} of ${total}`;
}

/** The clipping-group base name for a clipped row, if any. */
export function clippedRowBaseName(frame: Pick<Frame, 'layers'>, layer: Layer): string | undefined {
  if (layer.clippingTo === undefined) return undefined;
  const base = clippingGroupBase(frame, layer);
  return base ? nameOf(base) : undefined;
}

/**
 * Centre an image of `width` × `height` at a document point (rounded to
 * whole pixels), as Place Embedded does. Without a point (a drop outside the
 * canvas) the image is centred in the document. Points outside the document
 * are clamped to its edge so a placed layer is never entirely off-canvas.
 */
export function placementMatrixAt(
  point: { x: number; y: number } | undefined,
  width: number,
  height: number,
  documentWidth: number,
  documentHeight: number,
): [number, number, number, number, number, number] {
  const clamp = (value: number, max: number) =>
    Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : max / 2;
  const cx = point ? clamp(point.x, documentWidth) : documentWidth / 2;
  const cy = point ? clamp(point.y, documentHeight) : documentHeight / 2;
  return [1, 0, 0, 1, Math.round(cx - width / 2) + 0, Math.round(cy - height / 2) + 0];
}

export type DroppedFileKind = 'image' | 'document' | 'project' | 'unsupported';

/**
 * Classify a dropped file. Projects open as projects and PSD/PSB open as a
 * document (flattened, as before); browser-decodable images can be placed
 * as layers. `tryDecode` comes from describeImportFormat.
 */
export function classifyDroppedFile(
  name: string,
  type: string,
  tryDecode: boolean,
  format?: string,
): DroppedFileKind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pixelforge') || lower.endsWith('.json') || type === 'application/json')
    return 'project';
  if (!tryDecode) return 'unsupported';
  if (format === 'psd') return 'document';
  return 'image';
}

/** Insertion-indicator label while files are dragged over the Layers panel. */
export function describeFileDrop(
  frame: Pick<Frame, 'layers' | 'groups'>,
  target: LayerDropTarget,
): string {
  if (target.kind === 'group') {
    const group = frame.groups?.find((item) => item.id === target.id);
    const name = nameOf(group, 'Untitled group');
    if (group?.locked && target.position === 'into') return 'Locked folders cannot be changed';
    return target.position === 'into' ? `Add into folder ${name}` : `Add above folder ${name}`;
  }
  const anchor = frame.layers.find((layer) => layer.id === target.id);
  return `Add ${target.position} ${nameOf(anchor)}`;
}
