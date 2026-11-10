/**
 * Tiled, Blob-backed raster assets (docs/tiled-layer-assets-contract.md).
 *
 * A large asset is a row-major grid of content-addressed 256 × 256 PNG tiles.
 * Tiles are immutable and shared by object between assets, layers and history
 * steps, so a commit encodes only the tiles whose pixels are new, budgets
 * count each distinct tile once, and drafts store each tile once.
 *
 * This module has no DOM dependency at import time: the pure grid, hashing,
 * validation and accounting helpers run in Node tests and the render worker;
 * canvas encode/decode helpers take their surfaces from the caller.
 */

export const TILE_SIZE = 256 as const;
/** Canvases with at least this many pixels are stored tiled by `addAsset`. */
export const TILED_ASSET_MIN_PIXELS = 1024 * 1024;
/** Upper bound for one encoded tile (256² RGBA plus PNG framing is ~263 KB). */
export const MAX_TILE_BYTES = 1024 * 1024;
export const TILE_KEY_PATTERN = /^[0-9a-f]{32}$/;

export type PngAsset = { url: string; w: number; h: number };
export type AssetTile = { readonly key: string; readonly blob: Blob };
export type TiledAsset = {
  w: number;
  h: number;
  tileSize: typeof TILE_SIZE;
  /** Row-major cells; `null` is a fully transparent tile. */
  tiles: (AssetTile | null)[];
};
export type AnyAsset = PngAsset | TiledAsset;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function isTiledAsset(value: unknown): value is TiledAsset {
  return isRecord(value) && Array.isArray(value.tiles) && value.tileSize === TILE_SIZE;
}
export function isPngAsset(value: unknown): value is PngAsset {
  return isRecord(value) && typeof value.url === 'string';
}
/** Either representation, without validating pixels (cheap shape check). */
export function isAssetShape(value: unknown): value is AnyAsset {
  return isPngAsset(value) || isTiledAsset(value);
}

export function tileGrid(w: number, h: number): { cols: number; rows: number } {
  return { cols: Math.ceil(w / TILE_SIZE), rows: Math.ceil(h / TILE_SIZE) };
}

/** Pixel rectangle of cell `index` in a `w × h` asset. */
export function tileRect(w: number, h: number, index: number): { x: number; y: number; w: number; h: number } {
  const { cols } = tileGrid(w, h);
  const x = (index % cols) * TILE_SIZE,
    y = Math.floor(index / cols) * TILE_SIZE;
  return { x, y, w: Math.min(TILE_SIZE, w - x), h: Math.min(TILE_SIZE, h - y) };
}

const hex8 = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
function avalanche(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return h ^ (h >>> 16);
}

/**
 * 128-bit content key of one tile of straight-alpha RGBA words (`stride`
 * words per row), or `null` when every byte is zero (a transparent tile).
 * Four independent 32-bit lanes; dimensions are mixed in so a 256 × 128 edge
 * tile never aliases a 128 × 256 one.
 */
export function hashTilePixels(
  words: Uint32Array,
  stride: number,
  x: number,
  y: number,
  w: number,
  h: number,
): string | null {
  let a = 0x811c9dc5 ^ w,
    b = 0x9e3779b9 ^ Math.imul(h, 0x10001),
    c = 0x85ebca6b ^ Math.imul(w, 31) ^ h,
    d = 0x27d4eb2f,
    any = 0;
  for (let row = 0; row < h; row += 1) {
    let i = (y + row) * stride + x;
    const end = i + w;
    for (; i < end; i += 1) {
      const v = words[i];
      any |= v;
      a = Math.imul(a ^ v, 0x01000193);
      b = Math.imul(b ^ v, 0x5bd1e995);
      b ^= b >>> 15;
      c = Math.imul((c + v) | 0, 0xcc9e2d51);
      c = (c << 15) | (c >>> 17);
      d = (Math.imul(d ^ (v >>> 16), 0x165667b1) + Math.imul(v & 0xffff, 0x9e3779b1)) | 0;
      d = (d << 13) | (d >>> 19);
    }
    // Row boundaries matter: two tiles with the same words in a different
    // shape are already separated by w/h, this keeps rows distinct too.
    d = Math.imul(d ^ row, 0x85ebca6b);
  }
  if (!any) return null;
  return hex8(avalanche(a)) + hex8(avalanche(b ^ a)) + hex8(avalanche(c)) + hex8(avalanche(d ^ c));
}

