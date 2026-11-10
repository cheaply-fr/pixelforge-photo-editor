/**
 * Content-addressed IndexedDB representation for editable drafts (storage
 * format 3).
 *
 * A draft's encoded assets are immutable data URLs that dominate its size,
 * while the history, settings and metadata are small. Format 3 therefore keeps
 * a small manifest pointer in the `drafts` store and stores each asset once in
 * the existing `draftBlobs` store under `asset:<draftId>:<sha256>`. A save only
 * writes assets whose content hash this draft does not already hold, then
 * removes this draft's unreferenced asset records and replaces the pointer in
 * the same read-write transaction. Keys are content hashes, not asset IDs, so a
 * preview asset that reuses an ID with different pixels can never alias an
 * older record. Records are namespaced per draft, so garbage collection never
 * needs to know which other drafts exist.
 *
 * Format 4 (tiled-layer-assets-contract.md) is written only when the draft
 * references tiled assets: such an asset's ref lists its tile keys, the
 * manifest's `tileRefs` maps each tile key to the SHA-256 of its PNG bytes,
 * and each distinct tile is one `pixelforge-draft-tile` record holding the
 * PNG Blob at `asset:<draftId>:<sha256>`. Drafts without tiled assets keep
 * format 3, so older builds still read them.
 *
 * The module is pure (no IndexedDB access) so integrity and planning rules are
 * covered by Node tests; `src/drafts.ts` owns the transactions.
 */
import { MAX_PROJECT_ASSETS } from './projectLimits.ts';
import type { Draft } from './drafts.ts';
import {
  TILE_KEY_PATTERN,
  TILE_SIZE,
  MAX_TILE_BYTES,
  internTile,
  isTiledAsset,
  tileGrid,
  type AssetTile,
  type TiledAsset,
} from './tiledAssets.ts';
import {
  AUDIO_NOTE_MAX_BYTES,
  AUDIO_NOTE_MAX_CLIPS,
  AUDIO_NOTE_MAX_DURATION_MS,
  AUDIO_NOTE_MIME_TYPES,
  type AudioClip,
  type AudioNoteMime,
} from './audioAnnotations.ts';

export const DRAFT_MANIFEST_KIND = 'pixelforge-draft-manifest' as const;
export const DRAFT_MANIFEST_FORMAT = 3 as const;
export const DRAFT_TILED_MANIFEST_FORMAT = 4 as const;
export const DRAFT_ASSET_KIND = 'pixelforge-draft-asset' as const;
export const DRAFT_TILE_KIND = 'pixelforge-draft-tile' as const;
/** Distinct tiles one draft may reference (far above 1 GiB of real tiles). */
export const MAX_DRAFT_TILES = 262_144;

export type DraftAssetRef = { hash: string; w: number; h: number };
export type DraftTiledAssetRef = {
  w: number;
  h: number;
  tileSize: typeof TILE_SIZE;
  /** Row-major tile keys; `null` is a transparent tile. */
  tiles: (string | null)[];
};

/** One Audio Annotation clip: its data URL's hash plus metadata. */
export type DraftAudioRef = { hash: string; mime: AudioNoteMime; bytes: number; durationMs: number };

export type DraftManifest = Omit<Draft, 'assets' | 'localRevision' | 'audio'> & {
  kind: typeof DRAFT_MANIFEST_KIND;
  format: typeof DRAFT_MANIFEST_FORMAT | typeof DRAFT_TILED_MANIFEST_FORMAT;
  /** Optimistic-concurrency revision; also read by older builds' conflict checks. */
  localRevision: number;
  /** Asset ID → content hash and dimensions, or (format 4) tile keys. */
  assetRefs: Record<string, DraftAssetRef | DraftTiledAssetRef>;
  /** Format 4: tile key → SHA-256 of the tile's PNG bytes. */
  tileRefs?: Record<string, string>;
  /**
   * Audio clip id → content hash and metadata. The clip's data URL is stored
   * as an ordinary asset record (same content-addressed key space).
   */
  audioRefs?: Record<string, DraftAudioRef>;
  savedAt: string;
};

/** One stored tile: the PNG Blob, addressed by the SHA-256 of its bytes. */
export type DraftTileRecord = {
  kind: typeof DRAFT_TILE_KIND;
  hash: string;
  blob: Blob;
};

/**
 * One stored asset: the UTF-8 (ASCII) bytes of its PNG data URL. Raw bytes
 * are cheaper for IndexedDB to clone than multi-megabyte strings and are
 * hashed directly on read without re-encoding.
 */
export type DraftAssetRecord = {
  kind: typeof DRAFT_ASSET_KIND;
  hash: string;
  bytes: ArrayBuffer;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-f0-9-]{36}$/;
