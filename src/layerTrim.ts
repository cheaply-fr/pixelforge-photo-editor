import { findTrimBounds, type PixelBounds } from './canvasSize.ts';
import type { Layer, Matrix } from './document.ts';
import { effectiveFilterEffects, isNeutralFilterEffects } from './filterEffects.ts';
import { isNeutralLayerStyles } from './layerStyles.ts';

/**
 * Raster layers can be stored at their non-transparent bounding box and
 * positioned through the layer matrix. These helpers keep the geometry pure
 * so the editor, tests and docs agree on exactly what Trim Layer to Content
 * and the paint-time expansion do.
 */

/** Largest raster asset the document model accepts (see validAsset). */
export const MAX_LAYER_ASSET_SIDE = 16000;
export const MAX_LAYER_ASSET_PIXELS = 16000000;

export type LayerTrimPlan = {
  /** Source rectangle, in current asset pixels, that holds every visible pixel. */
  crop: PixelBounds;
  /** Matrix placing the cropped asset where the source pixels were. */
  matrix: Matrix;
  /** Pixels the layer stops consuming from the layer pixel budget. */
  savedPixels: number;
  /** The layer had no visible pixel; it is stored as a single transparent pixel. */
  empty: boolean;
};

export type LayerExpansionPlan = {
  /** New asset size. */
  w: number;
  h: number;
  /** Where the current asset is drawn inside the new asset. */
  offsetX: number;
  offsetY: number;
  /** Matrix placing the expanded asset in document space. */
  matrix: Matrix;
};

/**
 * Cleanup metadata (healing strokes, patches, content-aware operations), a
 * vector mask and smart/live filters are stored in, or rendered over,
 * layer-asset coordinates. Moving the asset origin would shift that data, so
 * the paint-time expansion only handles plain raster pixel layers.
 */
export function canExpandRasterLayer(layer: Layer): boolean {
  return (
    layer.kind === 'raster' &&
    layer.fillColor === undefined &&
    layer.vectorMask === undefined &&
    !layer.spotHealing?.length &&
    !layer.patchStrokes?.length &&
    !layer.contentAwareFills?.length &&
    !layer.contentAwareMoves?.length &&
    !layer.contentAwareScales?.length &&
    !layer.smartFilters?.length &&
    isNeutralFilterEffects(effectiveFilterEffects(layer.adjustments?.filterEffects))
  );
}

/**
 * Trim additionally requires an integer translation (so painting can expand
 * the layer again) and no layer styles, whose shadows and glows are rendered
 * over the asset rectangle and would be clipped by a tighter asset.
 */
export function canTrimRasterLayer(layer: Layer): boolean {
  return (
    canExpandRasterLayer(layer) &&
    integerTranslation(layer.matrix) &&
    isNeutralLayerStyles(layer.styles)
  );
}

