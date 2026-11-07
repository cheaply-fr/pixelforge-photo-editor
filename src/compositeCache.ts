/**
 * Bounded prefix composite cache for large layer stacks.
 *
 * Layers composite bottom-to-top, so the result after layer `k` depends only
 * on layers `0..k` (plus whole folders and clipping bases they reference).
 * Most edits touch the active layer, so the renderer snapshots the composite
 * just below it once and later renders start from that snapshot when every
 * layer below is unchanged. One frame-sized surface is retained per render
 * context; keys use layer JSON and asset *content* fingerprints, never IDs
 * alone, so a reused asset ID can not alias stale pixels.
 */
import { assetFingerprint } from './layerFilterCache.ts';

type KeyLayer = {
  id: string;
  groupId?: string;
  clippingTo?: string;
  textPath?: { pathLayerId?: string };
  [key: string]: unknown;
};
type KeyFrame = {
  w: number;
  h: number;
  layers: readonly KeyLayer[];
  groups?: readonly { id: string }[];
};
type KeyAsset = { url: string; w: number; h: number };

/** Below this many layers a full render is cheap and nothing is retained. */
export const COMPOSITE_CACHE_MIN_LAYERS = 8;

const ASSET_FIELDS = ['asset', 'mask'] as const;

/** Asset ids a layer reads directly or through nested metadata. */
function layerAssetIds(value: unknown, out: Set<string>, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 8) return;
  if (Array.isArray(value)) {
    for (const item of value) layerAssetIds(item, out, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && (ASSET_FIELDS.includes(key as never) || key === 'selectionMask'))
      out.add(item);
    else if (item && typeof item === 'object') layerAssetIds(item, out, depth + 1);
  }
}

/**
 * One key per layer: its own state, the content of every asset it reads, the
 * whole folder for grouped layers (a folder is drawn once at its first
 * member), its clipping base and a bound text path. A layer drawn from a live
 * override (an in-progress stroke) gets a key that never matches.
 */
export function compositeLayerKeys(
  frame: KeyFrame,
  assets: Readonly<Record<string, KeyAsset | undefined>>,
  overrides?: Readonly<Record<string, unknown>>,
): string[] {
  const own = new Map<string, string>();
  const byId = new Map(frame.layers.map((layer) => [layer.id, layer]));
  const ownKey = (layer: KeyLayer): string => {
    const cached = own.get(layer.id);
    if (cached !== undefined) return cached;
    if (overrides && Object.hasOwn(overrides, layer.id)) {
      const live = `live:${layer.id}:${Math.random()}`;
      own.set(layer.id, live);
      return live;
    }
    const ids = new Set<string>();
    layerAssetIds(layer, ids);
    const prints = [...ids]
      .sort()
      .map((id) => {
        const asset = assets[id];
        return asset && typeof asset.url === 'string' ? `${id}=${assetFingerprint(asset)}` : `${id}=?`;
      })
      .join(',');
    const key = `${JSON.stringify(layer)}#${prints}`;
    own.set(layer.id, key);
    return key;
  };
  const groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  const members = new Map<string, KeyLayer[]>();
  for (const layer of frame.layers)
    if (layer.groupId) members.set(layer.groupId, [...(members.get(layer.groupId) || []), layer]);
  return frame.layers.map((layer) => {
    let key = ownKey(layer);
    if (layer.groupId)
      key = `group:${JSON.stringify(groups.get(layer.groupId) ?? null)}[${(members.get(layer.groupId) || []).map(ownKey).join('|')}]`;
    const base = layer.clippingTo ? byId.get(layer.clippingTo) : undefined;
    if (base) key += `^${ownKey(base)}`;
    const path = layer.textPath?.pathLayerId ? byId.get(layer.textPath.pathLayerId) : undefined;
    if (path) key += `~${ownKey(path)}`;
    return key;
  });
}

/**
 * Where to snapshot: just below the first live override, else just below the
 * active layer. -1 means no checkpoint is worth keeping.
 */
export function compositeCheckpoint(
  frame: { layers: readonly { id: string }[]; active?: string },
  overrides?: Readonly<Record<string, unknown>>,
): number {
  let target = -1;
  if (overrides) {
    for (const [index, layer] of frame.layers.entries())
      if (Object.hasOwn(overrides, layer.id)) {
        target = index;
        break;
      }
  }
  if (target < 0) target = frame.layers.findIndex((layer) => layer.id === frame.active);
  return target - 1;
}

/** Number of leading keys two key lists share. */
export function sharedPrefix(a: readonly string[], b: readonly string[]): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

type Snapshot<S> = {
  w: number;
  h: number;
  /** Keys of layers 0..index that the snapshot contains. */
  keys: string[];
  index: number;
  surface: S;
  groups: string[];
};

export class CompositeCache<S = unknown> {
  private entry: Snapshot<S> | undefined;
  hits = 0;
  misses = 0;

  /** The snapshot usable for these keys, if every layer it contains is unchanged. */
  match(w: number, h: number, keys: readonly string[]): Snapshot<S> | undefined {
    const entry = this.entry;
    if (!entry || entry.w !== w || entry.h !== h || entry.index >= keys.length) {
      this.misses += 1;
      return undefined;
    }
    if (sharedPrefix(entry.keys, keys) < entry.index + 1) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return entry;
  }

  /** The retained surface (reused for the next snapshot), if any. */
  reusable(w: number, h: number): S | undefined {
    return this.entry && this.entry.w === w && this.entry.h === h ? this.entry.surface : undefined;
  }

  store(snapshot: Snapshot<S>): void {
    this.entry = snapshot;
  }

  clear(): void {
    this.entry = undefined;
  }

  get retained(): { index: number; w: number; h: number } | undefined {
    return this.entry ? { index: this.entry.index, w: this.entry.w, h: this.entry.h } : undefined;
  }
}