const AUDIO_ID_PATTERN = /^[a-zA-Z0-9_-]{1,96}$/;
const MAX_ASSET_REFS = MAX_PROJECT_ASSETS;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const validRevision = (value: unknown): value is number =>
  Number.isInteger(value) &&
  Number(value) >= 0 &&
  Number(value) <= Number.MAX_SAFE_INTEGER;

const dimension = (value: unknown) =>
  Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 16000;

/** Key of one asset record inside the shared `draftBlobs` store. */
export function draftAssetKey(draftId: string, hash: string): string {
  return `asset:${draftId}:${hash}`;
}

/**
 * Inclusive key bounds covering every asset record of one draft. `~` sorts
 * after every lowercase hex digit, and chunk keys from format 2 never start
 * with `asset:`, so the range cannot touch chunks or another draft's assets.
 */
export function draftAssetKeyBounds(draftId: string): [string, string] {
  return [`asset:${draftId}:`, `asset:${draftId}:~`];
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Draft integrity checks are unavailable');
  return toHex(await globalThis.crypto.subtle.digest('SHA-256', bytes));
}

/** SHA-256 of an asset data URL (ASCII), used as its storage address. */
export function hashDraftAsset(url: string): Promise<string> {
  return sha256(new TextEncoder().encode(url));
}

const isTiledRef = (value: unknown): value is DraftTiledAssetRef =>
  isRecord(value) && Array.isArray(value.tiles);

function validTiledRef(ref: Record<string, unknown>, tileRefs: Record<string, unknown> | undefined): boolean {
  if (ref.tileSize !== TILE_SIZE || !dimension(ref.w) || !dimension(ref.h) || !Array.isArray(ref.tiles))
    return false;
  if (Number(ref.w) * Number(ref.h) > 16000000) return false;
  const { cols, rows } = tileGrid(Number(ref.w), Number(ref.h));
  return (
    ref.tiles.length === cols * rows &&
    ref.tiles.every(
      (key) => key === null || (typeof key === 'string' && !!tileRefs && Object.hasOwn(tileRefs, key)),
    )
  );
}

function validAudioRefs(value: unknown): value is Record<string, DraftAudioRef> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= AUDIO_NOTE_MAX_CLIPS &&
    entries.every(
      ([id, ref]) =>
        AUDIO_ID_PATTERN.test(id) &&
        isRecord(ref) &&
        typeof ref.hash === 'string' &&
        SHA256_PATTERN.test(ref.hash) &&
        (AUDIO_NOTE_MIME_TYPES as readonly unknown[]).includes(ref.mime) &&
        Number.isInteger(ref.bytes) &&
        Number(ref.bytes) >= 1 &&
        Number(ref.bytes) <= AUDIO_NOTE_MAX_BYTES &&
        Number.isInteger(ref.durationMs) &&
        Number(ref.durationMs) >= 1 &&
        Number(ref.durationMs) <= AUDIO_NOTE_MAX_DURATION_MS,
    )
  );
}

export function isDraftManifest(value: unknown): value is DraftManifest {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DraftManifest>;
  const tiledFormat = candidate.format === DRAFT_TILED_MANIFEST_FORMAT;
  if (
    candidate.kind !== DRAFT_MANIFEST_KIND ||
    (candidate.format !== DRAFT_MANIFEST_FORMAT && !tiledFormat) ||
    !validRevision(candidate.localRevision) ||
    !Array.isArray(candidate.history) ||
    !isRecord(candidate.assetRefs) ||
    typeof candidate.savedAt !== 'string' ||
    candidate.savedAt.length > 64
  )
    return false;
  let tileRefs: Record<string, unknown> | undefined;
  if (tiledFormat) {
    if (!isRecord(candidate.tileRefs)) return false;
    tileRefs = candidate.tileRefs;
    const entries = Object.entries(tileRefs);
    if (
      entries.length > MAX_DRAFT_TILES ||
      !entries.every(
        ([key, hash]) => TILE_KEY_PATTERN.test(key) && typeof hash === 'string' && SHA256_PATTERN.test(hash),
      )
    )
      return false;
  } else if (candidate.tileRefs !== undefined) return false;
  if (candidate.audioRefs !== undefined && !validAudioRefs(candidate.audioRefs)) return false;
  const refs = Object.entries(candidate.assetRefs);
  return (
    refs.length <= MAX_ASSET_REFS &&
    refs.every(([id, ref]) => {
      if (!ID_PATTERN.test(id) || !isRecord(ref)) return false;
      if (isTiledRef(ref)) return tiledFormat && validTiledRef(ref, tileRefs);
      return (
        typeof ref.hash === 'string' &&
        SHA256_PATTERN.test(ref.hash) &&
        dimension(ref.w) &&
        dimension(ref.h)
      );
    })
  );
}

