/**
 * Reuse of the selection masks Spot Healing and Patch strokes reference.
 *
 * A stroke made with an active selection stores the selection as a
 * layer-sized alpha asset. Rasterizing and PNG-encoding that mask is the
 * expensive part, so the editor keeps a small cache: a key built from the
 * selection's stored value and the layer placement finds a previously stored
 * asset without rasterizing again (undo/redo or Reselect produce an equal but
 * new selection object, and switching between two selections alternates), and
 * a digest of the rasterized coverage finds an identical mask made from a
 * different selection value (the same marquee drawn twice), so it is encoded
 * once. Only ids and digests are retained, never mask pixels.
 */

export const SELECTION_SNAPSHOT_CACHE_ENTRIES = 16;

/** Key for one selection value on one layer placement and size. */
export function selectionSnapshotKey(
  selection: unknown,
  layerId: string,
  matrix: readonly number[],
  width: number,
  height: number,
): string {
  return `${layerId}|${matrix.join(',')}|${width}x${height}|${stableJson(selection)}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

/**
 * Digest of mask coverage and size: two independent 32-bit FNV-1a lanes
 * (64 bits), so distinct masks sharing a digest is negligibly unlikely.
 */
export function maskDigest(mask: Uint8ClampedArray, width: number, height: number): string {
  if (mask.length !== width * height) throw new Error('Selection mask does not match its size');
  let a = 0x811c9dc5, b = (0x9e3779b9 ^ width ^ (height << 16)) >>> 0;
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index];
    a = Math.imul(a ^ value, 0x01000193);
    b = Math.imul(b ^ (value + 0x9e * (index & 7)), 0x01000193);
  }
  return `${width}x${height}:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

/** Small LRU from selection key, and from mask digest, to a stored asset id. */
export class SelectionSnapshotCache {
  private byKey = new Map<string, { asset: string; digest: string }>();
  private byDigest = new Map<string, string>();

  private readonly limit: number;

  constructor(limit = SELECTION_SNAPSHOT_CACHE_ENTRIES) {
    this.limit = limit;
  }

  /** Asset for this selection key, if it is still present. */
  lookup(key: string, hasAsset: (id: string) => boolean): string | undefined {
    const entry = this.byKey.get(key);
    if (!entry) return undefined;
    this.byKey.delete(key);
    if (!hasAsset(entry.asset)) return undefined;
    this.byKey.set(key, entry);
    return entry.asset;
  }

  /** Asset already holding a mask with this digest, if it is still present. */
  lookupDigest(digest: string, hasAsset: (id: string) => boolean): string | undefined {
    const asset = this.byDigest.get(digest);
    if (asset === undefined) return undefined;
    if (hasAsset(asset)) return asset;
    this.byDigest.delete(digest);
    return undefined;
  }

  remember(key: string, digest: string, asset: string): void {
    this.byKey.delete(key);
    this.byKey.set(key, { asset, digest });
    this.byDigest.set(digest, asset);
    while (this.byKey.size > this.limit) {
      const [oldestKey, oldest] = this.byKey.entries().next().value as [string, { asset: string; digest: string }];
      this.byKey.delete(oldestKey);
      if (![...this.byKey.values()].some((item) => item.digest === oldest.digest)) this.byDigest.delete(oldest.digest);
    }
  }

  get size(): number {
    return this.byKey.size;
  }
}
