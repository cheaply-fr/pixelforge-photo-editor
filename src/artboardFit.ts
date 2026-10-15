import { layerLocalBounds } from './canvasSize.ts';
import { planFramePlacement, type FrameFit } from './cropTools.ts';
import type { Assets, Frame, Layer, Matrix } from './document.ts';
import { resolveArtboard } from './artboardRender.ts';

export type { FrameFit } from './cropTools.ts';

/** Fit an editable layer's painted bounds into a named artboard. */
export function fitLayerMatrixToArtboard(
  layer: Layer,
  artboard: { x: number; y: number; w: number; h: number },
  assets: Assets,
  fit: FrameFit = 'cover',
): Matrix {
  if (layer.kind === 'adjustment') throw new Error('Adjustment layers cannot be fitted into an artboard');
  const bounds = layerLocalBounds(layer, assets);
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error('The active layer has no painted bounds');
  const placement = planFramePlacement({
    x: artboard.x,
    y: artboard.y,
    width: artboard.w,
    height: artboard.h,
    sourceWidth: bounds.width,
    sourceHeight: bounds.height,
    fit,
  });
  return [
    placement.matrix[0],
    0,
    0,
    placement.matrix[3],
    placement.matrix[4] - bounds.x * placement.matrix[0],
    placement.matrix[5] - bounds.y * placement.matrix[3],
  ];
}

/**
 * Fit one unlocked editable layer and make it an explicit artboard member.
 * The returned frame is detached and safe to place in the normal history
 * pipeline; source assets and the original frame remain untouched.
 */
export function fitLayerToArtboard(
  frame: Frame,
  assets: Assets,
  artboardId: string,
  layerId: string,
  fit: FrameFit = 'cover',
): Frame {
  const artboard = resolveArtboard(frame, artboardId);
  if (artboard.locked) throw new Error('The selected artboard is locked');
  const layer = frame.layers.find((item) => item.id === layerId);
  if (!layer) throw new Error('The selected layer does not exist');
  if (layer.locked) throw new Error('The selected layer is locked');
  const matrix = fitLayerMatrixToArtboard(layer, artboard, assets, fit);
  const artboards = (frame.artboards ?? []).map((item) =>
    item.id === artboard.id
      ? { ...item, layerIds: [...new Set([...(item.layerIds ?? []), layer.id])] }
      : { ...item, ...(item.layerIds ? { layerIds: [...item.layerIds] } : {}) },
  );
  return {
    ...frame,
    layers: frame.layers.map((item) => item.id === layer.id ? { ...item, matrix } : { ...item }),
    artboards,
    activeArtboardId: artboard.id,
  };
}
