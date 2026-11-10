/**
 * Pick a layer from the canvas: the topmost visible layer with a
 * non-transparent pixel under a document point (Move tool "Auto-select
 * layer" and the canvas "Select layer at point" action).
 *
 * The decision is pure (`pickLayerAt`) over an alpha sampler. The browser
 * sampler reads exactly one pixel per layer: a plain paint layer decodes only
 * the 256 px tile under the point (or its small PNG), and every other kind
 * (type, shapes, Smart Objects, fills) is rendered alone into a 1 x 1 frame
 * translated to the point, so a large document never renders in full.
 * Adjustment layers hold no pixels of their own and are never picked; a
 * clipped layer shows only where its clipping base has pixels; a layer mask
 * hides the pixels it masks out.
 */
import {
  decodeAsset,
  inversePoint,
  renderFrame,
  type Assets,
  type Frame,
  type Layer,
} from './document.ts';
import { effectiveLayerMask } from './masks.ts';
import { clippingGroupBase } from './layerClipping.ts';
import { isTiledAsset, tileGrid, tileRect, TILE_SIZE, type AnyAsset } from './tiledAssets.ts';

type PickLayer = {
  id: string;
  kind: string;
  visible: boolean;
  opacity: number;
  groupId?: string;
  clippingTo?: string;
};
type PickFrame = {
  layers: readonly PickLayer[];
  groups?: readonly { id: string; visible?: boolean; opacity?: number }[];
};

/**
 * Layers that can be picked, topmost first: visible, above 0% opacity, in a
 * visible folder above 0% opacity, and not adjustment layers.
 */
export function layerPickOrder<L extends PickLayer>(frame: { layers: readonly L[]; groups?: PickFrame['groups'] }): L[] {
  const groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  return frame.layers
    .filter((layer) => {
      if (!layer.visible || !(layer.opacity > 0) || layer.kind === 'adjustment') return false;
      const group = layer.groupId ? groups.get(layer.groupId) : undefined;
      return !group || (group.visible !== false && (group.opacity ?? 1) > 0);
    })
    .reverse();
}

/**
 * The id of the topmost pickable layer whose sampled alpha at the point is
 * above zero, or undefined. `alphaAt` returns the layer's own alpha (0-255)
 * at the point; `clipBase` names the base a clipped layer shows through.
 */
export async function pickLayerAt<L extends PickLayer>(
  frame: { layers: readonly L[]; groups?: PickFrame['groups'] },
  alphaAt: (layer: L) => Promise<number>,
  clipBase: (layer: L) => L | undefined = () => undefined,
): Promise<string | undefined> {
  const memo = new Map<string, Promise<number>>();
  const alpha = (layer: L) => {
    let value = memo.get(layer.id);
    if (!value) memo.set(layer.id, (value = alphaAt(layer).catch(() => 0)));
    return value;
  };
  for (const layer of layerPickOrder(frame)) {
    if ((await alpha(layer)) <= 0) continue;
    const base = layer.clippingTo !== undefined ? clipBase(layer) : undefined;
    if (base && (!base.visible || !(base.opacity > 0) || (await alpha(base)) <= 0)) continue;
    return layer.id;
  }
  return undefined;
}

/** Index of the tile holding a pixel of a tiled asset, or -1 outside it. */
export function tileIndexAt(asset: { w: number; h: number }, x: number, y: number): number {
  const px = Math.floor(x),
    py = Math.floor(y);
  if (px < 0 || py < 0 || px >= asset.w || py >= asset.h) return -1;
  const { cols } = tileGrid(asset.w, asset.h);
  return Math.floor(py / TILE_SIZE) * cols + Math.floor(px / TILE_SIZE);
}

// ---- Browser sampling -------------------------------------------------------

const pixelAlpha = (source: CanvasImageSource, x: number, y: number): number => {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(source, -Math.floor(x), -Math.floor(y));
  return context.getImageData(0, 0, 1, 1).data[3];
};

/** Alpha (0-255) of an asset's pixel at asset coordinates. */
async function assetAlphaAt(asset: AnyAsset | undefined, x: number, y: number): Promise<number> {
  if (!asset) return 0;
  if (Math.floor(x) < 0 || Math.floor(y) < 0 || Math.floor(x) >= asset.w || Math.floor(y) >= asset.h) return 0;
  if (isTiledAsset(asset)) {
    const index = tileIndexAt(asset, x, y),
      tile = index >= 0 ? asset.tiles[index] : null;
    if (!tile) return 0;
    const rect = tileRect(asset.w, asset.h, index);
    const bitmap = await createImageBitmap(tile.blob);
    try {
      return pixelAlpha(bitmap, x - rect.x, y - rect.y);
    } finally {
      bitmap.close();
    }
  }
  return pixelAlpha(await decodeAsset(asset), x, y);
}

/** The visible alpha (0-255) a layer contributes at a document point. */
export async function sampleLayerAlpha(
  layer: Layer,
  frame: Pick<Frame, 'w' | 'h' | 'colorMode'>,
  point: { x: number; y: number },
  assets: Assets,
): Promise<number> {
  if (point.x < 0 || point.y < 0 || point.x >= frame.w || point.y >= frame.h) return 0;
  let alpha: number;
  const plainRaster =
    layer.kind === 'raster' &&
    layer.fillColor === undefined &&
    !layer.styles &&
    !layer.vectorMask &&
    !layer.smartFilters?.length;
  if (plainRaster) {
    const local = inversePoint(layer.matrix, point);
    alpha = local ? await assetAlphaAt(assets[layer.asset], local.x, local.y) : 0;
  } else {
    // Render the layer alone into a 1 x 1 frame whose origin is the point.
    const [a, b, c, d, e, f] = layer.matrix;
    const shifted = {
      ...layer,
      matrix: [a, b, c, d, e - Math.floor(point.x), f - Math.floor(point.y)],
      opacity: 1,
      blend: 'source-over',
      groupId: undefined,
      clippingTo: undefined,
      mask: undefined,
    } as Layer;
    const single = await renderFrame(
      { ...(frame as Frame), w: 1, h: 1, layers: [shifted], groups: [], active: layer.id, selection: undefined },
      assets,
      undefined,
      { layerFilterCache: null, filterPool: null },
    );
    alpha = single.getContext('2d')!.getImageData(0, 0, 1, 1).data[3];
  }
  if (alpha > 0 && 'mask' in layer && layer.mask) {
    const settings = effectiveLayerMask({ enabled: layer.maskEnabled, inverted: layer.maskInverted });
    if (settings.enabled) {
      const mask = await assetAlphaAt(assets[layer.mask], point.x, point.y);
      if ((settings.inverted ? 255 - mask : mask) <= 0) return 0;
    }
  }
  return alpha;
}

/** The topmost visible layer with a non-transparent pixel at a document point. */
export function pickLayerAtPoint(frame: Frame, point: { x: number; y: number }, assets: Assets): Promise<string | undefined> {
  return pickLayerAt(
    frame,
    (layer) => sampleLayerAlpha(layer, frame, point, assets),
    (layer) => clippingGroupBase(frame, layer),
  );
}
