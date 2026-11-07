import {
  referencedAssets,
  renderFrame,
  validateFrame,
  type Assets,
  type Frame,
} from './document.ts';
import type { TileCache } from './tilePlan.ts';
import { CompositeCache } from './compositeCache.ts';
import { assetsToSend } from './workerAssets.ts';

/** Main-thread prefix composite (used by stroke previews and the fallback). */
const mainThreadCompositeCache = new CompositeCache<HTMLCanvasElement>();
import {
  assetFingerprint,
  assetFingerprints,
  clearLayerFilterCache,
  layerFilterCacheDelta,
  markLayerFilterCacheStats,
  sharedLayerFilterCache,
  validLayerFilterCacheStats,
} from './layerFilterCache.ts';
import {
  validTiledNeighborhoodProgress,
  validTiledRenderTelemetry,
  type TiledNeighborhoodProgress,
  type TiledRenderTelemetry,
} from './tiledDocument.ts';
import { validFilterBandProgress, type FilterBandProgress } from './filterBands.ts';
import {
  FILTER_PARALLEL_MIN_PIXELS,
  PREWARM_FILTER_TYPES,
  prewarmFilterPool,
} from './filterWorkerPool.ts';

/**
 * Test/diagnostic override for the filter worker pool size, forwarded to the
 * render worker (whose globals are separate from the page's).
 */
