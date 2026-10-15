/** Device-aware, privacy-safe bounds for the in-memory tiled render cache. */
export const TILE_CACHE_MIN_BYTES = 2 * 1024 * 1024;
export const TILE_CACHE_DEFAULT_BYTES = 8 * 1024 * 1024;
export const TILE_CACHE_MAX_BYTES = 16 * 1024 * 1024;

export type TileCacheDeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  mobile?: boolean;
};

const finitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Pick a conservative cache budget from coarse browser hints. The hints are
 * never persisted or transmitted; unknown devices receive the safe default.
 */
export function tileCacheBudgetForDevice(hints: TileCacheDeviceHints = {}): number {
  const memory = finitePositive(hints.deviceMemory) ? hints.deviceMemory! : 8;
  const cores = finitePositive(hints.hardwareConcurrency) ? hints.hardwareConcurrency! : 4;
  let budget = memory <= 2 ? TILE_CACHE_MIN_BYTES : memory <= 4 ? 4 * 1024 * 1024 : TILE_CACHE_DEFAULT_BYTES;
  if (memory >= 8 && cores >= 8) budget = TILE_CACHE_MAX_BYTES;
  if (hints.mobile === true) budget = Math.min(budget, 4 * 1024 * 1024);
  return Math.max(TILE_CACHE_MIN_BYTES, Math.min(TILE_CACHE_MAX_BYTES, budget));
}

export function detectTileCacheBudget(): number {
  if (typeof navigator === 'undefined') return TILE_CACHE_DEFAULT_BYTES;
  const browser = navigator as Navigator & { deviceMemory?: number };
  return tileCacheBudgetForDevice({
    deviceMemory: browser.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
  });
}