export function isDraftAssetRecord(value: unknown): value is DraftAssetRecord {
  return (
    isRecord(value) &&
    value.kind === DRAFT_ASSET_KIND &&
    typeof value.hash === 'string' &&
    SHA256_PATTERN.test(value.hash) &&
    value.bytes instanceof ArrayBuffer &&
    value.bytes.byteLength > 0
  );
}

export function isDraftTileRecord(value: unknown): value is DraftTileRecord {
  return (
    isRecord(value) &&
    value.kind === DRAFT_TILE_KIND &&
    typeof value.hash === 'string' &&
    SHA256_PATTERN.test(value.hash) &&
    typeof Blob === 'function' &&
    value.blob instanceof Blob &&
    value.blob.size > 0 &&
    value.blob.size <= MAX_TILE_BYTES
  );
}

/** Distinct content hashes a manifest needs (assets, then tiles), in a stable order. */
export function manifestAssetHashes(manifest: DraftManifest): string[] {
  const hashes = new Set<string>();
  for (const ref of Object.values(manifest.assetRefs)) if (!isTiledRef(ref)) hashes.add(ref.hash);
  for (const hash of Object.values(manifest.tileRefs || {})) hashes.add(hash);
  for (const ref of Object.values(manifest.audioRefs || {})) hashes.add(ref.hash);
  return [...hashes];
}

const tileHashes = new WeakMap<AssetTile, string>();
/** SHA-256 of a tile's PNG bytes, computed once per tile object. */
export async function tileSha256(tile: AssetTile): Promise<string> {
  const known = tileHashes.get(tile);
  if (known) return known;
  const hash = await sha256(new Uint8Array(await tile.blob.arrayBuffer()));
  tileHashes.set(tile, hash);
  return hash;
}

/**
 * Build the format-3 pointer for a validated draft. `hashes` maps every asset
 * ID of the draft to the SHA-256 of its URL.
 */
export function createDraftManifest(
  draft: Draft,
  revision: number,
  hashes: ReadonlyMap<string, string>,
  now = new Date().toISOString(),
  tileHashesByKey: ReadonlyMap<string, string> = new Map(),
  audioHashes: ReadonlyMap<string, string> = new Map(),
): DraftManifest {
  if (!validRevision(revision)) throw new Error('Invalid draft revision');
  const { assets, localRevision: _previous, audio, ...rest } = draft;
  const audioRefs: Record<string, DraftAudioRef> = {};
  for (const [id, clip] of Object.entries(audio || {})) {
    const hash = audioHashes.get(id);
    if (!hash || !SHA256_PATTERN.test(hash)) throw new Error('Draft audio clip is not hashed');
    audioRefs[id] = { hash, mime: clip.mime, bytes: clip.bytes, durationMs: clip.durationMs };
  }
  const assetRefs: Record<string, DraftAssetRef | DraftTiledAssetRef> = {};
  const tileRefs: Record<string, string> = {};
  let tiled = false;
  for (const [id, asset] of Object.entries(assets)) {
    if (isTiledAsset(asset)) {
      tiled = true;
      const tiles = asset.tiles.map((tile) => {
        if (!tile) return null;
        const hash = tileHashesByKey.get(tile.key);
        if (!hash || !SHA256_PATTERN.test(hash)) throw new Error('Draft tile is not hashed');
        tileRefs[tile.key] = hash;
        return tile.key;
      });
      assetRefs[id] = { w: asset.w, h: asset.h, tileSize: TILE_SIZE, tiles };
      continue;
    }
    const hash = hashes.get(id);
    if (!hash || !SHA256_PATTERN.test(hash)) throw new Error('Draft asset is not hashed');
    assetRefs[id] = { hash, w: asset.w, h: asset.h };
  }
  return {
    ...rest,
    kind: DRAFT_MANIFEST_KIND,
    format: tiled ? DRAFT_TILED_MANIFEST_FORMAT : DRAFT_MANIFEST_FORMAT,
    localRevision: revision,
    assetRefs,
    ...(tiled ? { tileRefs } : {}),
    ...(Object.keys(audioRefs).length ? { audioRefs } : {}),
    savedAt: now,
  };
}

/**
 * Decide which asset records one commit writes and removes. `existingKeys` are
 * the keys this draft currently holds in storage (read inside the commit
 * transaction), so a record lost to an earlier fault is rewritten instead of
 * being assumed present, and records no longer referenced by the new manifest
 * are collected. Nothing outside this draft's namespace is ever returned.
 */