// ---------------------------------------------------------------------------
// Tab-wide tile index: equal pixels share one immutable tile object.

const tileIndex = new Map<string, WeakRef<AssetTile>>();
const tileRegistry =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry<string>((key) => {
        const ref = tileIndex.get(key);
        if (ref && ref.deref() === undefined) tileIndex.delete(key);
      })
    : undefined;

/** The live tile for `key`, if any asset in this tab still holds it. */
export function knownTile(key: string): AssetTile | undefined {
  const ref = tileIndex.get(key);
  const tile = ref?.deref();
  if (ref && !tile) tileIndex.delete(key);
  return tile;
}
/** Register a tile (or return the already registered one with the same key). */
export function internTile(tile: AssetTile): AssetTile {
  const existing = knownTile(tile.key);
  if (existing) return existing;
  if (typeof WeakRef === 'function') {
    tileIndex.set(tile.key, new WeakRef(tile));
    tileRegistry?.register(tile, tile.key);
  }
  return tile;
}
/** Test hook: forget every indexed tile. */
export function clearTileIndexForTesting(): void {
  tileIndex.clear();
}

export type TileEncodeStats = {
  tiles: number;
  encoded: number;
  reused: number;
  empty: number;
  /** Tiles read back and hashed (all of them on a full scan). */
  hashed: number;
  /** Tiles copied from the hint's base outside its dirty rectangle, unread. */
  skipped: number;
  /** True when a dirty-rectangle hint limited the readback. */
  hinted: boolean;
  /** Why a supplied hint was not used (the commit scanned the whole canvas). */
  fallback?: TileHintFallback;
  /**
   * Diagnostics only (`__PIXELFORGE_VERIFY_TILE_HINTS__`): whether a full
   * scan of the same canvas produced exactly the same tiles.
   */
  fullScanMatch?: boolean;
};

/**
 * A fully transparent `w × h` tiled asset (every cell `null`): the hint base
 * for a freshly created canvas whose only content is the hint's rectangle.
 */
export function emptyTiledAsset(w: number, h: number): TiledAsset {
  const { cols, rows } = tileGrid(w, h);
  return { w, h, tileSize: TILE_SIZE, tiles: Array.from({ length: cols * rows }, () => null) };
}

/**
 * The smallest rectangle covering every non-empty tile of `asset` (pixels
 * outside it are all transparent), or `null` when every tile is empty.
 */
export function tiledContentRegion(asset: TiledAsset): { x: number; y: number; width: number; height: number } | null {
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  asset.tiles.forEach((tile, index) => {
    if (!tile) return;
    const rect = tileRect(asset.w, asset.h, index);
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  });
  return right > left ? { x: left, y: top, width: right - left, height: bottom - top } : null;
}

/** Pixel rectangle (integer, half-open) in an asset's own pixel space. */
export type TileDirtyRect = { x: number; y: number; w: number; h: number };

/**
 * Dirty-rectangle hint for a tiled commit: the canvas being stored equals
 * `base` (the asset it was drawn from, at the same size) everywhere outside
 * `dirty`. `dirty: null` means nothing changed. Tiles wholly outside the
 * rectangle reuse `base`'s tiles without being read back or hashed.
 */
export type TileCommitHint = { base: unknown; dirty: TileDirtyRect | null };

export type TileHintFallback = 'no-base' | 'base-size' | 'base-invalid' | 'dirty-invalid';

/**
 * Why `hint` cannot be used for a `w × h` commit, or `undefined` when it can.
 * A hint is only usable when its base is a structurally valid tiled asset of
 * exactly the same dimensions (no expansion, trim or crop happened since the
 * canvas was drawn from it) and the rectangle is finite.
 */
export function tileHintFallback(w: number, h: number, hint: TileCommitHint): TileHintFallback | undefined {
  const base = hint.base;
  if (!isTiledAsset(base)) return 'no-base';
  if (base.w !== w || base.h !== h) return 'base-size';
  const { cols, rows } = tileGrid(w, h);
  if (base.tiles.length !== cols * rows || !base.tiles.every((tile) => tile === null || validTile(tile)))
    return 'base-invalid';
  const dirty = hint.dirty;
  if (dirty === null) return undefined;
  if (
    !dirty ||
    typeof dirty !== 'object' ||
    ![dirty.x, dirty.y, dirty.w, dirty.h].every(Number.isFinite) ||
    dirty.w < 0 ||
    dirty.h < 0
  )
    return 'dirty-invalid';
  return undefined;
}

