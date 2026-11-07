/**
 * Row-band decomposition for the heavy neighbourhood filters.
 *
 * A band renders output rows [start, end) from a copy of image rows
 * [readStart, readEnd) = [start - halo, end + halo] clipped to the image.
 * Every eligible kernel reads at most `halo` rows above or below an output
 * pixel and clips (or clamps) only at the real image edges, so the
 * assembled bands are byte-identical to one full-frame render. Legacy Path
 * Blur and generated Light Rays depend on the full image height for their
 * geometry; they render with an explicit band frame instead of as a
 * stand-alone smaller image.
 *
 * This module is pure (no workers, no DOM); `filterWorkerPool.ts` runs the
 * same band requests in parallel workers.
 */

import {
  applyFilterEffectsPixels,
  effectiveFilterEffects,
  isNeutralFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';
import { fastLegacyPathBlur, legacyPathBlurReach } from './fastNeighborhoodFilters.ts';
import { lightRaysBandSafe, renderLightRays } from './lightRays.ts';

export type FilterBandRequest = {
  effect: FilterEffects;
  width: number;
  /** Full image height. */
  height: number;
  /** First image row held in `pixels`. */
  readStart: number;
  /** Rows held in `pixels`. */
  readRows: number;
  /** Output rows [start, end) in image coordinates. */
  start: number;
  end: number;
  pixels: Uint8ClampedArray;
};

const BILATERAL_TYPES = new Set(['smart-blur', 'smart-sharpen', 'surface-blur', 'reduce-noise']);

/** Rows of context a band needs above and below, or undefined if not band-safe. */
export function filterBandHalo(value: Partial<FilterEffects> | undefined): number | undefined {
  const effect = effectiveFilterEffects(value);
  if (effect.amount <= 0 || isNeutralFilterEffects(effect)) return undefined;
  const radius = Math.max(1, Math.round(effect.radius));
  if (BILATERAL_TYPES.has(effect.type)) return Math.min(8, radius);
  if (effect.type === 'shape-blur') return Math.min(12, radius);
  if (effect.type === 'lens-blur') return Math.min(64, radius);
  if (effect.type === 'path-blur' && !(effect.path && effect.path.length >= 2))
    return legacyPathBlurReach(effect.radius);
  // Generated Light Rays are pointwise; their geometry uses an explicit frame.
  if (effect.type === 'light-rays' && lightRaysBandSafe(effect.lightRays)) return 0;
  return undefined;
}

export type FilterBand = { start: number; end: number; readStart: number; readEnd: number };

/**
 * Split `height` rows into `count` contiguous bands (at least `minRows`
 * output rows each, so halo overhead stays small).
 */
export function planFilterBands(height: number, halo: number, count: number, minRows = 32): FilterBand[] {
  const bandCount = Math.max(1, Math.min(Math.floor(count), Math.ceil(height / Math.max(1, minRows))));
  const bands: FilterBand[] = [];
  for (let index = 0; index < bandCount; index += 1) {
    const start = Math.floor((height * index) / bandCount);
    const end = Math.floor((height * (index + 1)) / bandCount);
    if (end <= start) continue;
    bands.push({ start, end, readStart: Math.max(0, start - halo), readEnd: Math.min(height, end + halo) });
  }
  return bands;
}

/** Copy the input rows a band reads. */
export function sliceBandInput(pixels: Uint8ClampedArray, width: number, band: FilterBand): Uint8ClampedArray {
  return pixels.slice(band.readStart * width * 4, band.readEnd * width * 4);
}

/** Render one band; returns exactly the output rows [start, end). */
export function renderFilterBand(request: FilterBandRequest): Uint8ClampedArray {
  const { effect, width, height, readStart, readRows, start, end, pixels } = request;
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
    !Number.isSafeInteger(readStart) || !Number.isSafeInteger(readRows) || readRows < 1 ||
    readStart < 0 || readStart + readRows > height ||
    !(start >= readStart && end > start && end <= readStart + readRows) ||
    !(pixels instanceof Uint8ClampedArray) || pixels.length !== width * readRows * 4
  )
    throw new RangeError('Invalid filter band request');
  const normalized = effectiveFilterEffects(effect);
  const halo = filterBandHalo(normalized);
  if (halo === undefined) throw new RangeError('Effect is not band-safe');
  if ((start - readStart < halo && readStart > 0) || (readStart + readRows - end < halo && readStart + readRows < height))
    throw new RangeError('Filter band is missing halo rows');
  const first = (start - readStart) * width * 4, last = (end - readStart) * width * 4;
  if (normalized.type === 'path-blur') {
    const output = new Uint8ClampedArray(pixels);
    fastLegacyPathBlur(
      pixels, width, readRows, normalized.radius, normalized.angle, normalized.centerX, normalized.centerY,
      output, normalized.amount / 100, { rowOffset: readStart, fullHeight: height, start, end },
    );
    return output.slice(first, last);
  }
  if (normalized.type === 'light-rays') {
    const output = new Uint8ClampedArray(pixels);
    renderLightRays(pixels, output, width, readRows, {
      settings: normalized.lightRays,
      centerX: normalized.centerX,
      centerY: normalized.centerY,
      seed: normalized.seed,
      strength: normalized.amount / 100,
    }, { rowOffset: readStart, fullHeight: height, start, end });
    return output.slice(first, last);
  }
  // Halo rows are only read, never rendered.
  return applyFilterEffectsPixels(pixels, width, readRows, normalized, undefined, {
    start: start - readStart,
    end: end - readStart,
  }).slice(first, last);
}

/**
 * Serial reference for the band decomposition: render every band in turn and
 * assemble them. Used by tests and as a fallback when workers are absent.
 */
export function applyFilterEffectsInBands(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  value: Partial<FilterEffects>,
  bandCount: number,
): Uint8ClampedArray {
  const effect = effectiveFilterEffects(value);
  const halo = filterBandHalo(effect);
  if (halo === undefined) return applyFilterEffectsPixels(pixels, width, height, effect);
  const output = new Uint8ClampedArray(pixels.length);
  for (const band of planFilterBands(height, halo, bandCount, 1))
    output.set(
      renderFilterBand({
        effect, width, height,
        readStart: band.readStart, readRows: band.readEnd - band.readStart,
        start: band.start, end: band.end,
        pixels: sliceBandInput(pixels, width, band),
      }),
      band.start * width * 4,
    );
  return output;
}

/** Privacy-safe band completion report (no pixels, names or sizes). */
export type FilterBandProgress = {
  kind: 'filter-band-progress';
  effect: FilterEffects['type'];
  layerId?: string;
  completed: number;
  total: number;
};

const MAX_FILTER_BANDS = 4096;

export function validFilterBandProgress(value: unknown): value is FilterBandProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<FilterBandProgress>;
  const allowed = new Set(['kind', 'effect', 'layerId', 'completed', 'total']);
  return candidate.kind === 'filter-band-progress' &&
    Object.keys(candidate).every((key) => allowed.has(key)) &&
    typeof candidate.effect === 'string' &&
    filterBandHalo({ type: candidate.effect, amount: 100, radius: 1 }) !== undefined &&
    Number.isSafeInteger(candidate.completed) && Number.isSafeInteger(candidate.total) &&
    (candidate.total as number) >= 1 && (candidate.total as number) <= MAX_FILTER_BANDS &&
    (candidate.completed as number) >= 1 && (candidate.completed as number) <= (candidate.total as number) &&
    (candidate.layerId === undefined || (typeof candidate.layerId === 'string' &&
      candidate.layerId.length > 0 && candidate.layerId.length <= 128));
}
