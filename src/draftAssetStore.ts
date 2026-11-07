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
 * The module is pure (no IndexedDB access) so integrity and planning rules are
 * covered by Node tests; `src/drafts.ts` owns the transactions.
 */
import type { Draft } from './drafts.ts';

export const DRAFT_MANIFEST_KIND = 'pixelforge-draft-manifest' as const;
export const DRAFT_MANIFEST_FORMAT = 3 as const;
export const DRAFT_ASSET_KIND = 'pixelforge-draft-asset' as const;

export type DraftAssetRef = { hash: string; w: number; h: number };

export type DraftManifest = Omit<Draft, 'assets' | 'localRevision'> & {
  kind: typeof DRAFT_MANIFEST_KIND;
  format: typeof DRAFT_MANIFEST_FORMAT;
  /** Optimistic-concurrency revision; also read by older builds' conflict checks. */
  localRevision: number;
  /** Asset ID → content hash and dimensions. */
  assetRefs: Record<string, DraftAssetRef>;
  savedAt: string;
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
const MAX_ASSET_REFS = 768;

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

export function isDraftManifest(value: unknown): value is DraftManifest {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DraftManifest>;
  if (
    candidate.kind !== DRAFT_MANIFEST_KIND ||
    candidate.format !== DRAFT_MANIFEST_FORMAT ||
    !validRevision(candidate.localRevision) ||
    !Array.isArray(candidate.history) ||
    !isRecord(candidate.assetRefs) ||
    typeof candidate.savedAt !== 'string' ||
    candidate.savedAt.length > 64
  )
    return false;
  const refs = Object.entries(candidate.assetRefs);
  return (
    refs.length <= MAX_ASSET_REFS &&
    refs.every(
      ([id, ref]) =>
        ID_PATTERN.test(id) &&
        isRecord(ref) &&
        typeof ref.hash === 'string' &&
        SHA256_PATTERN.test(ref.hash) &&
        dimension(ref.w) &&
        dimension(ref.h),
    )
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

/** Distinct content hashes a manifest needs, in a stable order. */
export function manifestAssetHashes(manifest: DraftManifest): string[] {
  return [...new Set(Object.values(manifest.assetRefs).map((ref) => ref.hash))];
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
): DraftManifest {
  if (!validRevision(revision)) throw new Error('Invalid draft revision');
  const { assets, localRevision: _previous, ...rest } = draft;
  const assetRefs: Record<string, DraftAssetRef> = {};
  for (const [id, asset] of Object.entries(assets)) {
    const hash = hashes.get(id);
    if (!hash || !SHA256_PATTERN.test(hash)) throw new Error('Draft asset is not hashed');
    assetRefs[id] = { hash, w: asset.w, h: asset.h };
  }
  return {
    ...rest,
    kind: DRAFT_MANIFEST_KIND,
    format: DRAFT_MANIFEST_FORMAT,
    localRevision: revision,
    assetRefs,
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
  needed: ReadonlyMap<string, string>,
  existingKeys: readonly unknown[],
): { puts: Array<[string, DraftAssetRecord]>; deletes: string[] } {
  const [lower, upper] = draftAssetKeyBounds(draftId);
  const existing = new Set(
    existingKeys.filter(
      (key): key is string =>
        typeof key === 'string' && key >= lower && key <= upper,
    ),
  );
  const wanted = new Set<string>();
  const puts: Array<[string, DraftAssetRecord]> = [];
  for (const [hash, url] of needed) {
    const key = draftAssetKey(draftId, hash);
    wanted.add(key);
    if (!existing.has(key))
      puts.push([
        key,
        { kind: DRAFT_ASSET_KIND, hash, bytes: new TextEncoder().encode(url).buffer },
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
  const stored = new Map<string, ArrayBuffer>();
  for (const hash of manifestAssetHashes(manifest)) {
    const value = records.get(hash);
    if (value === undefined) throw new Error('Draft asset is missing');
    if (!isDraftAssetRecord(value) || value.hash !== hash)
      throw new Error('Draft asset record is invalid');
    stored.set(hash, value.bytes);
  }
  // Digests run concurrently (WebCrypto hashes off the main thread).
  const verified = await Promise.all(
    [...stored].map(async ([hash, bytes]) => (await sha256(new Uint8Array(bytes))) === hash),
  );
  if (verified.includes(false)) throw new Error('Draft asset checksum mismatch');
  const decoder = new TextDecoder();
  const urls = new Map<string, string>();
  for (const [hash, bytes] of stored) urls.set(hash, decoder.decode(bytes));
  const {
    kind: _kind,
    format: _format,
    assetRefs,
    savedAt: _savedAt,
    ...draft
  } = manifest;
  const assets: Record<string, { url: string; w: number; h: number }> = {};
  for (const [id, ref] of Object.entries(assetRefs))
    assets[id] = { url: urls.get(ref.hash)!, w: ref.w, h: ref.h };
  return { ...draft, assets };
}
