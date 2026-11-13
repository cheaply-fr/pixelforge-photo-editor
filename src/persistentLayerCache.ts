/**
 * On-device second tier for the layer filter cache (layerFilterCache.ts).
 *
 * A large painting keeps more expensive filtered layers (Clouds, Lens Flare,
 * blurs, Smart Filter stacks, styles) than the in-memory byte budget holds:
 * at 2646 x 4096 a surface is 43 MB, so 256-512 MB keeps 6-12 of 80 layers.
 * Every render that misses then recomputes seconds of filtering per layer:
 * reopening the draft, and the first stroke after opening, which redraws
 * every layer between the nearest cached composite and the edited one.
 *
 * This store keeps those finished local surfaces on the device, losslessly
 * (PNG), in IndexedDB, keyed by the same content key as the memory cache
 * (asset fingerprint plus every local-stage input; never position, opacity or
 * blend). Reading one back decodes a PNG instead of re-running the filter,
 * and gives byte-identical pixels. Only surfaces of at least
 * PERSIST_MIN_PIXELS that took longer to produce than a decode would take
 * are written, writes run one at a time after the render, and the store is
 * bounded by bytes with least-recently-used eviction.
 *
 * Everything stays in this browser profile (like the draft itself) and is
 * derived from the user's own layers; nothing is uploaded. Failures (no
 * IndexedDB, quota, private mode, encode errors) are silent misses.
 */

/** Smallest surface worth persisting; smaller filters recompute quickly. */
export const PERSIST_MIN_PIXELS = 1_000_000;
/**
 * Shortest compute worth persisting. Reading an entry back costs roughly a
 * PNG decode, ~20 ns per pixel (about 220 ms at 2646 x 4096), so a surface
 * is written when computing it took longer than that, and at least
 * PERSIST_MIN_COMPUTE_MS.
 */
export const PERSIST_MIN_COMPUTE_MS = 50;
export const PERSIST_COMPUTE_NS_PER_PIXEL = 20;
export const PERSIST_DESKTOP_BYTES = 1024 * 1024 * 1024;
export const PERSIST_MOBILE_BYTES = 256 * 1024 * 1024;
export const PERSIST_LOW_MEMORY_BYTES = 0;
/** Surfaces read ahead of the render (decoded, so each holds w x h x 4 bytes). */
export const PERSIST_PREFETCH_DESKTOP = 4;
export const PERSIST_PREFETCH_MOBILE = 1;
const TOUCH_DELAY_MS = 1000;

const DATABASE = 'pixelforge-layer-cache';
const BLOBS = 'blobs';
const META = 'meta';

export type PersistedMeta = {
  id: string;
  bytes: number;
  used: number;
  w: number;
  h: number;
  /** Caller-defined label stored with the entry (e.g. the composite key of a preview). */
  tag?: string;
};

/** Byte budget by coarse device hints (same buckets as the memory caches). */
export function persistentLayerCacheBudget(hints: { deviceMemory?: number; mobile?: boolean } = {}): number {
  const memory = typeof hints.deviceMemory === 'number' && Number.isFinite(hints.deviceMemory) && hints.deviceMemory > 0
    ? hints.deviceMemory
    : undefined;
  if (memory !== undefined && memory <= 2) return PERSIST_LOW_MEMORY_BYTES;
  if (hints.mobile === true || (memory !== undefined && memory <= 4)) return PERSIST_MOBILE_BYTES;
  return PERSIST_DESKTOP_BYTES;
}

/**
 * Read-ahead depth for a store of this budget: each prefetched surface is
 * held decoded until its layer renders, so mobile budgets read one ahead.
 */
export function persistentPrefetchLimit(budget: number): number {
  if (budget <= 0) return 0;
  return budget >= PERSIST_DESKTOP_BYTES ? PERSIST_PREFETCH_DESKTOP : PERSIST_PREFETCH_MOBILE;
}

/** Whether a computed surface is worth writing. */
export function shouldPersistSurface(w: number, h: number, computeMs: number, budget: number): boolean {
  const pixels = Math.max(0, Math.trunc(w)) * Math.max(0, Math.trunc(h));
  const worthMs = Math.max(PERSIST_MIN_COMPUTE_MS, (pixels * PERSIST_COMPUTE_NS_PER_PIXEL) / 1e6);
  return budget > 0 && pixels >= PERSIST_MIN_PIXELS && computeMs >= worthMs && pixels * 4 <= budget;
}

