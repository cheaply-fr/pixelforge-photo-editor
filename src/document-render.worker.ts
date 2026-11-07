import {
  renderFrame,
  validateFrame,
  clearDecodedAssetCache,
  primeDecodedAssetPixels,
  releaseRetiredDecodedAssets,
  type Assets,
  type Frame,
} from './document.ts';
import type {
  TiledNeighborhoodProgress,
  TiledRenderTelemetry,
} from './tiledDocument.ts';
import type { FilterBandProgress } from './filterBands.ts';
import { TILE_MAX_BATCH_BYTES } from './tilePlan.ts';
import { CompositeCache } from './compositeCache.ts';
import { resolveRequestAssets, retainedAssetStore } from './workerAssets.ts';
import {
  clearLayerFilterCache,
  layerFilterCacheDelta,
  primeAssetFingerprints,
  sharedLayerFilterCache,
  type LayerFilterCacheStats,
} from './layerFilterCache.ts';

type RenderRequest = {
  kind: 'render';
  id: number;
  frame: Frame;
  assets: Assets;
  /** Optional bounded temporary-byte budget for eligible tile effects. */
  tiledMaxWorkingBytes?: number;
  /** Main-thread content fingerprints, so the worker need not rehash data URLs. */
  assetKeys?: Record<string, string>;
  /** Test/diagnostic filter worker pool size forwarded from the page. */
  filterWorkers?: number;
  /** Pixels the main thread already holds for a just-committed asset. */
  decodedPixels?: Array<{ id: string; key: string; pixels: ArrayBuffer }>;
};
type CancelRequest = { kind: 'cancel'; id: number };
/** Drop retained layer-filter surfaces, e.g. after a different document is installed. */
type ClearCacheRequest = { kind: 'clear-layer-cache' };
type Request = RenderRequest | CancelRequest | ClearCacheRequest;
type Response =
  | { kind: 'progress'; id: number; completed: number; total: number }
  | { kind: 'tiled-progress'; id: number; progress: TiledNeighborhoodProgress }
  | { kind: 'filter-progress'; id: number; progress: FilterBandProgress }
  | { kind: 'tiled-telemetry'; id: number; telemetry: TiledRenderTelemetry }
  | { kind: 'cancelled'; id: number }
  | {
      kind: 'result';
      id: number;
      image: ImageBitmap;
      width: number;
      height: number;
      layerCache?: LayerFilterCacheStats;
    }
  | {
      kind: 'result-bytes';
      id: number;
      bytes: ArrayBuffer;
      width: number;
      height: number;
      layerCache?: LayerFilterCacheStats;
    }
  | { kind: 'error'; id: number; name: string; message: string };

const scope = globalThis as typeof globalThis & {
  postMessage: (message: Response, transfer?: Transferable[]) => void;
};
const cancelled = new Set<number>();
/**
 * Encoded assets of the latest request, by content fingerprint. The main
 * thread only sends assets this worker does not already hold, so unchanged
 * layers are not structured-cloned again on every render.
 */
let assetStore = new Map<string, Assets[string]>();

/** Composite below the active layer, reused while the layers below are unchanged. */
const compositeCache = new CompositeCache<HTMLCanvasElement>();
let activeId: number | undefined;

function cancellationError(): Error {
  if (typeof DOMException === 'function')
    return new DOMException('Document rendering cancelled', 'AbortError');
  const error = new Error('Document rendering cancelled');
  error.name = 'AbortError';
  return error;
}

function postError(id: number, error: unknown): void {
  const value =
    error instanceof Error ? error : new Error('Document rendering failed');
  scope.postMessage({
    kind: 'error',
    id,
    name: value.name.slice(0, 100),
    message: value.message.slice(0, 2000),
  });
}

function validateTiledBudget(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > TILE_MAX_BATCH_BYTES
  )
    throw new RangeError(
      `Invalid tiled working-byte budget; expected 1-${TILE_MAX_BATCH_BYTES}`,
    );
  return value;
}

