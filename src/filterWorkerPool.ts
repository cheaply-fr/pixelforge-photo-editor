/**
 * A small pool of filter workers that renders heavy neighbourhood filters in
 * parallel row bands (full-frame path) or parallel tiles (tiled path).
 *
 * - Separate from the document render worker: the pool can be created from
 *   the main thread or from inside the render worker (nested workers), and
 *   only ever receives the pixel rows it must filter.
 * - Sized from `navigator.hardwareConcurrency`, capped lower on phones and
 *   low-memory devices; with fewer than two workers the caller stays serial.
 * - Bands are sliced only when dispatched, so at most `size` band copies are
 *   in flight (bounded extra memory on mobile).
 * - Cancellation stops dispatching and terminates busy workers; a worker
 *   failure falls back to the synchronous kernels with identical output.
 */

import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';
import { filterBandHalo, planFilterBands, renderFilterBand, sliceBandInput } from './filterBands.ts';
import type { FilterWorkerRequest, FilterWorkerResponse } from './filter-band.worker.ts';

export type FilterWorkerLike = {
  postMessage: (message: FilterWorkerRequest, transfer: Transferable[]) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<FilterWorkerResponse>) => void) | null;
  onerror: ((event: unknown) => void) | null;
};

/** A request before the pool assigns its id. */
type FilterWorkerMessage = FilterWorkerRequest extends infer Request
  ? Request extends FilterWorkerRequest ? Omit<Request, 'id'> : never
  : never;

type NavigatorHints = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
  userAgentData?: { mobile?: boolean };
};

/** Desktop and phone caps for the filter pool. */
export const FILTER_WORKERS_MAX_DESKTOP = 8;
export const FILTER_WORKERS_MAX_MOBILE = 2;
/** Layers smaller than this stay on the serial path (worker start-up dominates). */
export const FILTER_PARALLEL_MIN_PIXELS = 512 * 1024;
/** Approximate pixels per band on large images. */
export const FILTER_BAND_TARGET_PIXELS = 512 * 1024;

/** Number of filter workers for this device (0 or 1 means "stay serial"). */
export function filterWorkerCount(hints: NavigatorHints | undefined = globalThis.navigator as NavigatorHints | undefined): number {
  const cores = hints && Number.isSafeInteger(hints.hardwareConcurrency) && hints.hardwareConcurrency! > 0
    ? hints.hardwareConcurrency!
    : 2;
  const mobile = Boolean(
    hints?.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|Mobi/i.test(hints?.userAgent ?? '') ||
    (typeof hints?.deviceMemory === 'number' && hints.deviceMemory <= 4),
  );
  // Leave one core for the thread that coordinates (main or render worker).
  return Math.max(1, Math.min(mobile ? FILTER_WORKERS_MAX_MOBILE : FILTER_WORKERS_MAX_DESKTOP, cores - 1));
}

function abortError(): Error {
  const error = new Error('Filter rendering cancelled');
  error.name = 'AbortError';
  return error;
}

type Task = {
  id: number;
  message: FilterWorkerRequest;
  transfer: Transferable[];
  resolve: (pixels: Uint8ClampedArray) => void;
  reject: (error: Error) => void;
  worker?: FilterWorkerLike;
};

export class FilterWorkerPool {
  readonly size: number;
  private readonly createWorker: () => FilterWorkerLike;
  private readonly idleMs: number;
  private readonly idle: FilterWorkerLike[] = [];
  private readonly busy = new Map<FilterWorkerLike, Task>();
  private readonly queue: Task[] = [];
  private idleTimer?: ReturnType<typeof setTimeout>;
  private nextId = 1;
  /** Set after a worker fails to load or crashes; callers fall back. */
  broken = false;

  constructor(options: { size: number; createWorker: () => FilterWorkerLike; idleMs?: number }) {
    this.size = Math.max(1, Math.floor(options.size));
    this.createWorker = options.createWorker;
    this.idleMs = options.idleMs ?? 20_000;
  }

  get workerCount(): number {
    return this.idle.length + this.busy.size;
  }

  /** Run one request; resolves with the worker's output pixels. */
  run(message: FilterWorkerMessage, transfer: Transferable[]): { promise: Promise<Uint8ClampedArray>; cancel: () => void } {
    const id = this.nextId++;
    let task!: Task;
    const promise = new Promise<Uint8ClampedArray>((resolve, reject) => {
      task = { id, message: { ...message, id } as FilterWorkerRequest, transfer, resolve, reject };
    });
    this.queue.push(task);
    this.pump();
    return { promise, cancel: () => this.cancel(task) };
  }