/** Compose a local translation onto an affine layer matrix. */
export function translateLocal(matrix: Matrix, x: number, y: number): Matrix {
  const [a, b, c, d, e, f] = matrix;
  return [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
}

/**
 * Plan storing a raster layer at its non-transparent bounding box. Returns
 * null when the layer already fits its content (nothing to save).
 */
export function planLayerTrim(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  matrix: Matrix,
  margin = 0,
): LayerTrimPlan | null {
  const tight = findTrimBounds(pixels, width, height, { mode: 'transparent' });
  // An optional transparent margin (clamped to the asset) keeps room for
  // effects that render just outside the content, such as a layer style
  // shadow or outline added later.
  const pad = Math.max(0, Math.floor(margin));
  const bounds = tight && pad
    ? (() => {
        const x = Math.max(0, tight.x - pad),
          y = Math.max(0, tight.y - pad);
        return {
          x,
          y,
          width: Math.min(width, tight.x + tight.width + pad) - x,
          height: Math.min(height, tight.y + tight.height + pad) - y,
        };
      })()
    : tight;
  if (!bounds) {
    if (width === 1 && height === 1) return null;
    return {
      crop: { x: 0, y: 0, width: 1, height: 1 },
      matrix,
      savedPixels: width * height - 1,
      empty: true,
    };
  }
  if (bounds.width === width && bounds.height === height) return null;
  return {
    crop: bounds,
    matrix: translateLocal(matrix, bounds.x, bounds.y),
    savedPixels: width * height - bounds.width * bounds.height,
    empty: false,
  };
}

export function integerTranslation(matrix: Matrix): boolean {
  return (
    matrix[0] === 1 &&
    matrix[1] === 0 &&
    matrix[2] === 0 &&
    matrix[3] === 1 &&
    Number.isInteger(matrix[4]) &&
    Number.isInteger(matrix[5])
  );
}

/**
 * Plan growing an integer-positioned raster layer so it covers at least the
 * whole document before a paint tool touches it. The result is the union of
 * the current layer bounds and the canvas, so pixels already outside the
 * canvas are kept. Returns null when the layer already covers the canvas, is
 * rotated/scaled/sub-pixel positioned (painting keeps its existing behaviour),
 * or the union would exceed the per-asset limit.
 */
export function planLayerExpansion(
  assetWidth: number,
  assetHeight: number,
  matrix: Matrix,
  documentWidth: number,
  documentHeight: number,
): LayerExpansionPlan | null {
  if (!integerTranslation(matrix)) return null;
  const left = matrix[4],
    top = matrix[5],
    right = left + assetWidth,
    bottom = top + assetHeight;
  if (left <= 0 && top <= 0 && right >= documentWidth && bottom >= documentHeight)
    return null;
  const x = Math.min(0, left),
    y = Math.min(0, top),
    w = Math.max(documentWidth, right) - x,
    h = Math.max(documentHeight, bottom) - y;
  if (
    w > MAX_LAYER_ASSET_SIDE ||
    h > MAX_LAYER_ASSET_SIDE ||
    w * h > MAX_LAYER_ASSET_PIXELS
  )
    return null;
  return {
    w,
    h,
    offsetX: left - x,
    offsetY: top - y,
    matrix: [1, 0, 0, 1, x, y],
  };
}

/** Tools that write pixels into the active raster layer and expand trimmed layers first. */
export const EXPANDING_PAINT_TOOLS: readonly string[] = [
  'brush',
  'pencil',
  'eraser',
  'background-eraser',
  'magic-eraser',
  'fill',
  'gradient',
  'color-replace',
  'clone',
  'heal',
  'pattern-stamp',
  'smudge',
  'dodge',
  'burn',
  'sponge',
  'blur',
  'sharpen',
  'mixer-brush',
  // Local cleanup and history tools also act on the full canvas. Spot Healing
  // and Patch store metadata in asset coordinates, so the layer is expanded
  // before that metadata exists and is no longer trimmed afterwards.
  'spot-heal',
  'patch',
  'red-eye',
  'history-brush',
  'art-history-brush',
];

/**
 * Offset at which a History/Art History source snapshot of the same layer is
 * drawn into the current asset, so a layer stored at different bounds in the
 * snapshot (trimmed, expanded or moved) still lines up in document space.
 * Null when either placement is not an integer translation.
 */
export function historySourceOffset(
  currentMatrix: Matrix,
  sourceMatrix: Matrix,
): { x: number; y: number } | null {
  if (!integerTranslation(currentMatrix) || !integerTranslation(sourceMatrix)) return null;
  return { x: sourceMatrix[4] - currentMatrix[4], y: sourceMatrix[5] - currentMatrix[5] };
}

/**
 * Transparent margin kept around automatically stored content, so layer styles
 * (shadows, outlines) and small blurs added later are not clipped at the
 * stored bounds. Trim Layer to Content stays tight.
 */
export const AUTO_TRIM_MARGIN = 64;

/** Minimal frame shape the automatic storage planner reads. */
export type AutoTrimFrame = { w: number; h: number; layers: readonly Layer[] };
type AssetSize = { w: number; h: number };

/** True when an integer-positioned layer's stored bounds contain the whole canvas. */
export function coversCanvas(
  asset: AssetSize,
  matrix: Matrix,
  documentWidth: number,
  documentHeight: number,
): boolean {
  return (
    !integerTranslation(matrix) ||
    (matrix[4] <= 0 &&
      matrix[5] <= 0 &&
      matrix[4] + asset.w >= documentWidth &&
      matrix[5] + asset.h >= documentHeight)
  );
}

/**
 * Raster layers the newest history step painted that are stored at their
 * content bounds automatically. A layer qualifies when its asset changed in
 * this step and it was already in the stored-bounds regime: before the step
 * it did not cover the canvas (a new empty paint layer, a trimmed or moved
 * layer) or the previous step was the paint-time expansion of this layer
 * (`expandedLayerId`), or the step baked a layer whose styles or filters made
 * it untrimmable (Rasterize, smart-filter flatten). Full-canvas layers such as an opened photo keep their
 * storage, so opening or editing a project never rewrites them, and assets
 * already known to fit their content are skipped.
 */
export function autoTrimCandidates(
  top: AutoTrimFrame,
  previous: AutoTrimFrame | undefined,
  assets: Readonly<Record<string, AssetSize | undefined>>,
  known: ReadonlySet<string>,
  expandedLayerId?: string,
): string[] {
  if (!previous) return [];
  const before = new Map(previous.layers.map((layer) => [layer.id, layer]));
  const ids: string[] = [];
  for (const layer of top.layers) {
    if (layer.kind !== 'raster' || !canTrimRasterLayer(layer)) continue;
    const asset = assets[layer.asset];
    if (!asset || (asset.w === 1 && asset.h === 1) || known.has(layer.asset)) continue;
    const prior = before.get(layer.id);
    if (!prior || prior.kind !== 'raster' || prior.asset === layer.asset) continue;
    const priorAsset = assets[prior.asset];
    if (
      layer.id !== expandedLayerId &&
      // Baking a layer's styles or filters (Rasterize) is a new storage decision.
      canTrimRasterLayer(prior) &&
      (!priorAsset || coversCanvas(priorAsset, prior.matrix, previous.w, previous.h))
    )
      continue;
    ids.push(layer.id);
  }
  return ids;
}