/**
 * Whether a cropped frame-space result (a clipped layer, masked styles) is
 * worth writing. Producing one costs full-frame work whatever the size of
 * the crop, so small and empty crops qualify too; reading one back costs a
 * decode of the crop.
 */
export function shouldPersistPlaced(w: number, h: number, computeMs: number, budget: number): boolean {
  const pixels = Math.max(0, Math.trunc(w)) * Math.max(0, Math.trunc(h));
  const worthMs = Math.max(PERSIST_MIN_COMPUTE_MS, (pixels * PERSIST_COMPUTE_NS_PER_PIXEL) / 1e6);
  return budget > 0 && computeMs >= worthMs && pixels * 4 <= budget;
}

/**
 * Entries to evict (least recently used first) so `incoming` more bytes fit
 * in `budget`. Pure, for tests.
 */
export function persistedEvictions(entries: readonly PersistedMeta[], incoming: number, budget: number): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0) + incoming;
  const victims: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.used - b.used || (a.id < b.id ? -1 : 1))) {
    if (total <= budget) break;
    victims.push(entry.id);
    total -= entry.bytes;
  }
  return victims;
}

/** Hex SHA-256 of the content key (keys can hold whole stroke lists). */
export async function persistentKeyId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Surface = HTMLCanvasElement | OffscreenCanvas;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Counters of one context's store (diagnostics; never persisted or sent anywhere). */
export type PersistentLayerCacheStats = {
  hits: number;
  misses: number;
  queued: number;
  writes: number;
  failed: number;
  skipped: number;
  readMs: number;
  prefetches: number;
  budget: number;
};

const STATS_FIELDS = ['hits', 'misses', 'queued', 'writes', 'failed', 'skipped', 'readMs', 'prefetches', 'budget'] as const;

/** Counters between two snapshots (`budget` is taken from `after`). */
export function persistentLayerCacheDelta(
  before: PersistentLayerCacheStats,
  after: PersistentLayerCacheStats,
): PersistentLayerCacheStats {
  const delta = { ...after };
  for (const field of STATS_FIELDS) if (field !== 'budget') delta[field] = Math.max(0, after[field] - before[field]);
  return delta;
}

export function validPersistentLayerCacheStats(value: unknown): value is PersistentLayerCacheStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stats = value as Record<string, unknown>;
  return STATS_FIELDS.every((field) => Number.isSafeInteger(stats[field]) && (stats[field] as number) >= 0);
}

/** Publish one render's on-device cache counters as a best-effort performance mark. */
export function markPersistentLayerCacheStats(stats: PersistentLayerCacheStats): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.persistent-layer-cache', { detail: { ...stats } });
  } catch {
    // Diagnostics must never affect rendering.
  }
}

const request = <T>(value: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });

const done = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

async function encodePng(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    let canvas: OffscreenCanvas;
    if (source instanceof OffscreenCanvas) {
      // A canvas nothing has drawn on yet has no context, and convertToBlob
      // rejects without one (a fully transparent placeholder, say).
      source.getContext('2d');
      canvas = source;
    } else {
      canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.drawImage(source, 0, 0);
    }
    return canvas.convertToBlob({ type: 'image/png' });
  }
  const canvas = source as HTMLCanvasElement;
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png'));
}

export class PersistentLayerCache {
  private database: Promise<IDBDatabase | undefined> | undefined;
  /** Writes run one at a time so encoding never piles up behind a render. */
  private queue: Promise<void> = Promise.resolve();
  private pending = new Set<string>();
  private prefetched = new Map<string, Promise<{ surface: Surface; tag?: string } | undefined>>();
  /** Recency updates, written together once reads go quiet. */
  private touched = new Map<string, PersistedMeta>();
  private touchTimer: ReturnType<typeof setTimeout> | undefined;
  hits = 0;
  /** Reads started ahead of use. */
  prefetches = 0;
  misses = 0;
  /** Writes queued (`put` accepted) and completed. */
  queued = 0;
  writes = 0;
  /** Writes that failed (quota, encode) and computed surfaces not worth keeping. */
  failed = 0;
  skipped = 0;
  /** Total time spent reading entries back (IndexedDB read + PNG decode). */
  readMs = 0;

  readonly budget: number;
  /** Decoded surfaces a render may read ahead (see `prefetch`). */
  readonly prefetchLimit: number;
  private readonly create: (w: number, h: number) => Surface;

  constructor(budget: number, create: (w: number, h: number) => Surface, prefetchLimit = persistentPrefetchLimit(budget)) {
    this.budget = budget;
    this.create = create;
    this.prefetchLimit = prefetchLimit;
  }

