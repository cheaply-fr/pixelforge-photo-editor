/**
 * Bounded prefix composite cache for large layer stacks.
 *
 * Layers composite bottom-to-top, so the result after layer `k` depends only
 * on layers `0..k` (plus whole folders and clipping bases they reference).
 * The renderer snapshots the composite at a few checkpoints (below the active
 * layer, below the lowest layer the render changed, and anchors in between)
 * and later renders start from the highest snapshot whose layers
 * are all unchanged. A device-aware number of frame-sized surfaces is
 * retained per render context; keys use layer JSON and asset *content*
 * fingerprints, never IDs alone, so a reused asset ID can not alias stale
 * pixels.
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

const CLIPPED_SOURCE_NEUTRAL_FIELDS = new Set(['name', 'locked', 'clippingTo', 'groupId', 'opacity', 'blend']);
const CLIPPED_BASE_NEUTRAL_FIELDS = new Set(['name', 'locked', 'clippingTo', 'groupId']);

/**
 * Content key of a clipped layer's result: the source layer (without the
 * opacity and blend the outer compositor applies, its folder or name), its
 * clipping group's base, a bound text path, the content of every asset they
 * read, and the frame size and colour mode. Undefined (do not cache) when a
 * live override feeds either layer.
 */
export function clippedLayerCacheKey(
  frame: { w: number; h: number; colorMode?: unknown; layers: readonly KeyLayer[] },
  source: KeyLayer,
  base: KeyLayer,
  assets: Readonly<Record<string, KeyAsset | undefined>>,
  overrides?: Readonly<Record<string, unknown>>,
): string | undefined {
  if (overrides && (Object.hasOwn(overrides, source.id) || Object.hasOwn(overrides, base.id))) return undefined;
  const contentKey = (layer: KeyLayer, neutral: ReadonlySet<string>) => {
    const ids = new Set<string>();
    layerAssetIds(layer, ids);
    const prints = [...ids]
      .sort()
      .map((id) => {
        const asset = assets[id];
        return isAssetShape(asset) ? `${id}=${assetFingerprint(asset)}` : `${id}=?`;
      })
      .join(',');
    let key = `${JSON.stringify(withoutFields(layer, neutral))}#${prints}`;
    const pathId = layer.textPath?.pathLayerId;
    if (pathId) {
      const path = frame.layers.find((item) => item.id === pathId);
      key += `~${path ? JSON.stringify(path) : '?'}`;
    }
    return key;
  };
  return `clip:${frame.w}x${frame.h}:${JSON.stringify(frame.colorMode ?? null)}
${contentKey(source, CLIPPED_SOURCE_NEUTRAL_FIELDS)}
${contentKey(base, CLIPPED_BASE_NEUTRAL_FIELDS)}`;
}

/**
 * Bounds of the pixels with non-zero alpha in an RGBA buffer, or undefined
 * when every pixel is transparent.
 */
export function alphaBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | undefined {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    let first = -1;
    for (let x = 0; x < width; x += 1)
      if (pixels[row + x * 4 + 3] !== 0) {
        first = x;
        break;
      }
    if (first < 0) continue;
    let last = first;
    for (let x = width - 1; x > first; x -= 1)
      if (pixels[row + x * 4 + 3] !== 0) {
        last = x;
        break;
      }
    if (first < minX) minX = first;
    if (last > maxX) maxX = last;
    if (minY > y) minY = y;
    maxY = y;
  }
  return maxX < 0 ? undefined : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
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

type Entry<S> = Snapshot<S> & { used: number };

/**
 * Where to snapshot during one render, as ascending layer indexes (a
 * snapshot at `i` holds layers 0..i). A folder is drawn once at its first
 * member, so a target inside a folder moves below that member.
 *
 * - With live overrides (a stroke preview), only below the first override.
 * - Otherwise below the active layer (the next edit usually targets it) and
 *   below the lowest layer this render changed (`changedIndex`, from the
 *   previous render's keys): a delete, reorder or visibility toggle edits
 *   there, its undo changes the same place again, and a delete moves the
 *   active layer elsewhere.
 * - Spare `slots` become anchors, each bisecting the largest stretch of
 *   layers without a snapshot, so an edit anywhere (for example deleting a
 *   layer that was only selected, which never renders) resumes from the
 *   nearest snapshot below it instead of from layer 0.
 */
