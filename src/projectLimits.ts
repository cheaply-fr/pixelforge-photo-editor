/**
 * Device-aware project limits.
 *
 * Two kinds of bound live here:
 *
 * - *Format ceilings* are device independent. Validation of drafts, imported
 *   `.pixelforge` projects and worker requests uses them, so a project saved
 *   on a large desktop still opens on a smaller device.
 * - *Device budgets* bound what an edit may grow a project to in this tab.
 *   They come from coarse, never-persisted browser hints
 *   (`navigator.deviceMemory` and a mobile user agent). An edit that does not
 *   increase stored pixels or bytes is always allowed, so opening a large
 *   project on a smaller device never strands the user.
 *
 * Layer pixel budgets count *stored* raster pixels: paint layers are stored
 * at their content bounds (see layer-pixel-budget-contract.md), so sparse
 * layers cost what they contain, not the canvas area.
 */
import { uniqueAssetBytes } from './tiledAssets.ts';

/** Most layers (of any kind) one frame may hold. */
export const MAX_DOCUMENT_LAYERS = 512;
/** Most layer groups (folders) one frame may hold. */
export const MAX_DOCUMENT_GROUPS = 128;
/** Most distinct assets a draft or portable project may reference. */
export const MAX_PROJECT_ASSETS = 4096;

const MiB = 1024 * 1024;

/** Format ceiling for stored layer pixels in one frame (device independent). */
export const LAYER_PIXEL_CEILING = 1_024_000_000;
/** Format ceiling for the PNG data a project references (device independent). */
export const PROJECT_ASSET_BYTES_CEILING = 1024 * MiB;

export type DeviceTier = 'desktop' | 'standard' | 'mobile' | 'low-memory';

export type ProjectLimits = {
  tier: DeviceTier;
  /** Stored raster pixels the top-level layers of the current frame may reach. */
  layerPixelBudget: number;
  /** Encoded PNG bytes (data-URL characters) the open document may reference. */
  assetByteBudget: number;
};

export type ProjectLimitHints = {
  /** `navigator.deviceMemory` in GiB (Chromium rounds and caps it at 8). */
  deviceMemory?: number;
  mobile?: boolean;
};

const TIERS: Record<DeviceTier, ProjectLimits> = {
  desktop: { tier: 'desktop', layerPixelBudget: 1_024_000_000, assetByteBudget: 1024 * MiB },
  standard: { tier: 'standard', layerPixelBudget: 384_000_000, assetByteBudget: 384 * MiB },
  mobile: { tier: 'mobile', layerPixelBudget: 256_000_000, assetByteBudget: 256 * MiB },
  'low-memory': { tier: 'low-memory', layerPixelBudget: 128_000_000, assetByteBudget: 128 * MiB },
};

/**
 * Pick the tier from coarse hints. Unknown memory on a non-mobile browser
 * (Firefox and Safari do not expose deviceMemory) is treated as a desktop.
 */
export function projectLimitsForDevice(hints: ProjectLimitHints = {}): ProjectLimits {
  const memory =
    typeof hints.deviceMemory === 'number' && Number.isFinite(hints.deviceMemory) && hints.deviceMemory > 0
      ? hints.deviceMemory
      : undefined;
  if (memory !== undefined && memory <= 2) return { ...TIERS['low-memory'] };
  if (hints.mobile === true) return { ...TIERS.mobile };
  if (memory !== undefined && memory <= 4) return { ...TIERS.standard };
  return { ...TIERS.desktop };
}

let detected: ProjectLimits | undefined;

/** The limits for this browser tab (computed once). */
export function detectProjectLimits(): ProjectLimits {
  if (detected) return detected;
  const browser = (globalThis as { navigator?: Navigator & { deviceMemory?: number } }).navigator;
  detected = browser
    ? projectLimitsForDevice({
        deviceMemory: browser.deviceMemory,
        mobile: /Android|iPhone|iPad|Mobile/i.test(browser.userAgent || ''),
      })
    : { ...TIERS.desktop };
  return detected;
}

/** Format a byte count as whole MiB for limit messages. */
export function formatMebibytes(bytes: number): string {
  return String(Math.ceil(Math.max(0, bytes) / MiB));
}

/** Message used when an edit would grow a document past the asset byte budget. */
export function assetByteBudgetMessage(budgetBytes: number): string {
  return (
    `This document's image data would exceed ${formatMebibytes(budgetBytes)} MB on this device. ` +
    'Trim or merge layers, or export a copy before adding more images.'
  );
}

/**
 * Encoded size of an asset map in data-URL bytes: each legacy data URL's
 * length, plus each distinct tile's base64 PNG length (tiles shared between
 * assets count once; see tiled-layer-assets-contract.md).
 */
export function assetBytes(assets: Record<string, unknown>): number {
  return uniqueAssetBytes(assets);
}