function filterWorkerOverride(): number | undefined {
  const value = (globalThis as typeof globalThis & { __PIXELFORGE_FILTER_WORKERS__?: unknown })
    .__PIXELFORGE_FILTER_WORKERS__;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export type WorkerRenderOptions = {
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  /** Report completed layer passes for visible large-render progress. */
  onProgress?: (completed: number, total: number) => void;
  /** Test/diagnostic override; normal editing selects workers for larger frames. */
  forceWorker?: boolean;
  /** Reuse one worker between sequential committed renders when true. */
  reuseWorker?: boolean;
  /** Revision/effect cache scope for the visible tiled blur adapter. */
  tiledRevision?: string | number;
  tiledCache?: TileCache<Uint8ClampedArray>;
  tiledMaxWorkingBytes?: number;
  /** Privacy-safe diagnostics for the latest eligible tiled effect. */
  onTiledTelemetry?: (telemetry: TiledRenderTelemetry) => void;
  /** Monotonic progress for the latest eligible tiled effect. */
  onTiledProgress?: (progress: TiledNeighborhoodProgress) => void;
  /** Completed row bands of a parallel full-frame filter. */
  onFilterProgress?: (progress: FilterBandProgress) => void;
};

/** Minimum watchdog window, kept for small frames and as the stall floor. */
const RENDER_TIMEOUT_MS = 30_000;
/** Extra no-progress allowance per frame megapixel (one heavy layer pass). */
const RENDER_STALL_MS_PER_MEGAPIXEL = 6_000;
/** Ceiling for the no-progress window, even for the largest frames. */
const RENDER_MAX_STALL_MS = 120_000;
/** Extra total allowance per megapixel × layer of work. */
const RENDER_TOTAL_MS_PER_MEGAPIXEL_LAYER = 15_000;
/** Absolute ceiling: a render is never allowed to run longer than this. */
const RENDER_MAX_TOTAL_MS = 600_000;

export type RenderWatchdogBudget = {
  /** Longest gap allowed between worker progress messages. */
  stallMs: number;
  /** Hard ceiling for the whole request, whatever progress arrives. */
  totalMs: number;
};

/**
 * Size the worker watchdog to the work. A fixed 30-second limit killed
 * legitimate renders of large documents (e.g. a 10.8 MP layer with a
 * radius-24 Gaussian), so the budget now scales with frame pixels and
 * layer count, and the no-progress window resets on every layer or tile
 * progress message. A worker that stops reporting is still stopped after
 * the stall window, and nothing runs beyond the absolute ceiling.
 *
 * `globalThis.__PIXELFORGE_RENDER_TIMEOUT_MS__` (a positive number, or a
 * `{ stallMs, totalMs }` pair) replaces the computed limits; tests use it to
 * prove a heavy render now finishes well inside a deliberately short budget.
 */
export function renderWatchdogBudget(frame: Pick<Frame, 'w' | 'h' | 'layers'>): RenderWatchdogBudget {
  const override = (globalThis as typeof globalThis & {
    __PIXELFORGE_RENDER_TIMEOUT_MS__?: unknown;
  }).__PIXELFORGE_RENDER_TIMEOUT_MS__;
  const positive = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (positive(override)) return { stallMs: override, totalMs: override };
  if (override && typeof override === 'object') {
    const { stallMs, totalMs } = override as Partial<RenderWatchdogBudget>;
    if (positive(stallMs) && positive(totalMs)) return { stallMs, totalMs };
  }
  const megapixels = Math.max(0, (frame.w * frame.h) / 1_000_000) || 0;
  const layers = Math.max(1, frame.layers.length);
  const stallMs = Math.round(Math.min(
    RENDER_MAX_STALL_MS,
    RENDER_TIMEOUT_MS + RENDER_STALL_MS_PER_MEGAPIXEL * megapixels,
  ));
  const totalMs = Math.round(Math.min(
    RENDER_MAX_TOTAL_MS,
    Math.max(stallMs, RENDER_TIMEOUT_MS + RENDER_TOTAL_MS_PER_MEGAPIXEL_LAYER * megapixels * layers),
  ));
  return { stallMs, totalMs };
}

/** A render stopped by its watchdog; the previous canvas stays published. */
export class RenderTimeoutError extends Error {
  readonly code = 'PIXELFORGE_RENDER_TIMEOUT';
  readonly elapsedMs: number;
  readonly stalled: boolean;

  constructor(elapsedMs: number, stalled: boolean) {
    const seconds = Math.max(1, Math.round(elapsedMs / 1000));
    super(
      stalled
        ? `Rendering stopped: no progress for ${seconds} s. The canvas shows the last finished render and editing still works; undo, lower the filter radius or hide heavy layers, then try again.`
        : `Rendering stopped after ${seconds} s. The canvas shows the last finished render and editing still works; undo, lower the filter radius or hide heavy layers, then try again.`,
    );
    this.name = 'RenderTimeoutError';
    this.elapsedMs = elapsedMs;
    this.stalled = stalled;
  }
}

type RenderWatchdog = { touch: () => void; clear: () => void };

/** Start stall and total timers; `touch` restarts only the stall timer. */
function startRenderWatchdog(
  budget: RenderWatchdogBudget,
  onExpire: (error: RenderTimeoutError) => void,
): RenderWatchdog {
  const started = Date.now();
  let stall: ReturnType<typeof setTimeout> | undefined;
  let done = false;
  const expire = (stalled: boolean) => {
    if (done) return;
    done = true;
    clear();
    onExpire(new RenderTimeoutError(Date.now() - started, stalled));
  };
  const total = setTimeout(() => expire(false), budget.totalMs);
  const arm = () => {
    if (stall) clearTimeout(stall);
    stall = budget.stallMs < budget.totalMs ? setTimeout(() => expire(true), budget.stallMs) : undefined;
  };
  const clear = () => {
    done = true;
    clearTimeout(total);
    if (stall) clearTimeout(stall);
    stall = undefined;
  };
  arm();
  return {
    touch: () => {
      if (!done) arm();
    },
    clear,
  };
}
/**
 * Keep an idle persistent worker (and its bounded layer-filter cache) long
 * enough that a pause between edits does not force every filtered layer to be
 * recomputed. The cache is byte-bounded, so this only extends retention.
 */
const PERSISTENT_WORKER_IDLE_MS = 5 * 60_000;
const WORKER_MIN_PIXELS = 2_000_000;

/**
 * Decoded pixels for a freshly committed asset, handed to the next worker
 * render that references it so the worker does not decode the PNG data URL
 * it was just encoded from. At most one entry is retained (the latest stroke)
 * and an entry is transferred, not copied, so memory stays bounded.
 */
type WorkerPrime = { key: string; width: number; height: number; pixels: ArrayBuffer };
let workerPrime: WorkerPrime | null = null;

/** Offer a committed raster's pixels to the render worker (large frames only). */
export function primeWorkerDecodedAsset(
  asset: { url: string; w: number; h: number } | undefined,
  source: HTMLCanvasElement,
): boolean {
  if (!asset || typeof asset.url !== 'string') return false;
  if (source.width !== asset.w || source.height !== asset.h) return false;
  if (asset.w * asset.h < WORKER_MIN_PIXELS || !canRenderInWorker()) return false;
  try {
    const data = source.getContext('2d')!.getImageData(0, 0, asset.w, asset.h).data;
    workerPrime = {
      key: assetFingerprint(asset),
      width: asset.w,
      height: asset.h,
      pixels: data.buffer as ArrayBuffer,
    };
    return true;
  } catch {
    workerPrime = null;
    return false;
  }
}


/** Primes for this request's assets, plus the buffers to transfer. */
function takeWorkerPrimes(keys: Record<string, string>): {
  decodedPixels?: Array<{ id: string; key: string; pixels: ArrayBuffer }>;
  transfer: Transferable[];
} {
  const prime = workerPrime;
  if (!prime) return { transfer: [] };
  const id = Object.keys(keys).find((assetId) => keys[assetId] === prime.key);
  if (!id) return { transfer: [] };
  workerPrime = null;
  return {
    decodedPixels: [{ id, key: prime.key, pixels: prime.pixels }],
    transfer: [prime.pixels],
  };
}

/** Diagnostics for tests: whether a committed raster is waiting for the worker. */
export function workerPrimePending(): boolean {
  return workerPrime !== null;
}
let requestId = 0;

function abortError(): Error {
  if (typeof DOMException === 'function')
    return new DOMException('Document rendering cancelled', 'AbortError');
  const error = new Error('Document rendering cancelled');
  error.name = 'AbortError';
  return error;
}

/** Whether this browser can run the bounded OffscreenCanvas document renderer. */
export function canRenderInWorker(): boolean {
  if (
    typeof Worker !== 'function' ||
    typeof OffscreenCanvas !== 'function' ||
    typeof createImageBitmap !== 'function'
  ) {
    return false;
  }
  try {
    const probe = new OffscreenCanvas(1, 1);
    return (
      Boolean(probe.getContext('2d')) &&
      (typeof probe.transferToImageBitmap === 'function' ||
        typeof probe.convertToBlob === 'function')
    );
  } catch {
    return false;
  }
}

/**
 * Render an immutable frame in an isolated worker. Main-thread overrides are
 * intentionally kept on the synchronous path because they are live Canvas
 * surfaces from an in-progress brush gesture and cannot be structured-cloned.
 */
export async function renderFrameWithWorker(
  frame: Frame,
  assets: Assets,
  overrides?: Record<string, HTMLCanvasElement>,
  options: WorkerRenderOptions = {},
): Promise<CanvasImageSource> {
  const isCancelled = () => Boolean(options.signal?.aborted || options.isCancelled?.());
  if (isCancelled()) throw abortError();
  const fallback = async () => {
    const cacheBefore = sharedLayerFilterCache().stats();
    const image = await renderFrame(frame, assets, overrides, {
      compositeCache: mainThreadCompositeCache,
      signal: options.signal,
      isCancelled,
      onProgress: options.onProgress,
      yieldEveryLayers: 1,
      tiledRevision: options.tiledRevision,
      tiledCache: options.tiledCache,
      tiledMaxWorkingBytes: options.tiledMaxWorkingBytes,
      onTiledTelemetry: (telemetry) => {
        if (!validTiledRenderTelemetry(telemetry))
          throw new Error('Invalid tiled telemetry from the fallback renderer.');
        options.onTiledTelemetry?.(telemetry);
      },
      onTiledProgress: (progress) => {
        if (!validTiledNeighborhoodProgress(progress))
          throw new Error('Invalid tiled progress from the fallback renderer.');
        options.onTiledProgress?.(progress);
      },
      onFilterProgress: (progress) => {
        if (!validFilterBandProgress(progress))
          throw new Error('Invalid filter band progress from the fallback renderer.');
        options.onFilterProgress?.(progress);
      },
    });
    if (isCancelled()) throw abortError();
    markLayerFilterCacheStats(layerFilterCacheDelta(cacheBefore, sharedLayerFilterCache().stats()));
    return image;
  };
  const globalScope = globalThis as typeof globalThis & {
    __PIXELFORGE_FORCE_WORKER__?: boolean;
  };
  const useWorker =
    options.forceWorker === true ||
    globalScope.__PIXELFORGE_FORCE_WORKER__ === true ||
    frame.w * frame.h >= WORKER_MIN_PIXELS;
  if (overrides || !useWorker || !canRenderInWorker()) return fallback();
  validateFrame(frame, assets);
  if (options.signal?.aborted) throw abortError();
  if (options.reuseWorker)
    return persistentWorkerRender(frame, assets, options, fallback);

  let worker: Worker;
  try {
    worker = new Worker(
      new URL('./document-render.worker.ts', import.meta.url),
      { type: 'module' },
    );
  } catch {
    return fallback();
  }
  const id = ++requestId;
  return new Promise<CanvasImageSource>((resolve, reject) => {
    let settled = false;
    let lastCompleted = 0;
    const watchdog = startRenderWatchdog(renderWatchdogBudget(frame), (error) =>
      finish(() => reject(error)),
    );
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      watchdog.clear();
      options.signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      try {
        worker.terminate();
      } catch {
        /* Already unavailable. */
      }
      callback();
    };
    const cancel = () => {
      try {
        worker.postMessage({ kind: 'cancel', id });
      } catch {
        /* Worker already stopped. */
      }
      finish(() => reject(abortError()));
    };
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      const value = message as Record<string, unknown>;
      const closeResult = () => {
        if (value.kind === 'result' && value.image &&
            typeof (value.image as ImageBitmap).close === 'function')
          (value.image as ImageBitmap).close();
      };
      if (value.id !== id || settled) {
        closeResult();
        return;
      }
      if (isCancelled()) {
        closeResult();
        cancel();
        return;
      }
      if (value.kind === 'error' && typeof value.message === 'string') {
        const error = new Error(value.message);
        error.name = typeof value.name === 'string' ? value.name : 'Error';
        finish(() => reject(error));
      } else if (value.kind === 'progress') {
        const completed = Number(value.completed);
        const total = Number(value.total);
        if (
          !Number.isSafeInteger(completed) ||
          !Number.isSafeInteger(total) ||
          total !== frame.layers.length ||
          completed < 1 ||
          completed > total ||
          completed < lastCompleted
        ) {
          finish(() =>
            reject(new Error('Worker returned invalid render progress.')),
          );
          return;
        }
        lastCompleted = completed;
        watchdog.touch();
        try {
          options.onProgress?.(completed, total);
        } catch (error) {
          finish(() => reject(error));
        }
      } else if (value.kind === 'tiled-telemetry') {
        if (!validTiledRenderTelemetry(value.telemetry)) {
          finish(() => reject(new Error('Worker returned invalid tiled telemetry.')));
          return;
        }
        try {
          options.onTiledTelemetry?.(value.telemetry);
        } catch (error) {
          finish(() => reject(error));
        }
      } else if (value.kind === 'tiled-progress') {
        if (!validTiledNeighborhoodProgress(value.progress)) {
          finish(() => reject(new Error('Worker returned invalid tiled progress.')));
          return;
        }
        watchdog.touch();
        try {
          options.onTiledProgress?.(value.progress);
        } catch (error) {
          finish(() => reject(error));
        }
      } else if (value.kind === 'filter-progress') {
        // Each completed filter band restarts the no-progress window.
        if (!validFilterBandProgress(value.progress)) {
          finish(() => reject(new Error('Worker returned invalid filter progress.')));
          return;
        }
        watchdog.touch();
        try {
          options.onFilterProgress?.(value.progress);
        } catch (error) {
          finish(() => reject(error));
        }
      } else if (
        value.kind === 'result' &&
        value.width === frame.w &&
        value.height === frame.h &&
        value.image &&
        typeof (value.image as ImageBitmap).close === 'function' &&
        (value.image as ImageBitmap).width === frame.w &&
        (value.image as ImageBitmap).height === frame.h
      ) {
        if (validLayerFilterCacheStats(value.layerCache)) markLayerFilterCacheStats(value.layerCache);
        finish(() => resolve(value.image as ImageBitmap));
      } else if (
        value.kind === 'result-bytes' &&
        value.width === frame.w &&
        value.height === frame.h &&
        value.bytes instanceof ArrayBuffer &&
        value.bytes.byteLength > 0 &&
        value.bytes.byteLength <= 64 * 1024 * 1024
      ) {
        if (validLayerFilterCacheStats(value.layerCache)) markLayerFilterCacheStats(value.layerCache);
        void createImageBitmap(
          new Blob([value.bytes], { type: 'image/png' }),
        ).then(
          (image) => {
            if (settled || isCancelled()) {
              image.close();
              if (!settled) cancel();
              return;
            }
            if (image.width !== frame.w || image.height !== frame.h) {
              image.close();
              finish(() => reject(new Error('Worker decoded an invalid render size.')));
              return;
            }
            finish(() => resolve(image));
          },
          (error) => finish(() => reject(error)),
        );
      } else if (value.kind === 'result' || value.kind === 'result-bytes') {
        closeResult();
        const dimensionsMatch =
          value.width === frame.w && value.height === frame.h;
        finish(() =>
          reject(
            new Error(
              dimensionsMatch
                ? 'Worker returned an invalid render result.'
                : 'Worker returned an invalid render size.',
            ),
          ),
        );
      }
    };
    worker.onerror = () =>
      finish(() => reject(new Error('Worker document rendering failed')));
    worker.onmessageerror = () =>
      finish(() =>
        reject(new Error('Worker document render response could not be read')),
      );
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) return cancel();
    try {
      // Do not clone every asset retained by undo history. A render only needs
      // the current frame's raster and mask references.
      const used = referencedAssets([frame], assets);
      const assetKeys = assetFingerprints(used);
      const primes = takeWorkerPrimes(assetKeys);
      worker.postMessage({
        kind: 'render',
        id,
        frame,
        assets: used,
        assetKeys,
        decodedPixels: primes.decodedPixels,
        tiledMaxWorkingBytes: options.tiledMaxWorkingBytes,
        filterWorkers: filterWorkerOverride(),
      }, primes.transfer);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

type PersistentFallback = () => Promise<CanvasImageSource>;
type PersistentTask = {
  /** Set after one resend because the worker was missing an asset. */
  assetRetry?: boolean;
  id: number;
  frame: Frame;
  assets: Assets;
  options: WorkerRenderOptions;
  fallback: PersistentFallback;
  resolve: (image: CanvasImageSource) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  cancelRequested: boolean;
  lastCompleted: number;
  watchdog?: RenderWatchdog;
  abortHandler?: () => void;
};

/**
 * One-worker latest-wins session used by the editor's committed render path.
 * The worker is reused while idle, but a cancelled request is never allowed
 * to publish into a newer request. An idle timer releases the worker and the
 * worker-side decoded asset cache is cleared between requests.
 */
class PersistentWorkerSession {
  private worker?: Worker;
  /**
   * Fingerprints of the assets the live worker holds: exactly those of the
   * last request it received (it keeps that set and drops the rest).
   */
  private workerAssetKeys = new Set<string>();
  private active?: PersistentTask;
  private queued?: PersistentTask;
  private idleTimer?: ReturnType<typeof setTimeout>;

  submit(
    frame: Frame,
    assets: Assets,
    options: WorkerRenderOptions,
    fallback: PersistentFallback,
  ): Promise<CanvasImageSource> {
    const id = ++requestId;
    return new Promise<CanvasImageSource>((resolve, reject) => {
      const task: PersistentTask = {
        id,
        frame,
        assets,
        options,
        fallback,
        resolve,
        reject,
        settled: false,
        cancelRequested: false,
        lastCompleted: 0,
      };
      task.abortHandler = () => this.cancel(task);
      options.signal?.addEventListener('abort', task.abortHandler, {
        once: true,
      });
      if (options.signal?.aborted || options.isCancelled?.()) {
        task.settled = true;
        reject(abortError());
        return;
      }
      if (this.queued) this.rejectQueued(this.queued);
      if (this.active) {
        this.queued = task;
        this.cancel(this.active);
      } else this.start(task);
    });
  }

  private rejectQueued(task: PersistentTask): void {
    task.settled = true;
    if (task.abortHandler) task.options.signal?.removeEventListener('abort', task.abortHandler);
    task.reject(abortError());
    if (this.queued === task) this.queued = undefined;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    this.workerAssetKeys = new Set();
    this.worker = new Worker(
      new URL('./document-render.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (event) => this.onMessage(event.data);
    this.worker.onerror = () => this.onWorkerFailure(new Error('Worker document rendering failed'));
    this.worker.onmessageerror = () =>
      this.onWorkerFailure(new Error('Worker document render response could not be read'));
    return this.worker;
  }

  private start(task: PersistentTask): void {
    this.clearIdleTimer();
    // Mark the task active before constructing/posting so a constructor or
    // postMessage failure can settle it through the normal fallback path.
    this.active = task;
    try {
      const worker = this.ensureWorker();
      task.watchdog = startRenderWatchdog(renderWatchdogBudget(task.frame), (error) => {
        // Retire the stuck worker; the next request gets a fresh one.
        if (this.active === task) this.onWorkerFailure(error);
      });
      const used = referencedAssets([task.frame], task.assets);
      const assetKeys = assetFingerprints(used);
      const primes = takeWorkerPrimes(assetKeys);
      // Send only assets the worker does not already hold (by content), so a
      // large document is not structured-cloned again on every edit.
      const send = assetsToSend(used, assetKeys, this.workerAssetKeys);
      worker.postMessage({
        kind: 'render',
        id: task.id,
        frame: task.frame,
        assets: send,
        assetKeys,
        decodedPixels: primes.decodedPixels,
        tiledMaxWorkingBytes: task.options.tiledMaxWorkingBytes,
        filterWorkers: filterWorkerOverride(),
      }, primes.transfer);
      this.workerAssetKeys = new Set(Object.values(assetKeys));
    } catch {
      // A constructor or postMessage failure can leave the worker unusable or
      // still busy. Retire it before falling back and servicing a queued
      // latest-wins request so that request gets a fresh worker session.
      const worker = this.worker;
      this.worker = undefined;
      try { worker?.terminate(); } catch { /* already unavailable */ }
      this.finish(task, () => {
        void task.fallback().then(task.resolve, task.reject);
      });
      void this.startNext();
    }
  }

  private cancel(task: PersistentTask): void {
    if (task.cancelRequested) return;
    task.cancelRequested = true;
    if (!task.settled) {
      task.settled = true;
      if (task.abortHandler) task.options.signal?.removeEventListener('abort', task.abortHandler);
      task.reject(abortError());
    }
    if (this.active === task) {
      try {
        this.worker?.postMessage({ kind: 'cancel', id: task.id });
      } catch {
        this.onWorkerFailure(abortError());
      }
    } else if (this.queued === task) {
      this.queued = undefined;
    }
  }

  private onMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;
    const value = message as Record<string, unknown>;
    const task = this.active;
    if (!task || value.id !== task.id) {
      if (value.kind === 'result' && value.image && typeof (value.image as ImageBitmap).close === 'function')
        (value.image as ImageBitmap).close();
      return;
    }
    if (value.kind === 'cancelled') {
      this.finish(task);
      void this.startNext();
      return;
    }
    if (task.cancelRequested || task.options.signal?.aborted || task.options.isCancelled?.()) {
      if (value.kind === 'result' && value.image && typeof (value.image as ImageBitmap).close === 'function')
        (value.image as ImageBitmap).close();
      this.cancel(task);
      if (value.kind === 'result' || value.kind === 'result-bytes' || value.kind === 'error') {
        this.finish(task);
        void this.startNext();
      }
      return;
    }
    if (value.kind === 'error' && value.name === 'WorkerAssetMissing' && !task.assetRetry) {
      // The worker no longer holds an asset this session assumed it had:
      // resend the request once with every asset.
      task.assetRetry = true;
      task.watchdog?.clear();
      task.watchdog = undefined;
      this.workerAssetKeys = new Set();
      this.active = undefined;
      this.start(task);
      return;
    }
    if (value.kind === 'error' && typeof value.message === 'string') {
      const error = new Error(value.message);
      error.name = typeof value.name === 'string' ? value.name : 'Error';
      this.finish(task, () => {
        if (!task.settled) task.reject(error);
      });
      void this.startNext();
      return;
    }
    if (value.kind === 'progress') {
      const completed = Number(value.completed);
      const total = Number(value.total);
      if (
        !Number.isSafeInteger(completed) ||
        !Number.isSafeInteger(total) ||
        total !== task.frame.layers.length ||
        completed < 1 ||
        completed > total ||
        completed < task.lastCompleted
      ) {
        this.onWorkerFailure(new Error('Worker returned invalid render progress.'));
        return;
      }
      task.lastCompleted = completed;
      task.watchdog?.touch();
      try {
        task.options.onProgress?.(completed, total);
      } catch (error) {
        // A consumer callback can throw while the worker is still rendering.
        // Retire the worker before starting a queued latest-wins task so the
        // new request cannot race the old worker's active render.
        this.onWorkerFailure(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (value.kind === 'tiled-telemetry') {
      if (!validTiledRenderTelemetry(value.telemetry)) {
        this.onWorkerFailure(new Error('Worker returned invalid tiled telemetry.'));
        return;
      }
      try {
        task.options.onTiledTelemetry?.(value.telemetry);
      } catch (error) {
        // Telemetry is advisory, but a throwing consumer still invalidates
        // this worker session. Terminate it before servicing the queue.
        this.onWorkerFailure(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (value.kind === 'tiled-progress') {
      if (!validTiledNeighborhoodProgress(value.progress)) {
        this.onWorkerFailure(new Error('Worker returned invalid tiled progress.'));
        return;
      }
      task.watchdog?.touch();
      try {
        task.options.onTiledProgress?.(value.progress);
      } catch (error) {
        this.onWorkerFailure(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (value.kind === 'filter-progress') {
      if (!validFilterBandProgress(value.progress)) {
        this.onWorkerFailure(new Error('Worker returned invalid filter progress.'));
        return;
      }
      task.watchdog?.touch();
      try {
        task.options.onFilterProgress?.(value.progress);
      } catch (error) {
        this.onWorkerFailure(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (
      value.kind === 'result' &&
      value.width === task.frame.w &&
      value.height === task.frame.h &&
      value.image &&
      typeof (value.image as ImageBitmap).close === 'function' &&
      (value.image as ImageBitmap).width === task.frame.w &&
      (value.image as ImageBitmap).height === task.frame.h
    ) {
      if (validLayerFilterCacheStats(value.layerCache)) markLayerFilterCacheStats(value.layerCache);
      this.finish(task, () => task.resolve(value.image as ImageBitmap));
      void this.startNext();
      return;
    }
    if (
      value.kind === 'result-bytes' &&
      value.width === task.frame.w &&
      value.height === task.frame.h &&
      value.bytes instanceof ArrayBuffer &&
      value.bytes.byteLength > 0 &&
      value.bytes.byteLength <= 64 * 1024 * 1024
    ) {
      if (validLayerFilterCacheStats(value.layerCache)) markLayerFilterCacheStats(value.layerCache);
      void createImageBitmap(new Blob([value.bytes], { type: 'image/png' })).then(
        (image) => {
          if (this.active !== task || task.cancelRequested || task.options.signal?.aborted || task.options.isCancelled?.()) {
            image.close();
            this.cancel(task);
            return;
          }
          if (image.width !== task.frame.w || image.height !== task.frame.h) {
            image.close();
            this.finish(task, () => {
              if (!task.settled) task.reject(new Error('Worker decoded an invalid render size.'));
            });
          } else {
            this.finish(task, () => task.resolve(image));
          }
          void this.startNext();
        },
        (error) => {
          this.finish(task, () => {
            if (!task.settled) task.reject(error);
          });
          void this.startNext();
        },
      );
      return;
    }
    if (value.kind === 'result' && value.image && typeof (value.image as ImageBitmap).close === 'function')
      (value.image as ImageBitmap).close();
    this.finish(task, () => {
      if (!task.settled) task.reject(new Error('Worker returned an invalid render result.'));
    });
    void this.startNext();
  }

  private onWorkerFailure(error: Error): void {
    const worker = this.worker;
    this.worker = undefined;
    try { worker?.terminate(); } catch { /* already unavailable */ }
    const task = this.active;
    this.active = undefined;
    if (task) {
      this.clearTask(task);
      if (!task.settled) task.reject(error);
    }
    void this.startNext();
  }

  private finish(task: PersistentTask, callback?: () => void): void {
    if (this.active !== task) return;
    this.active = undefined;
    this.clearTask(task);
    callback?.();
  }

  private clearTask(task: PersistentTask): void {
    task.watchdog?.clear();
    task.watchdog = undefined;
    if (task.abortHandler) task.options.signal?.removeEventListener('abort', task.abortHandler);
    task.abortHandler = undefined;
    if (this.queued === task) this.queued = undefined;
  }

  private async startNext(): Promise<void> {
    const next = this.queued;
    this.queued = undefined;
    if (next) {
      if (next.options.signal?.aborted || next.options.isCancelled?.()) {
        if (!next.settled) {
          next.settled = true;
          next.reject(abortError());
        }
        return this.startNext();
      }
      this.start(next);
      return;
    }
    this.scheduleIdleTimer();
  }

  private scheduleIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      const worker = this.worker;
      this.worker = undefined;
      try { worker?.terminate(); } catch { /* already unavailable */ }
    }, PERSISTENT_WORKER_IDLE_MS);
  }

  /**
   * Ask the render worker (started now if needed, since a render follows) to
   * warm its filter workers for these kernels.
   */
  prewarmFilters(types: readonly string[]): void {
    try {
      this.ensureWorker().postMessage({
        kind: 'prewarm-filters',
        types: [...types],
        filterWorkers: filterWorkerOverride(),
      });
      if (!this.active) this.scheduleIdleTimer();
    } catch {
      /* Warm-up is best effort. */
    }
  }

  /** Ask a live worker to drop its layer-filter surfaces; no-op otherwise. */
  clearLayerCache(): void {
    this.workerAssetKeys = new Set();
    try {
      this.worker?.postMessage({ kind: 'clear-layer-cache' });
    } catch {
      /* An unavailable worker has no cache left to clear. */
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  dispose(): void {
    this.clearIdleTimer();
    const worker = this.worker;
    this.worker = undefined;
    const active = this.active;
    this.active = undefined;
    const queued = this.queued;
    this.queued = undefined;
    try { worker?.terminate(); } catch { /* already unavailable */ }
    for (const task of [active, queued]) {
      if (task && !task.settled) {
        task.settled = true;
        task.reject(abortError());
      }
    }
  }
}

const persistentSession = new PersistentWorkerSession();

/**
 * Release retained layer-filter surfaces on the main thread and in the
 * persistent render worker, e.g. when a different document is installed.
 * Entries are content-keyed, so this frees memory rather than fixing staleness.
 */
export function clearLayerFilterCaches(): void {
  clearLayerFilterCache();
  mainThreadCompositeCache.clear();
  persistentSession.clearLayerCache();
}

/**
 * Warm the filter worker pool that will render a heavy filter on a document
 * of this size: the persistent render worker's nested pool for frames that
 * render in the worker, otherwise the main thread's pool. Runs at idle time
 * and is a no-op for light filters, small documents or missing workers.
 */
export function prewarmFilterWorkers(types: readonly string[], frame: { w: number; h: number }): void {
  const heavy = types.filter((type) => (PREWARM_FILTER_TYPES as readonly string[]).includes(type));
  if (!heavy.length || frame.w * frame.h < FILTER_PARALLEL_MIN_PIXELS) return;
  const run = () => {
    if (frame.w * frame.h >= WORKER_MIN_PIXELS && canRenderInWorker()) persistentSession.prewarmFilters(heavy);
    else prewarmFilterPool(heavy);
  };
  const scope = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (typeof scope.requestIdleCallback === 'function') scope.requestIdleCallback(run, { timeout: 200 });
  else setTimeout(run, 0);
}

/** Test/host teardown hook; production lifecycle is managed by the idle timer. */
export function resetPersistentWorkerForTests(): void {
  persistentSession.dispose();
}

function persistentWorkerRender(
  frame: Frame,
  assets: Assets,
  options: WorkerRenderOptions,
  fallback: PersistentFallback,
): Promise<CanvasImageSource> {
  try {
    return persistentSession.submit(frame, assets, options, fallback);
  } catch {
    return fallback();
  }
}