export function compositeCheckpointTargets(
  frame: { layers: readonly { id: string; groupId?: string }[]; active?: string },
  options: {
    overrides?: Readonly<Record<string, unknown>>;
    changedIndex?: number;
    slots?: number;
  } = {},
): number[] {
  const count = frame.layers.length;
  const below = (index: number): number => {
    const groupId = frame.layers[index]?.groupId;
    if (groupId) {
      const first = frame.layers.findIndex((layer) => layer.groupId === groupId);
      if (first >= 0 && first < index) index = first;
    }
    return index - 1;
  };
  const usable = (index: number) => index >= 0 && index <= count - 2;
  const targets = new Set<number>();
  const overrides = options.overrides;
  if (overrides && frame.layers.some((layer) => Object.hasOwn(overrides, layer.id)))
    targets.add(compositeCheckpoint(frame, overrides));
  else {
    targets.add(compositeCheckpoint(frame));
    const slots = Math.max(1, Math.min(8, Math.trunc(options.slots ?? 1)));
    const changed = options.changedIndex;
    // One slot keeps the historical single snapshot below the active layer.
    if (slots > 1 && changed !== undefined && Number.isSafeInteger(changed) && changed >= 0 && changed < count)
      targets.add(below(changed));
    // Each anchor bisects the largest stretch of layers without a snapshot
    // (the lowest one on ties), so anchors never coincide with a target.
    const points = [...targets].filter(usable).sort((a, b) => a - b);
    for (let anchor = points.length; anchor < slots; anchor += 1) {
      const bounds = [-1, ...points, count - 1];
      let widest = -1;
      for (let index = 0; index + 1 < bounds.length; index += 1)
        if (bounds[index + 1] - bounds[index] > 1 && (widest < 0 || bounds[index + 1] - bounds[index] > bounds[widest + 1] - bounds[widest]))
          widest = index;
      if (widest < 0) break;
      points.push(Math.floor((bounds[widest] + bounds[widest + 1]) / 2));
      points.sort((a, b) => a - b);
    }
    return points;
  }
  return [...targets].filter(usable).sort((a, b) => a - b);
}

/** Fewest layers above the edited one worth a cached "above" composite. */
export const COMPOSITE_SUFFIX_MIN_LAYERS = 2;
/**
 * Smallest canvas (pixels) that keeps an "above" composite. Flattening the
 * layers above first changes Canvas's 8-bit rounding order, so the screen can
 * differ from a sequential render by a level or two per channel. Below this
 * size a full recomposite is fast and renders stay bit-identical.
 */
export const COMPOSITE_SUFFIX_MIN_PIXELS = 4_000_000;

/**
 * Where the cached composite of the layers *above* the edited layer starts,
 * or -1 when none applies. While a low layer is painted, the layers above it
 * do not change, so they can be flattened once onto a transparent surface
 * and drawn over each new result instead of being re-rendered per stroke.
 *
 * That is only exact when every layer in the cached range composites onto
 * the result with plain source-over and never reads the pixels beneath it
 * (`independent`: no adjustment layer, no other blend mode, no layer style
 * pass with its own blend mode). Source-over is associative, so
 * `top over (middle over bottom)` equals `(top over middle) over bottom`.
 * A layer that does read the backdrop moves the start above it; layers
 * between the edited layer and the start are still rendered every time.
 *
 * The edited layer is the first live override, else the active layer. A
 * folder is one compositing unit, so an edited member puts the start above
 * its whole folder, a folder in the range must itself use source-over, and
 * the range never splits a folder. A clipped layer needs its base inside the
 * range too, because it is drawn through that base's alpha.
 */