/**
 * Tile cells (inclusive column/row ranges) a dirty rectangle touches in a
 * `w × h` grid, or `null` when it covers no pixel of the asset.
 */
export function dirtyTileRange(
  w: number,
  h: number,
  dirty: TileDirtyRect | null,
): { col0: number; col1: number; row0: number; row1: number } | null {
  if (!dirty) return null;
  const left = Math.max(0, Math.floor(dirty.x)),
    top = Math.max(0, Math.floor(dirty.y)),
    right = Math.min(w, Math.ceil(dirty.x + dirty.w)),
    bottom = Math.min(h, Math.ceil(dirty.y + dirty.h));
  if (right <= left || bottom <= top) return null;
  return {
    col0: Math.floor(left / TILE_SIZE),
    col1: Math.floor((right - 1) / TILE_SIZE),
    row0: Math.floor(top / TILE_SIZE),
    row1: Math.floor((bottom - 1) / TILE_SIZE),
  };
}

/**
 * Build a tiled asset from pixels read in bands of up to 256 rows.
 * `readBand(y, rows, x, width)` returns `width × rows` straight-alpha RGBA
 * bytes starting at column `x` (a full scan always asks for `x = 0, width =
 * w`); `encode(x, y, w, h)` returns the PNG Blob of that rectangle. Only
 * tiles whose key no live tile (or `base` tile) already has are encoded.
 *
 * With a usable `hint` (see `tileHintFallback`) only the tile cells its dirty
 * rectangle touches are read and hashed; every other cell is `hint.base`'s
 * tile, by object. Because tiles are content addressed, the result equals
 * the full scan whenever the hint is true (pixels outside the rectangle equal
 * the base's). An unusable hint falls back to the full scan and says why in
 * `stats.fallback`.
 */
export function tileAssetFromBands(
  w: number,
  h: number,
  readBand: (y: number, rows: number, x: number, width: number) => Uint8ClampedArray | Uint8Array,
  encode: (x: number, y: number, w: number, h: number) => Blob,
  base?: AnyAsset,
  hint?: TileCommitHint,
): { asset: TiledAsset; stats: TileEncodeStats } {
  const { cols, rows } = tileGrid(w, h);
  const tiles: (AssetTile | null)[] = Array.from({ length: cols * rows }, () => null);
  const stats: TileEncodeStats = {
    tiles: tiles.length,
    encoded: 0,
    reused: 0,
    empty: 0,
    hashed: 0,
    skipped: 0,
    hinted: false,
  };
  const fallback = hint ? tileHintFallback(w, h, hint) : undefined;
  if (fallback) stats.fallback = fallback;
  const hintBase = hint && !fallback ? (hint.base as TiledAsset) : undefined;
  const range = hintBase ? dirtyTileRange(w, h, hint!.dirty) : undefined;
  const baseTiles = new Map<string, AssetTile>();
  for (const source of [base, hintBase])
    if (isTiledAsset(source)) for (const tile of source.tiles) if (tile) baseTiles.set(tile.key, tile);
  if (hintBase) {
    stats.hinted = true;
    hintBase.tiles.forEach((tile, index) => {
      const col = index % cols,
        row = Math.floor(index / cols);
      if (range && col >= range.col0 && col <= range.col1 && row >= range.row0 && row <= range.row1) return;
      stats.skipped += 1;
      if (tile) {
        tiles[index] = internTile(tile);
        stats.reused += 1;
      } else stats.empty += 1;
    });
  }
  const col0 = hintBase ? (range?.col0 ?? 0) : 0,
    col1 = hintBase ? (range?.col1 ?? -1) : cols - 1,
    row0 = hintBase ? (range?.row0 ?? 0) : 0,
    row1 = hintBase ? (range?.row1 ?? -1) : rows - 1;
  const bandX = col0 * TILE_SIZE,
    bandWidth = col1 >= col0 ? Math.min(w, (col1 + 1) * TILE_SIZE) - bandX : 0;
  for (let row = row0; row <= row1 && bandWidth > 0; row += 1) {
    const y = row * TILE_SIZE,
      bandRows = Math.min(TILE_SIZE, h - y);
    const bytes = readBand(y, bandRows, bandX, bandWidth);
    if (bytes.byteLength !== bandWidth * bandRows * 4) throw new Error('Tile band has the wrong size');
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bandWidth * bandRows);
    for (let col = col0; col <= col1; col += 1) {
      const x = col * TILE_SIZE,
        tw = Math.min(TILE_SIZE, w - x);
      stats.hashed += 1;
      const key = hashTilePixels(words, bandWidth, x - bandX, 0, tw, bandRows);
      if (key === null) {
        stats.empty += 1;
        continue;
      }
      let tile = baseTiles.get(key) ?? knownTile(key);
      if (tile) stats.reused += 1;
      else {
        tile = { key, blob: encode(x, y, tw, bandRows) };
        stats.encoded += 1;
      }
      tiles[row * cols + col] = internTile(tile);
    }
  }
  return { asset: { w, h, tileSize: TILE_SIZE, tiles }, stats };
}

