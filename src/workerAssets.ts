/**
 * Render-worker asset reuse.
 *
 * The persistent render worker keeps the encoded assets of the request it
 * last rendered, keyed by content fingerprint (see layerFilterCache.ts). The
 * main thread mirrors that set and sends only assets the worker does not
 * hold, so editing one layer of a large document no longer structured-clones
 * every other layer's PNG data on each render. If the mirror is ever wrong,
 * the worker reports the missing assets and the request is resent in full.
 */
type AnyAsset = { url: string; w: number; h: number };
type AssetMap<A extends AnyAsset> = Record<string, A>;

/** Assets of a request the worker does not already hold, by fingerprint. */
export function assetsToSend<A extends AnyAsset>(
  used: AssetMap<A>,
  keys: Record<string, string>,
  held: ReadonlySet<string>,
): AssetMap<A> {
  const send: AssetMap<A> = {};
  for (const [id, asset] of Object.entries(used))
    if (!held.has(keys[id])) send[id] = asset;
  return send;
}

/** Rebuild a request's asset map from the sent assets and the worker's store. */
export function resolveRequestAssets<A extends AnyAsset>(
  sent: AssetMap<A> | undefined,
  keys: Record<string, string> | undefined,
  store: ReadonlyMap<string, A>,
): { assets: AssetMap<A>; missing: string[] } {
  const assets: AssetMap<A> = { ...sent };
  const missing: string[] = [];
  if (!keys || typeof keys !== 'object') return { assets, missing };
  for (const [id, key] of Object.entries(keys)) {
    if (Object.hasOwn(assets, id)) continue;
    const stored = typeof key === 'string' ? store.get(key) : undefined;
    if (stored) assets[id] = stored;
    else missing.push(id);
  }
  return { assets, missing };
}

/** The store a worker keeps after a request: exactly that request's assets. */
export function retainedAssetStore<A extends AnyAsset>(
  assets: AssetMap<A>,
  keys: Record<string, string> | undefined,
): Map<string, A> {
  const store = new Map<string, A>();
  for (const [id, key] of Object.entries(keys || {}))
    if (typeof key === 'string' && assets[id]) store.set(key, assets[id]);
  return store;
}