export function compositeSuffixStart(
  frame: {
    layers: readonly { id: string; groupId?: string; clippingTo?: string }[];
    groups?: readonly { id: string; blend?: string }[];
    active?: string;
  },
  options: {
    overrides?: Readonly<Record<string, unknown>>;
    /** True when an ungrouped layer never reads the pixels beneath it. */
    independent: (index: number) => boolean;
    minLayers?: number;
  },
): number {
  const layers = frame.layers,
    count = layers.length;
  let target = -1;
  const overrides = options.overrides;
  if (overrides) target = layers.findIndex((layer) => Object.hasOwn(overrides, layer.id));
  if (target < 0) target = layers.findIndex((layer) => layer.id === frame.active);
  if (target < 0) return -1;
  const indexById = new Map(layers.map((layer, index) => [layer.id, index]));
  const groups = new Map((frame.groups || []).map((group) => [group.id, group]));
  const span = new Map<string, { first: number; last: number }>();
  for (const [index, layer] of layers.entries())
    if (layer.groupId) {
      const current = span.get(layer.groupId);
      if (current) current.last = index;
      else span.set(layer.groupId, { first: index, last: index });
    }
  let start = target + 1;
  const targetGroup = layers[target].groupId;
  if (targetGroup) start = Math.max(start, span.get(targetGroup)!.last + 1);
  // Raise the start past every blocking layer until nothing above it blocks.
  for (let guard = 0; guard <= count && start < count; guard += 1) {
    let next = start;
    for (let index = start; index < count; index += 1) {
      const layer = layers[index];
      if (layer.groupId) {
        const range = span.get(layer.groupId)!;
        const group = groups.get(layer.groupId);
        if (range.first < start || !group || (group.blend ?? 'source-over') !== 'source-over')
          next = Math.max(next, range.last + 1);
        continue;
      }
      const base = layer.clippingTo === undefined ? undefined : indexById.get(layer.clippingTo);
      if (!options.independent(index) || (layer.clippingTo !== undefined && (base === undefined || base < start)))
        next = Math.max(next, index + 1);
    }
    if (next === start) break;
    start = next;
  }
  return count - start >= (options.minLayers ?? COMPOSITE_SUFFIX_MIN_LAYERS) ? start : -1;
}

/** Byte budget and count cap for one render context's prefix snapshots. */
export type CompositeSnapshotBudget = { bytes: number; maxSnapshots: number };

/** Desktops: three 2646 x 4096 snapshots (43 MB each); four from 8 GB. */
export const COMPOSITE_SNAPSHOT_DESKTOP: CompositeSnapshotBudget = { bytes: 160 * 1024 * 1024, maxSnapshots: 4 };
export const COMPOSITE_SNAPSHOT_LARGE_DESKTOP: CompositeSnapshotBudget = { bytes: 256 * 1024 * 1024, maxSnapshots: 4 };
/** Phones, tablets and 4 GB devices keep at most two. */
export const COMPOSITE_SNAPSHOT_MOBILE: CompositeSnapshotBudget = { bytes: 96 * 1024 * 1024, maxSnapshots: 2 };
/** Devices reporting 2 GB or less keep the single historical snapshot. */
export const COMPOSITE_SNAPSHOT_LOW_MEMORY: CompositeSnapshotBudget = { bytes: 0, maxSnapshots: 1 };

/** Device-aware snapshot budget (the same coarse hints as the layer cache). */
export function compositeSnapshotBudgetForDevice(
  hints: { deviceMemory?: number; mobile?: boolean } = {},
): CompositeSnapshotBudget {
  const memory =
    typeof hints.deviceMemory === 'number' && Number.isFinite(hints.deviceMemory) && hints.deviceMemory > 0
      ? hints.deviceMemory
      : undefined;
  if (memory !== undefined && memory <= 2) return COMPOSITE_SNAPSHOT_LOW_MEMORY;
  if (hints.mobile === true || (memory !== undefined && memory <= 4)) return COMPOSITE_SNAPSHOT_MOBILE;
  if (memory !== undefined && memory >= 8) return COMPOSITE_SNAPSHOT_LARGE_DESKTOP;
  return COMPOSITE_SNAPSHOT_DESKTOP;
}