/** Bytes of a base64 PNG data URL (native `fromBase64` where available). */
export function dataUrlBytes(url: string): Uint8Array<ArrayBuffer> {
  const encoded = url.slice(url.indexOf(',') + 1);
  const native = (Uint8Array as unknown as { fromBase64?: (value: string) => Uint8Array<ArrayBuffer> })
    .fromBase64;
  if (typeof native === 'function') {
    try {
      return native(encoded);
    } catch {
      // Fall through to the manual decode.
    }
  }
  const binary = atob(encoded),
    bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type Canvas2D = {
  width: number;
  height: number;
  getContext(kind: '2d', options?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D | null;
};
const scratch = new Map<string, HTMLCanvasElement>();
function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  const id = `${w}x${h}`;
  let canvas = scratch.get(id);
  if (!canvas) {
    if (scratch.size > 8) scratch.clear();
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    scratch.set(id, canvas);
  }
  return canvas;
}

/**
 * Main-thread tiling of a canvas (synchronous, like `toDataURL`). Each new
 * tile is drawn from the source into a tile-sized canvas and PNG encoded, so
 * it decodes to exactly the pixels that were hashed.
 */
export function tileCanvas(
  source: HTMLCanvasElement,
  base?: AnyAsset,
  hint?: TileCommitHint,
): { asset: TiledAsset; stats: TileEncodeStats } {
  const context = (source as Canvas2D).getContext('2d')!;
  return tileAssetFromBands(
    source.width,
    source.height,
    (y, rows, x, width) => context.getImageData(x, y, width, rows).data,
    (x, y, w, h) => {
      const target = scratchCanvas(w, h),
        ctx = target.getContext('2d')!;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      return new Blob([dataUrlBytes(target.toDataURL('image/png'))], { type: 'image/png' });
    },
    base,
    hint,
  );
}

type Drawable = CanvasImageSource & { width: number; height: number; close?: () => void };

async function decodeTileBlob(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') return (await createImageBitmap(blob)) as Drawable;
  if (typeof Image === 'function' && typeof URL?.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight }) as Drawable;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error('Image decoding is unavailable in this browser.');
}

/** Check that one tile decodes to `w × h` pixels without keeping them. */
export async function verifyTileDecodes(tile: AssetTile, w: number, h: number): Promise<void> {
  const image = await decodeTileBlob(tile.blob);
  try {
    if (image.width !== w || image.height !== h) throw new Error('Project image dimensions do not match');
  } finally {
    image.close?.();
  }
}

// ---------------------------------------------------------------------------
// Decoded-tile cache: assembling a version that shares tiles with one already
// assembled (undo, redo, the next stroke's start) draws the shared tiles from
// decoded bitmaps instead of decoding their PNG Blobs again.

export const DECODED_TILE_CACHE_DESKTOP_BYTES = 96 * 1024 * 1024;
export const DECODED_TILE_CACHE_LARGE_DESKTOP_BYTES = 192 * 1024 * 1024;
export const DECODED_TILE_CACHE_MOBILE_BYTES = 32 * 1024 * 1024;
export const DECODED_TILE_CACHE_LOW_MEMORY_BYTES = 12 * 1024 * 1024;

export type DecodedTileCacheStats = {
  /** Tiles drawn from a cached bitmap. */
  hits: number;
  /** Tiles that had to be decoded from their PNG Blob. */
  misses: number;
  stores: number;
  /** Tiles stored from pixels the caller already held (no PNG decode). */
  seeded: number;
  evictions: number;
  /** Tiles that could not be retained (budget 0, or larger than the budget). */
  rejected: number;
  entries: number;
  bytes: number;
  maxBytes: number;
};

