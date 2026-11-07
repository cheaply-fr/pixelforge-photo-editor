import {
  effectiveFilterEffects,
  isNeutralFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';
import { effectiveSmartFilters } from './smartFilters.ts';
import { effectiveMatting } from './matting.ts';
import { isNeutralLayerStyles } from './layerStyles.ts';

/**
 * Bounded memoization of a raster layer's layer-local filtered pixels.
 *
 * The document renderer builds every raster layer in local coordinates in a
 * fixed order: source asset (or solid fill) -> Spot Healing -> Patch ->
 * Content-Aware Fill/Move/Scale -> Matting -> Smart Filters -> Layer Styles ->
 * Filter Effect. Only after that local surface exists are the layer matrix,
 * CSS/tonal adjustments, masks, opacity, blend mode, visibility and grouping
 * applied in frame space. A key therefore describes exactly the inputs of the
 * local stage and deliberately omits the frame-space compositing metadata,
 * so editing another layer, moving this layer or changing its opacity can
 * reuse an expensive Clouds/blur result without changing a single pixel.
 *
 * Cached values are treated as immutable: the renderer only reads them with
 * `drawImage`, and an entry is a surface the local stage created for itself
 * (never a decoded asset or a caller's override canvas).
 */

export const LAYER_FILTER_CACHE_KEY_VERSION = 1;
export const LAYER_FILTER_CACHE_DESKTOP_BYTES = 256 * 1024 * 1024;
export const LAYER_FILTER_CACHE_MOBILE_BYTES = 96 * 1024 * 1024;
export const LAYER_FILTER_CACHE_LOW_MEMORY_BYTES = 32 * 1024 * 1024;

export type LayerFilterCacheStats = {
  hits: number;
  misses: number;
  stores: number;
  evictions: number;
  /** Results larger than the whole budget are computed but never retained. */
  rejected: number;
  entries: number;
  bytes: number;
  maxBytes: number;
};

type Entry<V> = { value: V; bytes: number };

/** Least-recently-used map bounded by the sum of entry byte sizes. */
export class ByteLruCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private totalBytes = 0;
  private counters = { hits: 0, misses: 0, stores: 0, evictions: 0, rejected: 0 };

  readonly maxBytes: number;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
      throw new RangeError('Cache byte budget must be a non-negative safe integer');
    this.maxBytes = maxBytes;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.counters.misses += 1;
      return undefined;
    }
    // Map iteration order is insertion order; re-inserting marks it recent.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.counters.hits += 1;
    return entry.value;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Store a value. Returns false when it cannot fit in the budget at all. */
  set(key: string, value: V, bytes: number): boolean {
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new RangeError('Cache entry size must be a non-negative safe integer');
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.totalBytes -= previous.bytes;
    }
    if (bytes > this.maxBytes) {
      this.counters.rejected += 1;
      return false;
    }
    while (this.totalBytes + bytes > this.maxBytes && this.entries.size) {
      const [oldestKey, oldest] = this.entries.entries().next().value!;
      this.entries.delete(oldestKey);
      this.totalBytes -= oldest.bytes;
      this.counters.evictions += 1;
    }
    this.entries.set(key, { value, bytes });
    this.totalBytes += bytes;
    this.counters.stores += 1;
    return true;
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
    return true;
  }

  /** Drop every entry. Counters survive so diagnostics remain monotonic. */
  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  keys(): string[] {
    return [...this.entries.keys()];
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  stats(): LayerFilterCacheStats {
    return {
      ...this.counters,
      entries: this.entries.size,
      bytes: this.totalBytes,
      maxBytes: this.maxBytes,
    };
  }
}

/** JSON with object keys sorted, so property order never changes a key. */
export function stableSerialize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

/** Two independent 32-bit string hashes (FNV-1a and a Murmur-style mix). */
export function hashString(value: string): string {
  let fnv = 0x811c9dc5,
    mix = 0x9e3779b9 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 0x01000193);
    mix = Math.imul(mix ^ code, 0x5bd1e995);
    mix ^= mix >>> 15;
  }
  return `${(fnv >>> 0).toString(16).padStart(8, '0')}${(mix >>> 0).toString(16).padStart(8, '0')}`;
}

type FingerprintAsset = { url: string; w: number; h: number };
const fingerprints = new WeakMap<object, { url: string; fingerprint: string }>();

/**
 * Content fingerprint of an immutable image asset. Asset ids are random UUIDs
 * that are normally never reassigned, but an imported project or another
 * document can reuse an id, so the key also carries dimensions, length and a
 * 64-bit hash of the encoded data. The hash is memoized per asset object.
 */