export function detectCompositeSnapshotBudget(): CompositeSnapshotBudget {
  const browser = (globalThis as { navigator?: Navigator & { deviceMemory?: number } }).navigator;
  if (!browser) return COMPOSITE_SNAPSHOT_DESKTOP;
  return compositeSnapshotBudgetForDevice({
    deviceMemory: browser.deviceMemory,
    mobile: /Android|iPhone|iPad|Mobile/i.test(browser.userAgent || ''),
  });
}

/**
 * Canvas-sized snapshots that fit the budget at this frame size: at least
 * one (the historical behaviour), at most `maxSnapshots`.
 */
export function compositeSnapshotCapacity(w: number, h: number, budget: CompositeSnapshotBudget): number {
  const bytes = Math.max(1, Math.trunc(w)) * Math.max(1, Math.trunc(h)) * 4;
  return Math.max(1, Math.min(budget.maxSnapshots, Math.floor(budget.bytes / bytes)));
}

const SINGLE_SNAPSHOT: CompositeSnapshotBudget = { bytes: 0, maxSnapshots: 1 };

export class CompositeCache<S = unknown> {
  private entries: Entry<S>[] = [];
  private final: { key: string; w: number; h: number; surface: S } | undefined;
  private previous: { w: number; h: number; keys: readonly string[] } | undefined;
  private suffix: { w: number; h: number; start: number; keys: string[]; surface: S } | undefined;
  private tick = 0;
  readonly budget: CompositeSnapshotBudget;
  hits = 0;
  misses = 0;
  finalHits = 0;
  /** Layers the latest outermost render took from a snapshot (0: none). */
  lastReusedLayers = 0;
  suffixHits = 0;
  suffixMisses = 0;
  /** Layers the latest outermost render took from the "above" composite (0: none). */
  lastSuffixLayers = 0;

  /** Without a budget one snapshot is kept, as before multiple checkpoints. */
  constructor(budget: CompositeSnapshotBudget = SINGLE_SNAPSHOT) {
    this.budget = budget;
  }

  /**
   * Prefix snapshots kept at this frame size. A retained "above" composite
   * takes one of the budget's surfaces.
   */
  capacity(w: number, h: number): number {
    const total = compositeSnapshotCapacity(w, h, this.budget);
    return this.suffix && this.suffix.w === w && this.suffix.h === h ? Math.max(1, total - 1) : total;
  }

  /**
   * Whether an "above" composite is kept at this frame size: a canvas of at
   * least COMPOSITE_SUFFIX_MIN_PIXELS and a budget holding at least two
   * frame-sized surfaces, so one prefix snapshot remains.
   */
  suffixAllowed(w: number, h: number): boolean {
    const pixels = Math.max(1, Math.trunc(w)) * Math.max(1, Math.trunc(h));
    return (
      pixels >= COMPOSITE_SUFFIX_MIN_PIXELS &&
      this.budget.bytes >= 2 * pixels * 4 &&
      compositeSnapshotCapacity(w, h, this.budget) >= 2
    );
  }

  /**
   * The cached composite of layers `start..` when it holds exactly these
   * layer keys (`keys` is the whole frame's key list).
   */
  matchSuffix(w: number, h: number, start: number, keys: readonly string[]): S | undefined {
    const suffix = this.suffix;
    if (
      !suffix ||
      suffix.w !== w ||
      suffix.h !== h ||
      suffix.start !== start ||
      suffix.keys.length !== keys.length - start ||
      suffix.keys.some((key, index) => key !== keys[start + index])
    ) {
      if (suffix) this.suffixMisses += 1;
      return undefined;
    }
    this.suffixHits += 1;
    return suffix.surface;
  }