type ClosableBitmap = CanvasImageSource & { width: number; height: number; close?: () => void };

/**
 * Least-recently-used decoded tiles, bounded by their RGBA bytes. Keys are
 * tile content keys plus the encoded size, so a structured clone of a tile
 * (the render worker's copy) hits the same entry. Evicted bitmaps are closed
 * immediately: callers draw a bitmap synchronously right after `get`, so no
 * caller holds one across an `await`.
 */
export class DecodedTileCache {
  private readonly entries = new Map<string, { bitmap: ClosableBitmap; bytes: number }>();
  private totalBytes = 0;
  private counters = { hits: 0, misses: 0, stores: 0, seeded: 0, evictions: 0, rejected: 0 };
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
      throw new RangeError('Cache byte budget must be a non-negative safe integer');
    this.maxBytes = maxBytes;
  }

  static key(tile: AssetTile): string {
    return `${tile.key}:${tile.blob.size}`;
  }

  get(tile: AssetTile): ClosableBitmap | undefined {
    const key = DecodedTileCache.key(tile);
    const entry = this.entries.get(key);
    if (!entry) {
      this.counters.misses += 1;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.counters.hits += 1;
    return entry.bitmap;
  }

  has(tile: AssetTile): boolean {
    return this.entries.has(DecodedTileCache.key(tile));
  }

  /**
   * Retain `bitmap` for `tile`. Returns false (and leaves the bitmap to the
   * caller) when it cannot be retained; on true the cache owns it.
   */
  set(tile: AssetTile, bitmap: ClosableBitmap, seeded = false): boolean {
    const key = DecodedTileCache.key(tile),
      bytes = bitmap.width * bitmap.height * 4;
    if (this.entries.has(key)) return false;
    if (bytes > this.maxBytes) {
      this.counters.rejected += 1;
      return false;
    }
    for (const [oldestKey, oldest] of this.entries) {
      if (this.totalBytes + bytes <= this.maxBytes) break;
      this.entries.delete(oldestKey);
      this.totalBytes -= oldest.bytes;
      this.counters.evictions += 1;
      oldest.bitmap.close?.();
    }
    this.entries.set(key, { bitmap, bytes });
    this.totalBytes += bytes;
    this.counters.stores += 1;
    if (seeded) this.counters.seeded += 1;
    return true;
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.bitmap.close?.();
    this.entries.clear();
    this.totalBytes = 0;
  }

  stats(): DecodedTileCacheStats {
    return { ...this.counters, entries: this.entries.size, bytes: this.totalBytes, maxBytes: this.maxBytes };
  }
}

export type DecodedTileCacheDeviceHints = { deviceMemory?: number; mobile?: boolean };

/** Device-aware byte budget (same tiers as the layer filter cache). */
export function decodedTileCacheBudgetForDevice(hints: DecodedTileCacheDeviceHints = {}): number {
  const memory =
    typeof hints.deviceMemory === 'number' && Number.isFinite(hints.deviceMemory) && hints.deviceMemory > 0
      ? hints.deviceMemory
      : undefined;
  if (memory !== undefined && memory <= 2) return DECODED_TILE_CACHE_LOW_MEMORY_BYTES;
  if (hints.mobile === true || (memory !== undefined && memory <= 4)) return DECODED_TILE_CACHE_MOBILE_BYTES;
  if (memory !== undefined && memory >= 8) return DECODED_TILE_CACHE_LARGE_DESKTOP_BYTES;
  return DECODED_TILE_CACHE_DESKTOP_BYTES;
}

let sharedTileCache: DecodedTileCache | undefined;
/** The per-context (main thread or worker) decoded-tile cache. */
export function sharedDecodedTileCache(): DecodedTileCache {
  if (!sharedTileCache) {
    const browser = (globalThis as { navigator?: Navigator & { deviceMemory?: number } }).navigator;
    sharedTileCache = new DecodedTileCache(
      browser
        ? decodedTileCacheBudgetForDevice({
            deviceMemory: browser.deviceMemory,
            mobile: /Android|iPhone|iPad|Mobile/i.test(browser.userAgent || ''),
          })
        : DECODED_TILE_CACHE_DESKTOP_BYTES,
    );
  }
  return sharedTileCache;
}
/** Release every decoded tile (e.g. when a different document is installed). */
export function clearDecodedTileCache(): void {
  sharedTileCache?.clear();
}

