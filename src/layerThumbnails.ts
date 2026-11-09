/**
 * Small, lazily updated thumbnails for raster rows of the Layers panel.
 *
 * A thumbnail shows the layer's own pixels placed in the document (its
 * transform applied), scaled to fit a small box with the document's aspect
 * ratio. It is drawn straight from the stored asset, never through the full
 * renderer: a tiled asset decodes each 256 px tile at its reduced size, so a
 * 10 MP layer costs a few kilobytes of pixels. Layer styles, filters, masks
 * and blend modes are not shown; other layer kinds keep their type glyph.
 *
 * Thumbnails are keyed by the asset's content fingerprint, the transform and
 * the fill colour, so an unchanged layer is never redrawn. Rows request one
 * only while on screen, after a short idle delay, one layer at a time, and
 * results live in a small LRU cache shared by every panel.
 */
import { assetFingerprint } from './layerFilterCache.ts';
import { decodeAsset } from './document.ts';
import { isTiledAsset, tileRect, type AnyAsset } from './tiledAssets.ts';

/** Longest side of a thumbnail in CSS pixels. */
export const LAYER_THUMBNAIL_BOX = 28;
/** Device-pixel scale of the thumbnail bitmap (sharp on 2x screens). */
export const LAYER_THUMBNAIL_SCALE = 2;
/** Thumbnails kept in memory (each is a tiny PNG data URL). */
export const LAYER_THUMBNAIL_CACHE_LIMIT = 256;
/** Wait after the last change before a row redraws its thumbnail. */
export const LAYER_THUMBNAIL_DELAY_MS = 300;

export type ThumbnailLayer = {
  kind: string;
  asset?: string;
  fillColor?: string;
  matrix?: readonly number[];
};

/** Thumbnail bitmap size for a document, keeping its aspect ratio. */
export function layerThumbnailSize(
  w: number,
  h: number,
  box = LAYER_THUMBNAIL_BOX * LAYER_THUMBNAIL_SCALE,
): { w: number; h: number } {
  const width = Math.max(1, Math.trunc(w) || 1),
    height = Math.max(1, Math.trunc(h) || 1),
    side = Math.max(1, Math.trunc(box));
  const scale = side / Math.max(width, height);
  return {
    w: Math.max(1, Math.round(width * scale)),
    h: Math.max(1, Math.round(height * scale)),
  };
}

/** True for layers drawn from stored pixels (the rows that get a thumbnail). */
export function layerHasThumbnail(layer: ThumbnailLayer): boolean {
  return layer.kind === 'raster' && typeof layer.asset === 'string';
}

/**
 * The cache key of a layer's thumbnail, or undefined when it has none (not a
 * raster layer, or its asset is missing). Equal keys mean equal thumbnails.
 */
export function layerThumbnailKey(
  layer: ThumbnailLayer,
  frame: { w: number; h: number },
  assets: Readonly<Record<string, AnyAsset | undefined>>,
): string | undefined {
  if (!layerHasThumbnail(layer)) return undefined;
  const asset = assets[layer.asset!];
  if (!asset) return undefined;
  const matrix = (layer.matrix ?? [1, 0, 0, 1, 0, 0]).map((value) => Math.round(value * 1000) / 1000).join(',');
  const content = layer.fillColor ? `fill:${layer.fillColor}:${asset.w}x${asset.h}` : assetFingerprint(asset);
  return `${frame.w}x${frame.h}|${matrix}|${content}`;
}

/**
 * The tiles of a tiled asset worth decoding for a thumbnail: non-empty
 * tiles with their layer-space rectangle and the reduced size to decode them
 * at (at least 1 px, at most the tile itself).
 */
export function thumbnailTilePlan(
  asset: { w: number; h: number; tiles: readonly ({ blob: Blob } | null)[] },
  scale: number,
): { index: number; x: number; y: number; w: number; h: number; decodeW: number; decodeH: number }[] {
  const plan = [];
  for (const [index, tile] of asset.tiles.entries()) {
    if (!tile) continue;
    const rect = tileRect(asset.w, asset.h, index);
    plan.push({
      index,
      ...rect,
      decodeW: Math.max(1, Math.min(rect.w, Math.ceil(rect.w * scale))),
      decodeH: Math.max(1, Math.min(rect.h, Math.ceil(rect.h * scale))),
    });
  }
  return plan;
}