  private cancel(task: Task): void {
    const queued = this.queue.indexOf(task);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
      task.reject(abortError());
      return;
    }
    if (task.worker && this.busy.get(task.worker) === task) {
      // A running kernel cannot be interrupted; drop its worker instead.
      this.busy.delete(task.worker);
      task.worker.terminate();
      task.reject(abortError());
      this.pump();
    }
  }

  private pump(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    while (this.queue.length) {
      let worker = this.idle.pop();
      if (!worker) {
        if (this.workerCount >= this.size) break;
        try {
          worker = this.createWorker();
        } catch (error) {
          this.broken = true;
          for (const task of this.queue.splice(0)) task.reject(error instanceof Error ? error : new Error('Filter worker unavailable'));
          return;
        }
        const created = worker;
        created.onmessage = (event) => this.onMessage(created, event.data);
        created.onerror = () => this.onFailure(created, new Error('Filter worker failed'));
      }
      const task = this.queue.shift()!;
      task.worker = worker;
      this.busy.set(worker, task);
      try {
        worker.postMessage(task.message, task.transfer);
      } catch (error) {
        this.onFailure(worker, error instanceof Error ? error : new Error('Filter worker post failed'));
      }
    }
    if (!this.queue.length && !this.busy.size && this.idle.length)
      this.idleTimer = setTimeout(() => this.terminate(), this.idleMs);
  }

  private onMessage(worker: FilterWorkerLike, value: FilterWorkerResponse): void {
    const task = this.busy.get(worker);
    if (!task) return;
    this.busy.delete(worker);
    this.idle.push(worker);
    if (value && value.kind === 'done' && value.id === task.id && value.pixels instanceof ArrayBuffer)
      task.resolve(new Uint8ClampedArray(value.pixels));
    else task.reject(new Error(value && value.kind === 'error' ? value.message : 'Invalid filter worker response'));
    this.pump();
  }

  private onFailure(worker: FilterWorkerLike, error: Error): void {
    this.broken = true;
    const task = this.busy.get(worker);
    this.busy.delete(worker);
    const index = this.idle.indexOf(worker);
    if (index >= 0) this.idle.splice(index, 1);
    worker.terminate();
    task?.reject(error);
    this.pump();
  }

  /** Stop every worker; queued tasks are rejected as cancelled. */
  terminate(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    for (const task of this.queue.splice(0)) task.reject(abortError());
    for (const [worker, task] of this.busy) {
      worker.terminate();
      task.reject(abortError());
    }
    this.busy.clear();
    for (const worker of this.idle.splice(0)) worker.terminate();
  }
}

let shared: FilterWorkerPool | null | undefined;
let sharedSize: number | undefined;

/**
 * The context's shared pool, or undefined when workers are unavailable or
 * pointless. `globalThis.__PIXELFORGE_FILTER_WORKERS__` (an integer ≥ 0)
 * overrides the device-derived size for tests; 0 or 1 disables the pool.
 */
export function sharedFilterWorkerPool(): FilterWorkerPool | undefined {
  const scope = globalThis as typeof globalThis & { __PIXELFORGE_FILTER_WORKERS__?: number };
  const override = scope.__PIXELFORGE_FILTER_WORKERS__;
  const size = typeof override === 'number' && Number.isSafeInteger(override) && override >= 0
    ? Math.min(FILTER_WORKERS_MAX_DESKTOP, override)
    : filterWorkerCount();
  if (shared !== undefined && sharedSize === size) return shared && !shared.broken ? shared : undefined;
  shared?.terminate();
  sharedSize = size;
  if (typeof Worker !== 'function' || size < 2) {
    shared = null;
    return undefined;
  }
  shared = new FilterWorkerPool({
    size,
    createWorker: () => new Worker(new URL('./filter-band.worker.ts', import.meta.url), { type: 'module' }) as unknown as FilterWorkerLike,
  });
  return shared;
}

export type ParallelFilterOptions = {
  pool?: FilterWorkerPool;
  signal?: AbortSignal;
  isCancelled?: () => boolean;
  /** Called after each completed band with monotonic counts. */
  onProgress?: (completed: number, total: number) => void;
  /** Bands per worker; more bands balance load and report progress more often. */
  bandsPerWorker?: number;
  minPixels?: number;
};

/** Whether `applyFilterEffectsParallel` would split this effect into bands. */
export function isParallelFilterEffect(value: Partial<FilterEffects> | undefined): boolean {
  return filterBandHalo(value) !== undefined;
}