/** Counter difference between two snapshots (current sizes from `after`). */
export function decodedTileCacheDelta(
  before: DecodedTileCacheStats,
  after: DecodedTileCacheStats,
): DecodedTileCacheStats {
  const diff = (key: 'hits' | 'misses' | 'stores' | 'seeded' | 'evictions' | 'rejected') =>
    Math.max(0, after[key] - before[key]);
  return {
    hits: diff('hits'),
    misses: diff('misses'),
    stores: diff('stores'),
    seeded: diff('seeded'),
    evictions: diff('evictions'),
    rejected: diff('rejected'),
    entries: after.entries,
    bytes: after.bytes,
    maxBytes: after.maxBytes,
  };
}

export function validDecodedTileCacheStats(value: unknown): value is DecodedTileCacheStats {
  if (!isRecord(value)) return false;
  return ['hits', 'misses', 'stores', 'seeded', 'evictions', 'rejected', 'entries', 'bytes', 'maxBytes'].every(
    (key) => Number.isSafeInteger(value[key]) && (value[key] as number) >= 0,
  );
}

/**
 * Publish decoded-tile counters as a best-effort performance mark
 * (`pixelforge.decoded-tile-cache`, detail `{ ...stats, context }`).
 */
export function markDecodedTileCacheStats(stats: DecodedTileCacheStats, context: 'main' | 'worker'): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.decoded-tile-cache', { detail: { ...stats, context } });
  } catch {
    // Diagnostics must never affect rendering.
  }
}

/**
 * Seed the decoded-tile cache from pixels the caller already holds for a
 * just-committed tiled asset (`source` is exactly the asset's pixels, e.g.
 * the private snapshot `primeDecodedAsset` keeps), so assembling an older or
 * newer version that shares these tiles does not decode them. Only tiles not
 * cached yet are copied, and nothing is seeded when the asset's tiles would
 * take more than half the budget (it would only evict other tiles).
 */
export async function seedDecodedTiles(
  asset: TiledAsset,
  source: ImageBitmapSource,
  cache: DecodedTileCache = sharedDecodedTileCache(),
): Promise<number> {
  if (typeof createImageBitmap !== 'function' || !validTiledAsset(asset)) return 0;
  const missing: number[] = [];
  let bytes = 0;
  asset.tiles.forEach((tile, index) => {
    if (!tile || cache.has(tile)) return;
    const rect = tileRect(asset.w, asset.h, index);
    bytes += rect.w * rect.h * 4;
    missing.push(index);
  });
  if (!missing.length || bytes > cache.maxBytes / 2) return 0;
  let seeded = 0;
  for (const index of missing) {
    const tile = asset.tiles[index]!,
      rect = tileRect(asset.w, asset.h, index);
    if (cache.has(tile)) continue;
    const bitmap = (await createImageBitmap(source, rect.x, rect.y, rect.w, rect.h)) as ClosableBitmap;
    if (bitmap.width !== rect.w || bitmap.height !== rect.h || !cache.set(tile, bitmap, true)) bitmap.close?.();
    else seeded += 1;
  }
  return seeded;
}

/**
 * Draw every tile into `context` (which must be `w × h` and cleared), from
 * the decoded-tile cache where possible and otherwise by decoding the tile
 * Blob (which is then cached). A tile whose decoded size differs from its
 * cell fails the decode and is never cached.
 */