/** Scale from layer pixels to thumbnail pixels for a layer transform. */
export function thumbnailLayerScale(matrix: readonly number[] | undefined, frameToThumb: number): number {
  const [a = 1, b = 0, c = 0, d = 1] = matrix ?? [];
  const stretch = Math.max(Math.hypot(a, b), Math.hypot(c, d), 1e-6);
  return Math.min(1, Math.max(1e-4, stretch * frameToThumb));
}

/** Bounded insertion-ordered LRU of finished thumbnails. */
export class ThumbnailCache<V> {
  private readonly entries = new Map<string, V>();
  readonly limit: number;
  constructor(limit = LAYER_THUMBNAIL_CACHE_LIMIT) {
    this.limit = limit;
  }
  get(key: string): V | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }
  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > Math.max(1, this.limit)) this.entries.delete(this.entries.keys().next().value!);
  }
  get size(): number {
    return this.entries.size;
  }
}

// ---- Browser drawing --------------------------------------------------------

const cache = new ThumbnailCache<string>();
const pending = new Map<string, Promise<string | undefined>>();
let queue: Promise<unknown> = Promise.resolve();

/** A finished thumbnail for this key, if one is cached. */
export function cachedLayerThumbnail(key: string): string | undefined {
  return cache.get(key);
}

async function drawThumbnail(
  layer: ThumbnailLayer,
  frame: { w: number; h: number },
  asset: AnyAsset,
): Promise<string | undefined> {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return undefined;
  const size = layerThumbnailSize(frame.w, frame.h);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const frameToThumb = size.w / Math.max(1, frame.w);
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = layer.matrix ?? [];
  context.setTransform(a * frameToThumb, b * frameToThumb, c * frameToThumb, d * frameToThumb, e * frameToThumb, f * frameToThumb);
  context.imageSmoothingQuality = 'medium';
  if (layer.fillColor) {
    context.fillStyle = layer.fillColor;
    context.fillRect(0, 0, asset.w, asset.h);
  } else {
    const scale = thumbnailLayerScale(layer.matrix, frameToThumb);
    if (isTiledAsset(asset)) {
      for (const tile of thumbnailTilePlan(asset, scale)) {
        const bitmap = await createImageBitmap(asset.tiles[tile.index]!.blob, {
          resizeWidth: tile.decodeW,
          resizeHeight: tile.decodeH,
          resizeQuality: 'medium',
        });
        context.drawImage(bitmap, tile.x, tile.y, tile.w, tile.h);
        bitmap.close();
        // Stay responsive while a large layer decodes.
        if (tile.index % 32 === 31) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } else {
      // Small PNG assets decode through the renderer's cached image decoder
      // (fetching a data: URL would be refused by the page's connect-src).
      context.drawImage(await decodeAsset(asset), 0, 0, asset.w, asset.h);
    }
  }
  return canvas.toDataURL('image/png');
}

/**
 * Draw (or reuse) a layer's thumbnail. Requests run one at a time so a long
 * Layers panel never decodes many layers at once; a request whose `isStale`
 * turns true before its turn is skipped.
 */
export function requestLayerThumbnail(
  key: string,
  layer: ThumbnailLayer,
  frame: { w: number; h: number },
  asset: AnyAsset,
  isStale: () => boolean = () => false,
): Promise<string | undefined> {
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const running = pending.get(key);
  if (running) return running;
  const job = queue.then(async () => {
    if (isStale()) return undefined;
    try {
      const url = await drawThumbnail(layer, frame, asset);
      if (url) cache.set(key, url);
      return url;
    } catch {
      // A thumbnail is a convenience: a decode failure keeps the type glyph.
      return undefined;
    } finally {
      pending.delete(key);
    }
  });
  pending.set(key, job);
  queue = job.catch(() => undefined);
  return job;
}
