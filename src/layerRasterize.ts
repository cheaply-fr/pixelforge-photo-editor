import { commonLayer, neutral, type Layer } from './document.ts';
import { isNeutralLayerStyles } from './layerStyles.ts';

/**
 * The single-layer source handed to the renderer when rasterizing. It renders
 * opaque and unblended (opacity and blend stay live on the result), without
 * layer styles (kept editable on the result) and without its clipping link
 * (the clipping relationship is kept on the result instead of being baked).
 * Masks, smart filters and filter adjustments are baked into the pixels.
 */
export function rasterizeRenderSource(layer: Layer): Layer {
  const { clippingTo: _clippingTo, ...withoutClipping } = layer;
  return {
    ...withoutClipping,
    visible: true,
    opacity: 1,
    blend: 'source-over',
    adjustments: layer.adjustments,
    styles: undefined,
  } as Layer;
}

/**
 * Build the raster layer that replaces `source` after Rasterize / Rasterize
 * Type Layer. The layer keeps its ID, name, folder, visibility, lock,
 * opacity, blend, non-neutral layer styles, clipping relationship and transform
 * link, so the stack and every relationship that names the layer survive.
 */
export function rasterizedLayer(source: Layer, asset: string): Layer {
  const keptStyles = isNeutralLayerStyles(source.styles) ? undefined : source.styles;
  return {
    ...commonLayer(source.name),
    id: source.id,
    kind: 'raster',
    asset,
    opacity: source.opacity,
    blend: source.blend,
    visible: source.visible,
    locked: source.locked,
    adjustments: { ...neutral },
    groupId: source.groupId,
    ...(keptStyles ? { styles: keptStyles } : {}),
    ...(source.clippingTo !== undefined ? { clippingTo: source.clippingTo } : {}),
    ...(source.layerLinkId !== undefined ? { layerLinkId: source.layerLinkId } : {}),
  };
}