export async function drawTiledAsset(
  asset: TiledAsset,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  concurrency = 8,
  cache: DecodedTileCache | null = sharedDecodedTileCache(),
): Promise<void> {
  if (!validTiledAsset(asset)) throw new Error('Invalid or oversized project image');
  // Cells with equal keys (e.g. flat colour) decode once.
  const pending = new Map<string, { tile: AssetTile; cells: number[] }>();
  asset.tiles.forEach((tile, index) => {
    if (!tile) return;
    const queued = pending.get(DecodedTileCache.key(tile));
    if (queued) {
      queued.cells.push(index);
      return;
    }
    // Cached tiles are drawn synchronously, before any decode starts.
    const cached = cache?.get(tile);
    if (cached) {
      const rect = tileRect(asset.w, asset.h, index);
      context.drawImage(cached, rect.x, rect.y);
    } else pending.set(DecodedTileCache.key(tile), { tile, cells: [index] });
  });
  const queue = [...pending.values()];
  let failure: unknown;
  const lane = async () => {
    while (queue.length && failure === undefined) {
      const { tile, cells } = queue.shift()!;
      try {
        const image = await decodeTileBlob(tile.blob);
        let retained = false;
        try {
          for (const index of cells) {
            const rect = tileRect(asset.w, asset.h, index);
            if (image.width !== rect.w || image.height !== rect.h)
              throw new Error('Project image dimensions do not match');
            context.drawImage(image, rect.x, rect.y);
          }
          // Only bitmaps can be cached (an <img> fallback has no close()).
          retained = typeof image.close === 'function' && !!cache && !cache.has(tile) && cache.set(tile, image);
        } finally {
          if (!retained) image.close?.();
        }
      } catch (error) {
        failure ??= error;
      }
    }
  };
  if (queue.length)
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, lane));
  if (failure !== undefined) throw failure;
}

// ---------------------------------------------------------------------------
// Validation, identity and accounting.

export function validTile(value: unknown): value is AssetTile {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    TILE_KEY_PATTERN.test(value.key) &&
    typeof Blob === 'function' &&
    value.blob instanceof Blob &&
    value.blob.size > 0 &&
    value.blob.size <= MAX_TILE_BYTES
  );
}

/** Structural validation; pixels are checked when the asset is decoded. */
export function validTiledAsset(value: unknown): value is TiledAsset {
  if (!isRecord(value) || value.tileSize !== TILE_SIZE || !Array.isArray(value.tiles)) return false;
  const { w, h } = value;
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    Number(w) < 1 ||
    Number(h) < 1 ||
    Number(w) > 16000 ||
    Number(h) > 16000 ||
    Number(w) * Number(h) > 16000000
  )
    return false;
  const { cols, rows } = tileGrid(Number(w), Number(h));
  if (value.tiles.length !== cols * rows) return false;
  return value.tiles.every((tile) => tile === null || validTile(tile));
}

/** 64-bit hash of a string (FNV-1a and a Murmur-style lane). */
function hashString(value: string): string {
  let fnv = 0x811c9dc5,
    mix = 0x9e3779b9 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 0x01000193);
    mix = Math.imul(mix ^ code, 0x5bd1e995);
    mix ^= mix >>> 15;
  }
  return hex8(fnv) + hex8(mix);
}

const signatures = new WeakMap<object, string>();
/** Content fingerprint of a tiled asset: dimensions, tile count and keys. */
export function tiledAssetFingerprint(asset: TiledAsset): string {
  let signature = signatures.get(asset);
  if (signature === undefined) {
    signature = `${asset.w}x${asset.h}:t${asset.tiles.length}:${hashString(
      asset.tiles.map((tile) => (tile ? tile.key : '-')).join(''),
    )}`;
    signatures.set(asset, signature);
  }
  return signature;
}

/** Budget cost of a tile: the base64 length of its PNG, like a data URL. */
export function tileBudgetBytes(tile: AssetTile): number {
  return Math.ceil(tile.blob.size / 3) * 4;
}

/**
 * Storage units an asset occupies, for budgets that count shared content
 * once: a legacy asset is one unit (`asset:<id>`, its data-URL length), a
 * tiled asset one unit per distinct tile (`tile:<key>`).
 */
export function assetStorageUnits(id: string, asset: unknown): Array<[string, number]> {
  if (isTiledAsset(asset)) {
    const units = new Map<string, number>();
    for (const tile of asset.tiles) if (tile) units.set(`tile:${tile.key}`, tileBudgetBytes(tile));
    return [...units];
  }
  if (isPngAsset(asset)) return [[`asset:${id}`, asset.url.length]];
  return [];
}

/** Distinct-unit bytes of an asset map (shared tiles counted once). */
export function uniqueAssetBytes(assets: Record<string, unknown>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const [id, asset] of Object.entries(assets))
    for (const [unit, bytes] of assetStorageUnits(id, asset)) {
      if (seen.has(unit)) continue;
      seen.add(unit);
      total += bytes;
    }
  return total;
}

export function hasTiledAssets(assets: Record<string, unknown>): boolean {
  return Object.values(assets).some(isTiledAsset);
}