export function assetFingerprint(asset: FingerprintAsset): string {
  const memo = fingerprints.get(asset);
  if (memo && memo.url === asset.url) return memo.fingerprint;
  const fingerprint = `${asset.w}x${asset.h}:${asset.url.length}:${hashString(asset.url)}`;
  fingerprints.set(asset, { url: asset.url, fingerprint });
  return fingerprint;
}

const FINGERPRINT_PATTERN = /^(\d{1,5})x(\d{1,5}):(\d{1,10}):[0-9a-f]{16}$/;

/**
 * Seed fingerprints computed by the main thread for structured-cloned assets
 * in the render worker. A value is accepted only when its dimensions and
 * encoded length match the asset; anything else is ignored and hashed locally.
 */
export function primeAssetFingerprints(
  assets: Record<string, FingerprintAsset | undefined>,
  keys: unknown,
): void {
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return;
  for (const [id, fingerprint] of Object.entries(keys as Record<string, unknown>)) {
    const asset = assets[id];
    if (!asset || typeof asset.url !== 'string' || typeof fingerprint !== 'string') continue;
    const match = FINGERPRINT_PATTERN.exec(fingerprint);
    if (
      !match ||
      Number(match[1]) !== asset.w ||
      Number(match[2]) !== asset.h ||
      Number(match[3]) !== asset.url.length
    )
      continue;
    fingerprints.set(asset, { url: asset.url, fingerprint });
  }
}

/** Fingerprints for the assets a render request carries (memoized per object). */
export function assetFingerprints(
  assets: Record<string, FingerprintAsset | undefined>,
): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const [id, asset] of Object.entries(assets))
    if (asset && typeof asset.url === 'string') keys[id] = assetFingerprint(asset);
  return keys;
}

/** The subset of a raster/smart-object layer that the local stage reads. */
export type LayerFilterCacheLayer = {
  kind: string;
  asset?: string;
  fillColor?: string;
  contents?: unknown;
  spotHealing?: Array<{ selectionMask?: string }>;
  patchStrokes?: Array<{ selectionMask?: string }>;
  contentAwareFills?: Array<{ mask?: string }>;
  contentAwareMoves?: Array<{ mask?: string }>;
  contentAwareScales?: Array<{ mask?: string }>;
  matting?: unknown;
  smartFilters?: unknown;
  styles?: unknown;
  adjustments?: { filterEffects?: Partial<FilterEffects> };
};

export type LayerFilterCacheKeyOptions = {
  /** True when the bounded tiled blur adapter (with its own telemetry) handles the filter. */
  tiledFilter?: boolean;
};

/**
 * Build the canonical cache key for a layer's local filtered surface, or
 * undefined when the layer has no expensive filter stage or cannot be keyed
 * safely (nested Smart Object contents, missing assets, tiled adapter).
 */
export function layerFilterCacheKey(
  layer: LayerFilterCacheLayer,
  assets: Record<string, FingerprintAsset | undefined>,
  options: LayerFilterCacheKeyOptions = {},
): string | undefined {
  if (layer.kind !== 'raster' && layer.kind !== 'smart-object') return undefined;
  // Nested contents render through their own layers, which are cached there.
  if (layer.kind === 'smart-object' && layer.contents) return undefined;
  if (typeof layer.asset !== 'string') return undefined;
  const source = assets[layer.asset];
  if (!source) return undefined;
  const filter = effectiveFilterEffects(layer.adjustments?.filterEffects);
  const filterActive = !isNeutralFilterEffects(filter);
  const smartFilters = effectiveSmartFilters(layer.smartFilters);
  if (!filterActive && !smartFilters.length) return undefined;
  if (filterActive && options.tiledFilter) return undefined;
  const raster = layer.kind === 'raster';
  const fillColor = raster && layer.fillColor ? layer.fillColor : undefined;
  const maskIds = new Set<string>();
  const local = raster
    ? {
        spotHealing: layer.spotHealing?.length ? layer.spotHealing : undefined,
        patchStrokes: layer.patchStrokes?.length ? layer.patchStrokes : undefined,
        contentAwareFills: layer.contentAwareFills?.length ? layer.contentAwareFills : undefined,
        contentAwareMoves: layer.contentAwareMoves?.length ? layer.contentAwareMoves : undefined,
        contentAwareScales: layer.contentAwareScales?.length ? layer.contentAwareScales : undefined,
      }
    : {};
  if (raster) {
    for (const stroke of [...(layer.spotHealing || []), ...(layer.patchStrokes || [])])
      if (stroke?.selectionMask) maskIds.add(stroke.selectionMask);
    for (const item of [
      ...(layer.contentAwareFills || []),
      ...(layer.contentAwareMoves || []),
      ...(layer.contentAwareScales || []),
    ])
      if (item?.mask) maskIds.add(item.mask);
  }
  const masks: Record<string, string | null> = {};
  for (const id of maskIds) {
    const mask = assets[id];
    // A missing optional mask is skipped by the renderer; record that state.
    masks[id] = mask ? assetFingerprint(mask) : null;
  }
  return stableSerialize({
    v: LAYER_FILTER_CACHE_KEY_VERSION,
    kind: layer.kind,
    w: source.w,
    h: source.h,
    // A solid fill only depends on the asset's dimensions, not its pixels.
    source: fillColor ? { fill: fillColor } : { asset: assetFingerprint(source) },
    ...local,
    masks,
    matting: layer.matting ? effectiveMatting(layer.matting as never) : undefined,
    smartFilters: smartFilters.length ? smartFilters : undefined,
    styles: isNeutralLayerStyles(layer.styles as never) ? undefined : layer.styles,
    filter: filterActive ? filter : undefined,
  });
}

