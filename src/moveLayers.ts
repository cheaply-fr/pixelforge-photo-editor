/**
 * Which layers a Move tool drag moves, and the translation itself
 * (docs/layer-selection-contract.md, docs/layer-links-contract.md).
 *
 * A drag moves the active layer together with every other selected layer
 * (when the active layer is part of the selection) and every layer linked to
 * any of those through `layerLinkId`. Each moved layer gets the same
 * document-space translation; nothing else about it changes. Pure.
 */
import type { Frame, Layer, Matrix } from './document.ts';

/** Ids of the layers a drag on `activeId` moves, in stack order. */
export function moveLayerIds(frame: Pick<Frame, 'layers' | 'selectedLayerIds'>, activeId: string): string[] {
  const exists = (id: string) => frame.layers.some((layer) => layer.id === id);
  if (!exists(activeId)) return [];
  const selected = (frame.selectedLayerIds ?? [activeId]).filter(exists);
  const members = new Set(selected.includes(activeId) ? selected : [activeId]);
  const links = new Set(
    frame.layers.filter((layer) => members.has(layer.id) && layer.layerLinkId !== undefined).map((layer) => layer.layerLinkId),
  );
  return frame.layers
    .filter((layer) => members.has(layer.id) || (layer.layerLinkId !== undefined && links.has(layer.layerLinkId)))
    .map((layer) => layer.id);
}

/** `layers` with every layer in `ids` translated by (dx, dy) document pixels. */
export function translateLayers<T extends Pick<Layer, 'id' | 'matrix'>>(layers: readonly T[], ids: readonly string[], dx: number, dy: number): T[] {
  const moving = new Set(ids);
  return layers.map((layer) => {
    if (!moving.has(layer.id)) return layer;
    const matrix = [...layer.matrix] as Matrix;
    matrix[4] += dx;
    matrix[5] += dy;
    return { ...layer, matrix };
  });
}