  /**
   * Remove the retained "above" composite and return its surface for the
   * next one to be drawn into (undefined at another size or when none is
   * kept). The entry is dropped first, so a render cancelled half-way can
   * never leave a partly drawn surface behind a valid key.
   */
  takeSuffixSurface(w: number, h: number): S | undefined {
    const suffix = this.suffix;
    this.suffix = undefined;
    return suffix && suffix.w === w && suffix.h === h ? suffix.surface : undefined;
  }

  storeSuffix(suffix: { w: number; h: number; start: number; keys: readonly string[]; surface: S }): void {
    this.suffix = { ...suffix, keys: [...suffix.keys] };
    // The suffix took one surface of the budget: drop the extra prefix snapshot.
    while (this.entries.length > this.capacity(suffix.w, suffix.h)) {
      const victim = this.victim(suffix.w, suffix.h);
      if (!victim) break;
      this.entries.splice(this.entries.indexOf(victim), 1);
    }
  }

  /** The retained "above" composite (diagnostics and tests). */
  get retainedSuffix(): { start: number; layers: number; w: number; h: number } | undefined {
    const suffix = this.suffix;
    return suffix ? { start: suffix.start, layers: suffix.keys.length, w: suffix.w, h: suffix.h } : undefined;
  }

  /**
   * Record the per-layer keys of a render about to run and return the index
   * of the lowest layer that differs from the previous render's keys
   * (`keys.length` when none differs; 0 after a size change or at first).
   */
  noteKeys(w: number, h: number, keys: readonly string[]): number {
    const previous = this.previous;
    this.previous = { w, h, keys };
    if (!previous || previous.w !== w || previous.h !== h) return 0;
    return sharedPrefix(previous.keys, keys);
  }

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

  private valid(entry: Entry<S>, w: number, h: number, keys: readonly string[]): boolean {
    return (
      entry.w === w &&
      entry.h === h &&
      entry.index < keys.length &&
      sharedPrefix(entry.keys, keys) >= entry.index + 1
    );
  }

  /**
   * The highest snapshot usable for these keys (every layer it contains is
   * unchanged). Several may match; the highest skips the most layers.
   */
  match(w: number, h: number, keys: readonly string[]): Snapshot<S> | undefined {
    let best: Entry<S> | undefined;
    for (const entry of this.entries)
      if ((!best || entry.index > best.index) && this.valid(entry, w, h, keys)) best = entry;
    if (!best) {
      this.misses += 1;
      return undefined;
    }
    best.used = ++this.tick;
    this.hits += 1;
    return best;
  }

  /**
   * The entry the next store (of a snapshot at `index`) replaces when the
   * cache is full: one of another frame size first, then one that no longer
   * matches `keys` (least recently used first). Among usable snapshots, the
   * one nearest another snapshot goes, so the rest stay spread over the stack
   * (a low snapshot serves edits anywhere above it); ties go to the least
   * recently used.
   */
  private victim(w: number, h: number, keys?: readonly string[], index?: number): Entry<S> | undefined {
    if (this.entries.length < this.capacity(w, h)) return undefined;
    const rank = (entry: Entry<S>) =>
      entry.w !== w || entry.h !== h ? 0 : keys && !this.valid(entry, w, h, keys) ? 1 : 2;
    const usable = this.entries.filter((entry) => rank(entry) === 2);
    const points = [...usable.map((entry) => entry.index), ...(index === undefined ? [] : [index])];
    const crowding = (entry: Entry<S>) => {
      if (rank(entry) !== 2) return 0;
      let nearest = Number.POSITIVE_INFINITY;
      let self = false;
      for (const point of points) {
        if (point === entry.index && !self) {
          self = true;
          continue;
        }
        nearest = Math.min(nearest, Math.abs(point - entry.index));
      }
      return nearest;
    };
    let victim: Entry<S> | undefined;
    for (const entry of this.entries) {
      if (!victim) {
        victim = entry;
        continue;
      }
      const order =
        rank(entry) - rank(victim) || crowding(entry) - crowding(victim) || entry.used - victim.used;
      if (order < 0) victim = entry;
    }
    return victim;
  }

