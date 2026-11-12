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

/** Whether a computed surface is worth writing. */
export function shouldPersistSurface(w: number, h: number, computeMs: number, budget: number): boolean {
  const pixels = Math.max(0, Math.trunc(w)) * Math.max(0, Math.trunc(h));
  const worthMs = Math.max(PERSIST_MIN_COMPUTE_MS, (pixels * PERSIST_COMPUTE_NS_PER_PIXEL) / 1e6);
  return budget > 0 && pixels >= PERSIST_MIN_PIXELS && computeMs >= worthMs && pixels * 4 <= budget;
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
    if (source instanceof OffscreenCanvas) canvas = source;
    else {
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
  hits = 0;
  misses = 0;
  writes = 0;

  readonly budget: number;
  private readonly create: (w: number, h: number) => Surface;

  constructor(budget: number, create: (w: number, h: number) => Surface) {
    this.budget = budget;
    this.create = create;
  }

  private open(): Promise<IDBDatabase | undefined> {
    this.database ??= new Promise<IDBDatabase | undefined>((resolve) => {
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
              // Another context upgrading later must not be blocked by us.
              database.onversionchange = () => database.close();
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
    return this.database;
  }

  /** The persisted surface for `key`, decoded into a new canvas, or undefined. */
  async get(key: string): Promise<Surface | undefined> {
    return (await this.getTagged(key))?.surface;
  }

  /**
   * Like `get`, also returning the entry's tag. With `tag`, an entry stored
   * under another tag is a miss and is not decoded.
   */
  async getTagged(key: string, tag?: string): Promise<{ surface: Surface; tag?: string } | undefined> {
    if (this.budget <= 0) return undefined;
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
      // Recency only orders eviction; a lost update is harmless.
      const touch = database.transaction(META, 'readwrite');
      touch.objectStore(META).put({ ...meta, used: Date.now() });
      return { surface: target, tag: meta.tag };
    } catch {
      this.misses += 1;
      return undefined;
    }
  }

  /**
   * Queue a write. The surface is encoded right away (the encoder snapshots
   * it), so a caller may keep using it; storage happens in the background.
   */
  put(key: string, source: CanvasImageSource, w: number, h: number, tag?: string): void {
    if (this.budget <= 0 || this.pending.has(key)) return;
    this.pending.add(key);
    let encoded: Promise<Blob>;
    try {
      encoded = encodePng(source, w, h);
    } catch {
      this.pending.delete(key);
      return;
    }
    encoded.catch(() => undefined);
    this.queue = this.queue.then(async () => {
      try {
        const [database, blob, id] = await Promise.all([this.open(), encoded, persistentKeyId(key)]);
        if (!database || blob.size > this.budget) return;
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
      } catch {
        // Quota or encode failure: the layer is simply recomputed next time.
      } finally {
        this.pending.delete(key);
      }
    });
  }

  /** Resolves once queued writes have finished (tests). */
  flush(): Promise<void> {
    return this.queue;
  }
}

let shared: PersistentLayerCache | undefined;

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
