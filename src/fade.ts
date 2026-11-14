import {
  effectiveFilterEffects,
  isNeutralFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';

/**
 * Blend the result of the most recent raster edit with the previous raster
 * state.  Photoshop's Fade is a post-operation opacity control; this bounded
 * local contract keeps the previous state immutable and mixes all RGBA
 * channels deterministically.
 */
export function applyFadePixels(
  previous: Uint8ClampedArray,
  current: Uint8ClampedArray,
  amount: number,
): Uint8ClampedArray {
  if (previous.length !== current.length || previous.length % 4 !== 0)
    throw new Error('Fade buffers must contain matching complete RGBA pixels');
  if (!Number.isFinite(amount) || amount < 0 || amount > 100)
    throw new RangeError('Fade amount must be between 0 and 100');
  const strength = amount / 100;
  const output = new Uint8ClampedArray(current.length);
  for (let index = 0; index < output.length; index += 1)
    output[index] = Math.round(previous[index] * (1 - strength) + current[index] * strength);
  return output;
}

/**
 * Edit → Fade after a live (non-destructive) filter. Returns the live filter
 * to fade when the last step changed the layer's live filter (and not only
 * its fade) and left the raster asset alone; otherwise undefined. Fading sets
 * the filter's `fade` opacity: the filter result is mixed with the filter's
 * input, so 0 % shows the layer as it was before the filter.
 */
export function liveFilterFadeTarget(
  previous: { asset?: string; filterEffects?: Partial<FilterEffects> } | undefined,
  current: { asset?: string; filterEffects?: Partial<FilterEffects> } | undefined,
): FilterEffects | undefined {
  if (!previous || !current || previous.asset !== current.asset) return undefined;
  const live = effectiveFilterEffects(current.filterEffects);
  if (live.type === 'none' || isNeutralFilterEffects({ ...live, fade: undefined })) return undefined;
  const before: Partial<FilterEffects> = effectiveFilterEffects(previous.filterEffects);
  const after: Partial<FilterEffects> = { ...live };
  delete before.fade;
  delete after.fade;
  return JSON.stringify(before) === JSON.stringify(after) ? undefined : live;
}