async function encodeResult(
  id: number,
  canvas: OffscreenCanvas,
  width: number,
  height: number,
  layerCache: LayerFilterCacheStats,
): Promise<void> {
  if (typeof canvas.transferToImageBitmap === 'function') {
    const image = canvas.transferToImageBitmap();
    scope.postMessage({ kind: 'result', id, image, width, height, layerCache }, [image]);
    return;
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = await blob.arrayBuffer();
  scope.postMessage({ kind: 'result-bytes', id, bytes, width, height, layerCache }, [
    bytes,
  ]);
}

scope.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request?.kind === 'cancel') {
    cancelled.add(request.id);
    return;
  }
  if (request?.kind === 'clear-layer-cache') {
    // Entries are content-keyed, so clearing only releases memory; a render
    // already in flight keeps its own references and stays correct.
    clearLayerFilterCache();
    clearDecodedAssetCache();
    compositeCache.clear();
    assetStore = new Map();
    if (activeId === undefined) releaseRetiredDecodedAssets();
    return;
  }
  if (
    !request ||
    request.kind !== 'render' ||
    !Number.isSafeInteger(request.id) ||
    activeId !== undefined
  ) {
    if (request && 'id' in request && Number.isSafeInteger(request.id))
      postError(
        request.id,
        new Error('Worker is busy or the render request is invalid'),
      );
    return;
  }
  activeId = request.id;
  void (async () => {
    let output: OffscreenCanvas | undefined;
    const cacheBefore = sharedLayerFilterCache().stats();
    try {
      const resolved = resolveRequestAssets(request.assets, request.assetKeys, assetStore);
      if (resolved.missing.length) {
        const error = new Error('Worker render assets are missing');
        error.name = 'WorkerAssetMissing';
        throw error;
      }
      request.assets = resolved.assets;
      validateFrame(request.frame, request.assets);
      primeAssetFingerprints(request.assets, request.assetKeys);
      // Keep exactly this request's assets for the next one.
      assetStore = retainedAssetStore(request.assets, request.assetKeys);
      if (Array.isArray(request.decodedPixels))
        for (const prime of request.decodedPixels.slice(0, 1)) {
          const asset = prime && typeof prime.id === 'string' ? request.assets[prime.id] : undefined;
          if (asset && typeof prime.key === 'string' && prime.pixels instanceof ArrayBuffer)
            primeDecodedAssetPixels(asset, prime.key, new Uint8ClampedArray(prime.pixels));
        }
      const tiledMaxWorkingBytes = validateTiledBudget(request.tiledMaxWorkingBytes);
      const filterScope = globalThis as typeof globalThis & { __PIXELFORGE_FILTER_WORKERS__?: number };
      if (Number.isSafeInteger(request.filterWorkers) && (request.filterWorkers as number) >= 0)
        filterScope.__PIXELFORGE_FILTER_WORKERS__ = request.filterWorkers;
      else delete filterScope.__PIXELFORGE_FILTER_WORKERS__;
      output = (await renderFrame(
        request.frame,
        request.assets,
        undefined,
        {
          compositeCache,
          tiledRevision: request.id,
          tiledMaxWorkingBytes,
          isCancelled: () => cancelled.has(request.id),
          yieldEveryLayers: 1,
          onProgress: (completed, total) => {
            scope.postMessage({
              kind: 'progress',
              id: request.id,
              completed,
              total,
            });
          },
          onTiledTelemetry: (telemetry) => {
            if (!cancelled.has(request.id))
              scope.postMessage({ kind: 'tiled-telemetry', id: request.id, telemetry });
          },
          onTiledProgress: (progress) => {
            if (!cancelled.has(request.id))
              scope.postMessage({ kind: 'tiled-progress', id: request.id, progress });
          },
          onFilterProgress: (progress) => {
            if (!cancelled.has(request.id))
              scope.postMessage({ kind: 'filter-progress', id: request.id, progress });
          },
        },
      )) as unknown as OffscreenCanvas;
      if (cancelled.has(request.id)) throw cancellationError();
      await encodeResult(
        request.id,
        output,
        request.frame.w,
        request.frame.h,
        layerFilterCacheDelta(cacheBefore, sharedLayerFilterCache().stats()),
      );
    } catch (error) {
      if (cancelled.has(request.id))
        scope.postMessage({ kind: 'cancelled', id: request.id });
      else postError(request.id, error);
    } finally {
      if (output) {
        output.width = 0;
        output.height = 0;
      }
      // Decoded sources persist between requests (content-keyed, bounded);
      // bitmaps evicted during this render are closed now that it is done.
      releaseRetiredDecodedAssets();
      cancelled.delete(request.id);
      activeId = undefined;
    }
  })();
};
