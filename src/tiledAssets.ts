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

export type TileEncodeStats = { tiles: number; encoded: number; reused: number; empty: number };

/**
 * Build a tiled asset from pixels read in bands of up to 256 rows.
 * `readBand(y, rows)` returns `w × rows` straight-alpha RGBA bytes;
 * `encode(x, y, w, h)` returns the PNG Blob of that rectangle. Only tiles
 * whose key no live tile (or `base` tile) already has are encoded.
 */
export function tileAssetFromBands(
  w: number,
  h: number,
  readBand: (y: number, rows: number) => Uint8ClampedArray | Uint8Array,
  encode: (x: number, y: number, w: number, h: number) => Blob,
  base?: AnyAsset,
): { asset: TiledAsset; stats: TileEncodeStats } {
  const { cols, rows } = tileGrid(w, h);
  const tiles: (AssetTile | null)[] = Array.from({ length: cols * rows }, () => null);
  const stats: TileEncodeStats = { tiles: tiles.length, encoded: 0, reused: 0, empty: 0 };
  const baseTiles = new Map<string, AssetTile>();
  if (isTiledAsset(base)) for (const tile of base.tiles) if (tile) baseTiles.set(tile.key, tile);
  for (let row = 0; row < rows; row += 1) {
    const y = row * TILE_SIZE,
      bandRows = Math.min(TILE_SIZE, h - y);
    const bytes = readBand(y, bandRows);
    if (bytes.byteLength !== w * bandRows * 4) throw new Error('Tile band has the wrong size');
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, w * bandRows);
    for (let col = 0; col < cols; col += 1) {
      const x = col * TILE_SIZE,
        tw = Math.min(TILE_SIZE, w - x);
      const key = hashTilePixels(words, w, x, 0, tw, bandRows);
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
): { asset: TiledAsset; stats: TileEncodeStats } {
  const context = (source as Canvas2D).getContext('2d')!;
  return tileAssetFromBands(
    source.width,
    source.height,
    (y, rows) => context.getImageData(0, y, source.width, rows).data,
    (x, y, w, h) => {
      const target = scratchCanvas(w, h),
        ctx = target.getContext('2d')!;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(source, x, y, w, h, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      return new Blob([dataUrlBytes(target.toDataURL('image/png'))], { type: 'image/png' });
    },
    base,
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

/**
 * Decode every tile and draw it into `context` (which must be `w × h` and
 * cleared). A tile whose decoded size differs from its cell fails the decode.
 */
export async function drawTiledAsset(
  asset: TiledAsset,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  concurrency = 8,
): Promise<void> {
  if (!validTiledAsset(asset)) throw new Error('Invalid or oversized project image');
  const queue = asset.tiles.map((tile, index) => [tile, index] as const).filter(([tile]) => tile);
  let failure: unknown;
  const lane = async () => {
    while (queue.length && failure === undefined) {
      const [tile, index] = queue.shift()!;
      const rect = tileRect(asset.w, asset.h, index);
      try {
        const image = await decodeTileBlob(tile!.blob);
        try {
          if (image.width !== rect.w || image.height !== rect.h)
            throw new Error('Project image dimensions do not match');
          context.drawImage(image, rect.x, rect.y);
        } finally {
          image.close?.();
        }
      } catch (error) {
        failure ??= error;
      }
    }
  };
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