  /**
   * A retained surface to draw the next snapshot (at `index`) into: that of
   * the entry the next `store` replaces, or undefined when a new surface is
   * needed.
   */
  reusable(w: number, h: number, keys?: readonly string[], index?: number): S | undefined {
    const same =
      index === undefined
        ? undefined
        : this.entries.find((entry) => entry.w === w && entry.h === h && entry.index === index);
    const victim = same ?? this.victim(w, h, keys, index);
    return victim && victim.w === w && victim.h === h ? victim.surface : undefined;
  }

  /**
   * Keep a snapshot. It replaces the entry whose surface it reuses, else an
   * entry at the same index, else the `reusable` victim when full.
   */
  store(snapshot: Snapshot<S>, keys?: readonly string[]): void {
    let index = this.entries.findIndex((entry) => entry.surface === snapshot.surface);
    if (index < 0)
      index = this.entries.findIndex(
        (entry) => entry.w === snapshot.w && entry.h === snapshot.h && entry.index === snapshot.index,
      );
    if (index < 0) {
      const victim = this.victim(snapshot.w, snapshot.h, keys, snapshot.index);
      index = victim ? this.entries.indexOf(victim) : -1;
    }
    const entry: Entry<S> = { ...snapshot, used: ++this.tick };
    if (index >= 0) this.entries[index] = entry;
    else this.entries.push(entry);
    // Entries left from another frame size, or a smaller budget at this one.
    while (this.entries.length > this.capacity(snapshot.w, snapshot.h)) {
      const victim = this.victim(snapshot.w, snapshot.h, keys, snapshot.index);
      if (!victim || victim === entry) break;
      this.entries.splice(this.entries.indexOf(victim), 1);
    }
  }

  clear(): void {
    this.entries = [];
    this.final = undefined;
    this.previous = undefined;
    this.suffix = undefined;
  }

  /** The highest retained snapshot (diagnostics and tests). */
  get retained(): { index: number; w: number; h: number } | undefined {
    let top: Entry<S> | undefined;
    for (const entry of this.entries) if (!top || entry.index > top.index) top = entry;
    return top ? { index: top.index, w: top.w, h: top.h } : undefined;
  }

  /** Indexes of every retained snapshot, ascending (diagnostics and tests). */
  get snapshotIndexes(): number[] {
    return this.entries.map((entry) => entry.index).sort((a, b) => a - b);
  }
}

/**
 * Per-render composite cache outcome, published as a diagnostics mark:
 * whether the finished composite was reused, how many clipped or masked
 * frame-space results came from their cache, and how many layers (from the
 * bottom) came from a prefix snapshot.
 */
export type CompositeReuse = {
  final: boolean;
  clippedHits?: number;
  reusedLayers?: number;
  /** Layers drawn from the cached composite above the edited layer. */
  suffixLayers?: number;
};

const optionalCount = (value: unknown) =>
  value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0);

export function validCompositeReuse(value: unknown): value is CompositeReuse {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).final === 'boolean' &&
    optionalCount((value as Record<string, unknown>).clippedHits) &&
    optionalCount((value as Record<string, unknown>).reusedLayers) &&
    optionalCount((value as Record<string, unknown>).suffixLayers)
  );
}

/**
 * Publish whether a render reused the finished composite as a best-effort
 * `pixelforge.composite-cache` performance mark (tests and profiling).
 */
export function markCompositeReuse(reuse: CompositeReuse): void {
  try {
    if (typeof performance !== 'undefined' && typeof performance.mark === 'function')
      performance.mark('pixelforge.composite-cache', {
        detail: {
          final: reuse.final,
          clippedHits: reuse.clippedHits ?? 0,
          reusedLayers: reuse.reusedLayers ?? 0,
          suffixLayers: reuse.suffixLayers ?? 0,
        },
      });
  } catch {
    // Diagnostics must never affect rendering.
  }
}