  private open(): Promise<IDBDatabase | undefined> {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase | undefined>((resolve) => {
      try {
        if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return resolve(undefined);
        const complete = (database: IDBDatabase) =>
          database.objectStoreNames.contains(BLOBS) && database.objectStoreNames.contains(META);
        // A database created by another opener without our stores (any
        // version) is upgraded once to add them.
        const attempt = (version: number | undefined, retry: boolean) => {
          const opening = version === undefined ? indexedDB.open(DATABASE) : indexedDB.open(DATABASE, version);
          opening.onupgradeneeded = () => {
            const database = opening.result;
            if (!database.objectStoreNames.contains(BLOBS)) database.createObjectStore(BLOBS);
            if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: 'id' });
          };
          opening.onsuccess = () => {
            const database = opening.result;
            if (complete(database)) {
              // Another context upgrading later must not be blocked by us,
              // and a connection closed by it (or by the browser) is
              // reopened on next use instead of failing every later read
              // and write of this session.
              const forget = () => {
                if (this.database === opened) this.database = undefined;
              };
              database.onversionchange = () => {
                database.close();
                forget();
              };
              database.onclose = forget;
              resolve(database);
              return;
            }
            const next = database.version + 1;
            database.close();
            if (retry) attempt(next, false);
            else resolve(undefined);
          };
          opening.onerror = () => resolve(undefined);
          opening.onblocked = () => resolve(undefined);
        };
        attempt(undefined, true);
      } catch {
        resolve(undefined);
      }
    });
    const opened = this.database;
    // A failed or blocked open is not memoized: a later call retries.
    void opened.then((database) => {
      if (!database && this.database === opened) this.database = undefined;
    });
    return opened;
  }

  /** The persisted surface for `key`, decoded into a new canvas, or undefined. */
  async get(key: string): Promise<Surface | undefined> {
    return (await this.getTagged(key))?.surface;
  }

  /**
   * Start reading `key` now, so a render that needs it a few layers later
   * finds it decoded (reads and PNG decodes of several layers then overlap
   * each other and the render, instead of running one after another). At
   * most `limit` reads are held; `get`/`getTagged` take them over, and
   * `releasePrefetched` drops the ones a render did not use.
   */
  prefetch(key: string, limit = this.prefetchLimit): boolean {
    if (this.budget <= 0 || this.prefetched.has(key) || this.prefetched.size >= limit) return false;
    this.prefetched.set(key, this.readTimed(key));
    this.prefetches += 1;
    return true;
  }

  /** Reads started by `prefetch` and not taken over yet. */
  get prefetching(): number {
    return this.prefetched.size;
  }

  /** Drop prefetched surfaces nobody took over (end or cancellation of a render). */
  releasePrefetched(): void {
    this.prefetched.clear();
  }

  /**
   * Like `get`, also returning the entry's tag. With `tag`, an entry stored
   * under another tag is a miss and is not decoded.
   */
  async getTagged(key: string, tag?: string): Promise<{ surface: Surface; tag?: string } | undefined> {
    if (this.budget <= 0) return undefined;
    const ahead = this.prefetched.get(key);
    if (ahead) {
      this.prefetched.delete(key);
      const found = await ahead;
      return found && (tag === undefined || found.tag === tag) ? found : undefined;
    }
    return this.readTimed(key, tag);
  }

  private async readTimed(key: string, tag?: string): Promise<{ surface: Surface; tag?: string } | undefined> {
    const started = now();
    try {
      return await this.read(key, tag);
    } finally {
      this.readMs += now() - started;
    }
  }

  private async read(key: string, tag?: string): Promise<{ surface: Surface; tag?: string } | undefined> {
    try {
      const database = await this.open();
      if (!database) return undefined;
      const id = await persistentKeyId(key);
      const read = database.transaction([BLOBS, META], 'readonly');
      const [blob, meta] = await Promise.all([
        request(read.objectStore(BLOBS).get(id)) as Promise<Blob | undefined>,
        request(read.objectStore(META).get(id)) as Promise<PersistedMeta | undefined>,
      ]);
      if (!blob || !meta || (tag !== undefined && meta.tag !== tag)) {
        this.misses += 1;
        return undefined;
      }
      const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'default', colorSpaceConversion: 'none' });
      const { w, h } = meta;
      if (bitmap.width !== w || bitmap.height !== h) {
        bitmap.close();
        this.misses += 1;
        return undefined;
      }
      const target = this.create(w, h);
      (target.getContext('2d') as CanvasRenderingContext2D).drawImage(bitmap, 0, 0);
      bitmap.close();
      this.hits += 1;
      this.touch({ ...meta, used: Date.now() });
      return { surface: target, tag: meta.tag };
    } catch {
      this.misses += 1;
      return undefined;
    }
  }

  /**
   * Recency only orders eviction, so updates are batched into one write once
   * reads go quiet (a lost update is harmless). A read-write transaction per
   * hit would queue behind, and hold up, the reads of the next layers.
   */
  private touch(meta: PersistedMeta): void {
    this.touched.set(meta.id, meta);
    clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => {
      const batch = [...this.touched.values()];
      this.touched.clear();
      void this.open().then((database) => {
        if (!database || !batch.length) return;
        try {
          const write = database.transaction(META, 'readwrite');
          for (const entry of batch) write.objectStore(META).put(entry);
        } catch {
          // Best effort.
        }
      });
    }, TOUCH_DELAY_MS);
  }

  /**
   * Queue a write. The surface is encoded right away (the encoder snapshots
   * it), so a caller may keep using it; storage happens in the background.
   * Resolves true once the entry is stored, false when it was not (another
   * write of `key` in flight, no budget, quota or encode failure).
   */
  put(key: string, source: CanvasImageSource, w: number, h: number, tag?: string): Promise<boolean> {
    if (this.budget <= 0 || this.pending.has(key)) return Promise.resolve(false);
    this.pending.add(key);
    this.queued += 1;
    let encoded: Promise<Blob>;
    try {
      encoded = encodePng(source, w, h);
    } catch {
      this.pending.delete(key);
      this.failed += 1;
      return Promise.resolve(false);
    }
    encoded.catch(() => undefined);
    let stored = false;
    this.queue = this.queue.then(async () => {
      try {
        const [database, blob, id] = await Promise.all([this.open(), encoded, persistentKeyId(key)]);
        if (!database || blob.size > this.budget) {
          this.failed += 1;
          return;
        }
        const metas = (await request(database.transaction(META, 'readonly').objectStore(META).getAll())) as PersistedMeta[];
        const victims = persistedEvictions(metas.filter((meta) => meta.id !== id), blob.size, this.budget);
        const write = database.transaction([BLOBS, META], 'readwrite');
        for (const victim of victims) {
          write.objectStore(BLOBS).delete(victim);
          write.objectStore(META).delete(victim);
        }
        write.objectStore(BLOBS).put(blob, id);
        write.objectStore(META).put({ id, bytes: blob.size, used: Date.now(), w, h, ...(tag === undefined ? {} : { tag }) } satisfies PersistedMeta);
        await done(write);
        this.writes += 1;
        stored = true;
      } catch {
        // Quota or encode failure: the layer is simply recomputed next time.
        this.failed += 1;
      } finally {
        this.pending.delete(key);
      }
    });
    return this.queue.then(() => stored);
  }

  stats(): PersistentLayerCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      queued: this.queued,
      writes: this.writes,
      failed: this.failed,
      skipped: this.skipped,
      readMs: Math.round(this.readMs),
      prefetches: this.prefetches,
      budget: this.budget,
    };
  }

  /** Resolves once queued writes have finished (tests). */
  flush(): Promise<void> {
    return this.queue;
  }
}

let shared: PersistentLayerCache | undefined;

const EMPTY_STATS: PersistentLayerCacheStats = { hits: 0, misses: 0, queued: 0, writes: 0, failed: 0, skipped: 0, readMs: 0, prefetches: 0, budget: 0 };

/** Counters of this context's store (zeros before it exists). */
export function persistentLayerCacheStats(): PersistentLayerCacheStats {
  return shared ? shared.stats() : { ...EMPTY_STATS };
}

/** The context's store, or undefined when persistence is unavailable or off. */
export function sharedPersistentLayerCache(create: (w: number, h: number) => Surface): PersistentLayerCache | undefined {
  if (typeof indexedDB === 'undefined') return undefined;
  const global = globalThis as { navigator?: Navigator & { deviceMemory?: number } };
  if (!shared) {
    const browser = global.navigator;
    shared = new PersistentLayerCache(
      persistentLayerCacheBudget({
        deviceMemory: browser?.deviceMemory,
        mobile: /Android|iPhone|iPad|Mobile/i.test(browser?.userAgent || ''),
      }),
      create,
    );
  }
  return shared.budget > 0 ? shared : undefined;
}