export function planDraftAssetWrites(
  draftId: string,
  needed: ReadonlyMap<string, string | Blob>,
  existingKeys: readonly unknown[],
): { puts: Array<[string, DraftAssetRecord | DraftTileRecord]>; deletes: string[] } {
  const [lower, upper] = draftAssetKeyBounds(draftId);
  const existing = new Set(
    existingKeys.filter(
      (key): key is string =>
        typeof key === 'string' && key >= lower && key <= upper,
    ),
  );
  const wanted = new Set<string>();
  const puts: Array<[string, DraftAssetRecord | DraftTileRecord]> = [];
  for (const [hash, content] of needed) {
    const key = draftAssetKey(draftId, hash);
    wanted.add(key);
    if (!existing.has(key))
      puts.push([
        key,
        typeof content === 'string'
          ? { kind: DRAFT_ASSET_KIND, hash, bytes: new TextEncoder().encode(content).buffer }
          : { kind: DRAFT_TILE_KIND, hash, blob: content },
      ]);
  }
  const deletes = [...existing].filter((key) => !wanted.has(key));
  return { puts, deletes };
}

/**
 * Rebuild the unvalidated Draft candidate from a manifest and its asset
 * records. Every referenced record must exist, be well formed, and hash to
 * its address; anything else fails closed so damaged bytes are never adopted.
 * The caller still runs full draft validation on the result.
 */
export async function decodeDraftManifest(
  manifest: unknown,
  records: ReadonlyMap<string, unknown>,
): Promise<unknown> {
  if (!isDraftManifest(manifest)) throw new Error('Draft manifest is invalid');
  const tileHashSet = new Set(Object.values(manifest.tileRefs || {}));
  const stored = new Map<string, ArrayBuffer>();
  const tileBlobs = new Map<string, Blob>();
  for (const hash of manifestAssetHashes(manifest)) {
    const value = records.get(hash);
    if (value === undefined) throw new Error('Draft asset is missing');
    if (tileHashSet.has(hash) && isDraftTileRecord(value) && value.hash === hash) {
      tileBlobs.set(hash, value.blob);
      continue;
    }
    if (!isDraftAssetRecord(value) || value.hash !== hash)
      throw new Error('Draft asset record is invalid');
    stored.set(hash, value.bytes);
  }
  // A content hash that names a tile must be a tile record, and vice versa.
  for (const hash of tileHashSet) if (!tileBlobs.has(hash)) throw new Error('Draft asset record is invalid');
  // Digests run concurrently (WebCrypto hashes off the main thread).
  const verified = await Promise.all([
    ...[...stored].map(async ([hash, bytes]) => (await sha256(new Uint8Array(bytes))) === hash),
    ...[...tileBlobs].map(
      async ([hash, blob]) => (await sha256(new Uint8Array(await blob.arrayBuffer()))) === hash,
    ),
  ]);
  if (verified.includes(false)) throw new Error('Draft asset checksum mismatch');
  const decoder = new TextDecoder();
  const urls = new Map<string, string>();
  for (const [hash, bytes] of stored) urls.set(hash, decoder.decode(bytes));
  // One shared, immutable tile object per key (and per tab, via the index).
  const tiles = new Map<string, AssetTile>();
  for (const [key, hash] of Object.entries(manifest.tileRefs || {})) {
    const tile = internTile({ key, blob: tileBlobs.get(hash)! });
    if (!tileHashes.has(tile)) tileHashes.set(tile, hash);
    tiles.set(key, tile);
  }
  const {
    kind: _kind,
    format: _format,
    assetRefs,
    tileRefs: _tileRefs,
    audioRefs,
    savedAt: _savedAt,
    ...draft
  } = manifest;
  const assets: Record<string, { url: string; w: number; h: number } | TiledAsset> = {};
  for (const [id, ref] of Object.entries(assetRefs))
    assets[id] = isTiledRef(ref)
      ? {
          w: ref.w,
          h: ref.h,
          tileSize: TILE_SIZE,
          tiles: ref.tiles.map((key) => (key === null ? null : tiles.get(key)!)),
        }
      : { url: urls.get(ref.hash)!, w: ref.w, h: ref.h };
  if (!audioRefs) return { ...draft, assets };
  const audio: Record<string, AudioClip> = {};
  for (const [id, ref] of Object.entries(audioRefs))
    audio[id] = { url: urls.get(ref.hash)!, mime: ref.mime, bytes: ref.bytes, durationMs: ref.durationMs };
  return { ...draft, assets, audio };
}