/**
 * Apply an effect to RGBA pixels, using parallel row bands when the effect is
 * band-safe, the image is large enough and a pool is available. The result
 * is byte-identical to `applyFilterEffectsPixels`.
 */
export async function applyFilterEffectsParallel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  value: Partial<FilterEffects> | undefined,
  options: ParallelFilterOptions = {},
): Promise<Uint8ClampedArray> {
  const effect = effectiveFilterEffects(value);
  const halo = filterBandHalo(effect);
  const pool = options.pool ?? sharedFilterWorkerPool();
  const cancelled = () => Boolean(options.signal?.aborted || options.isCancelled?.());
  if (cancelled()) throw abortError();
  if (halo === undefined || !pool || pool.broken || width * height < (options.minPixels ?? FILTER_PARALLEL_MIN_PIXELS))
    return applyFilterEffectsPixels(pixels, width, height, effect);
  // At least three bands per worker for load balance, and bands of about
  // half a megapixel so progress (which restarts the render watchdog's
  // no-progress window) arrives every second or so even on slow devices.
  const bands = planFilterBands(
    height,
    halo,
    Math.max(pool.size * (options.bandsPerWorker ?? 3), Math.ceil((width * height) / FILTER_BAND_TARGET_PIXELS)),
  );
  const output = new Uint8ClampedArray(pixels.length);
  const running = new Set<() => void>();
  let next = 0, completed = 0;
  let onAbort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      let failed = false;
      const fail = (error: Error) => {
        if (failed) return;
        failed = true;
        for (const cancel of running) cancel();
        running.clear();
        reject(error);
      };
      onAbort = () => fail(abortError());
      options.signal?.addEventListener('abort', onAbort, { once: true });
      const launch = () => {
        while (!failed && running.size < pool.size && next < bands.length) {
          if (cancelled()) return fail(abortError());
          const band = bands[next++];
          const input = sliceBandInput(pixels, width, band);
          const job = pool.run({
            kind: 'band', effect, width, height,
            readStart: band.readStart, readRows: band.readEnd - band.readStart,
            start: band.start, end: band.end, pixels: input.buffer as ArrayBuffer,
          }, [input.buffer as ArrayBuffer]);
          running.add(job.cancel);
          job.promise.then((rows) => {
            running.delete(job.cancel);
            if (failed) return;
            if (rows.length !== (band.end - band.start) * width * 4)
              return fail(new Error('Filter band returned the wrong size'));
            output.set(rows, band.start * width * 4);
            completed += 1;
            if (cancelled()) return fail(abortError());
            try {
              options.onProgress?.(completed, bands.length);
            } catch (error) {
              return fail(error instanceof Error ? error : new Error(String(error)));
            }
            if (completed === bands.length) resolve();
            else launch();
          }, (error: Error) => {
            running.delete(job.cancel);
            fail(error);
          });
        }
      };
      launch();
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    // A worker that cannot load or crashed: the serial kernels give the same bytes.
    if (cancelled()) throw abortError();
    return applyFilterEffectsPixels(pixels, width, height, effect);
  } finally {
    if (onAbort) options.signal?.removeEventListener('abort', onAbort);
  }
  return output;
}

/**
 * Tile renderer for the tiled document path: runs each tile's kernel in the
 * pool, falling back to the serial kernel if the pool fails.
 */
export function pooledTileRenderer(pool: FilterWorkerPool) {
  return async (
    input: Uint8ClampedArray,
    width: number,
    height: number,
    effect: FilterEffects,
    renderCenter?: { x: number; y: number },
  ): Promise<Uint8ClampedArray> => {
    if (pool.broken) return applyFilterEffectsPixels(input, width, height, effect, renderCenter);
    const copy = input.slice();
    try {
      return await pool.run({
        kind: 'pixels', effect, width, height, renderCenter, pixels: copy.buffer as ArrayBuffer,
      }, [copy.buffer as ArrayBuffer]).promise;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      return applyFilterEffectsPixels(input, width, height, effect, renderCenter);
    }
  };
}

/** Serial in-process band renderer, exported for tests of the pool protocol. */
export function renderFilterWorkerRequest(request: FilterWorkerRequest): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(request.pixels);
  return request.kind === 'band'
    ? renderFilterBand({ ...request, pixels })
    : applyFilterEffectsPixels(pixels, request.width, request.height, request.effect, request.renderCenter);
}