export type LayerFilterCacheDeviceHints = {
  deviceMemory?: number;
  mobile?: boolean;
};

/** Device-aware byte budget; coarse hints are never persisted or sent. */
export function layerFilterCacheBudgetForDevice(hints: LayerFilterCacheDeviceHints = {}): number {
  const memory =
    typeof hints.deviceMemory === 'number' && Number.isFinite(hints.deviceMemory) && hints.deviceMemory > 0
      ? hints.deviceMemory
      : undefined;
  if (memory !== undefined && memory <= 2) return LAYER_FILTER_CACHE_LOW_MEMORY_BYTES;
  if (hints.mobile === true || (memory !== undefined && memory <= 4))
    return LAYER_FILTER_CACHE_MOBILE_BYTES;
  return LAYER_FILTER_CACHE_DESKTOP_BYTES;
}

export function detectLayerFilterCacheBudget(): number {
  const browser = (globalThis as { navigator?: Navigator & { deviceMemory?: number } }).navigator;
  if (!browser) return LAYER_FILTER_CACHE_DESKTOP_BYTES;
  return layerFilterCacheBudgetForDevice({
    deviceMemory: browser.deviceMemory,
    mobile: /Android|iPhone|iPad|Mobile/i.test(browser.userAgent || ''),
  });
}

/** Byte cost of a retained RGBA surface. */
export function surfaceBytes(width: number, height: number): number {
  return Math.max(0, Math.trunc(width)) * Math.max(0, Math.trunc(height)) * 4;
}

let sharedCache: ByteLruCache<CanvasImageSource> | undefined;

/** The per-context (main thread or worker) cache used by default renders. */
export function sharedLayerFilterCache(): ByteLruCache<CanvasImageSource> {
  sharedCache ??= new ByteLruCache<CanvasImageSource>(detectLayerFilterCacheBudget());
  return sharedCache;
}

/** Release cached surfaces, e.g. when a different document is installed. */
export function clearLayerFilterCache(): void {
  sharedCache?.clear();
}

/** Difference between two stat snapshots (counters) plus the latest occupancy. */
export function layerFilterCacheDelta(
  before: LayerFilterCacheStats,
  after: LayerFilterCacheStats,
): LayerFilterCacheStats {
  return {
    hits: after.hits - before.hits,
    misses: after.misses - before.misses,
    stores: after.stores - before.stores,
    evictions: after.evictions - before.evictions,
    rejected: after.rejected - before.rejected,
    entries: after.entries,
    bytes: after.bytes,
    maxBytes: after.maxBytes,
  };
}

export function validLayerFilterCacheStats(value: unknown): value is LayerFilterCacheStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stats = value as Record<string, unknown>;
  return ['hits', 'misses', 'stores', 'evictions', 'rejected', 'entries', 'bytes', 'maxBytes'].every(
    (key) => Number.isSafeInteger(stats[key]) && (stats[key] as number) >= 0,
  );
}

/** Publish per-render cache counters as a best-effort performance mark. */
export function markLayerFilterCacheStats(stats: LayerFilterCacheStats): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.layer-filter-cache', { detail: { ...stats } });
  } catch {
    // Diagnostics must never affect rendering.
  }
}
