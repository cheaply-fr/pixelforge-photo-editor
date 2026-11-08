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
import { isAssetShape, type AnyAsset } from './tiledAssets.ts';

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
type KeyAsset = AnyAsset;

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
        return isAssetShape(asset) ? `${id}=${assetFingerprint(asset)}` : `${id}=?`;
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
    // A clipped layer depends on every layer down to its clipping group's base.
    let base = layer.clippingTo ? byId.get(layer.clippingTo) : undefined;
    for (let depth = 0; base && depth < frame.layers.length; depth += 1) {
      key += `^${ownKey(base)}`;
      base = base.clippingTo ? byId.get(base.clippingTo) : undefined;
    }
    const path = layer.textPath?.pathLayerId ? byId.get(layer.textPath.pathLayerId) : undefined;
    if (path) key += `~${ownKey(path)}`;
    return key;
  });
}

/**
 * Where to snapshot: just below the first live override, else just below the
 * active layer. A folder is drawn once at its first member, so when the
 * target is inside a folder the snapshot goes below the folder's first
 * member; otherwise the folder's key (which includes the edited member)
 * changed on every edit and the snapshot never matched. -1 means no
 * checkpoint is worth keeping.
 */
export function compositeCheckpoint(
  frame: { layers: readonly { id: string; groupId?: string }[]; active?: string },
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
  const groupId = target >= 0 ? frame.layers[target].groupId : undefined;
  if (groupId) {
    const first = frame.layers.findIndex((layer) => layer.groupId === groupId);
    if (first >= 0 && first < target) target = first;
  }
  return target - 1;
}

/** Layer fields that never change pixels (labels and lock/UI state). */
const PIXEL_NEUTRAL_LAYER_FIELDS = new Set(['name', 'locked', 'clippingTo']);
const PIXEL_NEUTRAL_GROUP_FIELDS = new Set(['name', 'locked', 'collapsed']);

const withoutFields = (value: object, fields: ReadonlySet<string>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !fields.has(key)));

/**
 * One key for the *finished* composite of a frame, insensitive to edits that
 * cannot change its pixels: inserting or deleting an inert layer (hidden,
 * 0% opacity or a known-transparent plain raster such as a new paint layer),
 * renaming or locking a layer or folder, and changing which layer is active
 * or selected. Two frames with equal keys composite to identical pixels.
 *
 * Layers composite bottom-to-top and an inert layer leaves the composite
 * below it unchanged, so the composite is a function of the ordered keys of
 * the non-inert layers. A clipped layer is drawn through its clipping
 * group's base (`resolveClipBase`, which validates adjacency), so it is keyed
 * by that base rather than by its raw `clippingTo` link: inserting an empty
 * layer inside a clipping group re-points links without changing pixels.
 * A folder is drawn once at its first member and keyed by its non-inert
 * members. `inert` must be true only for layers the renderer draws as
 * nothing and that no other layer reads, except through keys included here.
 */
export function compositeEquivalenceKey(
  frame: KeyFrame & { colorMode?: unknown },
  assets: Readonly<Record<string, KeyAsset | undefined>>,
  inert: (layer: KeyLayer) => boolean,
  resolveClipBase: (layer: KeyLayer) => KeyLayer | undefined,
): string {
  const byId = new Map(frame.layers.map((layer) => [layer.id, layer]));
  const own = new Map<string, string>();
  const ownKey = (layer: KeyLayer): string => {
    const cached = own.get(layer.id);
    if (cached !== undefined) return cached;
    const ids = new Set<string>();
    layerAssetIds(layer, ids);
    const prints = [...ids]
      .sort()
      .map((id) => {
        const asset = assets[id];
        return isAssetShape(asset) ? `${id}=${assetFingerprint(asset)}` : `${id}=?`;
      })
      .join(',');
    const key = `${JSON.stringify(withoutFields(layer, PIXEL_NEUTRAL_LAYER_FIELDS))}#${prints}`;
    own.set(layer.id, key);
    return key;
  };
  const layerKey = (layer: KeyLayer): string => {
    let key = ownKey(layer);
    if (layer.clippingTo !== undefined) {
      const base = resolveClipBase(layer);
      if (base) key += `^${ownKey(base)}`;
    }
    const path = layer.textPath?.pathLayerId ? byId.get(layer.textPath.pathLayerId) : undefined;
    if (path) key += `~${ownKey(path)}`;
    return key;
  };
  const groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  const emitted = new Set<string>();
  const parts: string[] = [];
  for (const layer of frame.layers) {
    if (layer.groupId) {
      if (emitted.has(layer.groupId)) continue;
      emitted.add(layer.groupId);
      const group = groups.get(layer.groupId);
      const members = frame.layers.filter((item) => item.groupId === layer.groupId && !inert(item));
      parts.push(
        `group:${JSON.stringify(group ? withoutFields(group, PIXEL_NEUTRAL_GROUP_FIELDS) : null)}[${members.map(layerKey).join('|')}]`,
      );
      continue;
    }
    if (inert(layer)) continue;
    parts.push(layerKey(layer));
  }
  return `${frame.w}x${frame.h}:${JSON.stringify(frame.colorMode ?? null)}\n${parts.join('\n')}`;
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
  private final: { key: string; w: number; h: number; surface: S } | undefined;
  hits = 0;
  misses = 0;
  finalHits = 0;

  /**
   * The finished composite of the last full render whose equivalence key
   * (see `compositeEquivalenceKey`) equals `key`, if any.
   */
  matchFinal(w: number, h: number, key: string): S | undefined {
    const final = this.final;
    if (!final || final.w !== w || final.h !== h || final.key !== key) return undefined;
    this.finalHits += 1;
    return final.surface;
  }

  /** The retained finished-composite surface (reused for the next one), if any. */
  reusableFinal(w: number, h: number): S | undefined {
    return this.final && this.final.w === w && this.final.h === h ? this.final.surface : undefined;
  }

  storeFinal(final: { key: string; w: number; h: number; surface: S }): void {
    this.final = final;
  }

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
    this.final = undefined;
  }

  get retained(): { index: number; w: number; h: number } | undefined {
    return this.entry ? { index: this.entry.index, w: this.entry.w, h: this.entry.h } : undefined;
  }
}

/** Per-render composite cache outcome, published as a diagnostics mark. */
export type CompositeReuse = { final: boolean };

export function validCompositeReuse(value: unknown): value is CompositeReuse {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).final === 'boolean'
  );
}

/**
 * Publish whether a render reused the finished composite as a best-effort
 * `pixelforge.composite-cache` performance mark (tests and profiling).
 */
export function markCompositeReuse(reuse: CompositeReuse): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.composite-cache', { detail: { final: reuse.final } });
  } catch {
    // Diagnostics must never affect rendering.
  }
}
