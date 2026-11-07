/**
 * Deterministic reference compositing for an isolated layer group.
 *
 * Canvas 2D remains the production renderer for browser surfaces, but this
 * byte-level helper defines the same group contract for unit fixtures and
 * non-browser consumers: child layers are first flattened into one RGBA
 * surface, then the group's opacity and blend mode are applied once to the
 * parent surface.  The inputs are never mutated and transparent hidden RGB
 * is retained whenever no visible source coverage exists.
 */

import {
  LAYER_BLEND_MODES,
  blendPixelsInPlace,
  validBlendMode,
  type LayerBlendMode,
} from './blendModes.ts';

export const GROUP_BLEND_MODES = LAYER_BLEND_MODES;

export type GroupBlendMode = LayerBlendMode;

const MAX_PIXELS = 16_000_000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Composite an isolated group surface over a parent surface.
 *
 * The group surface is treated as the source and `opacity` scales its alpha
 * before blending.  This is intentionally equivalent to applying group
 * opacity after all child layers have overlapped, rather than multiplying
 * each child separately.  The implementation follows the W3C source-over
 * blend equations used by Canvas 2D, extended to PixelForge's software modes.
 */
export function compositeGroupPixels(
  background: Uint8ClampedArray,
  group: Uint8ClampedArray,
  width: number,
  height: number,
  opacity: number,
  blend: GroupBlendMode,
): Uint8ClampedArray {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_PIXELS
  )
    throw new RangeError('Group compositing dimensions are invalid');
  if (background.length !== width * height * 4 || group.length !== width * height * 4)
    throw new RangeError('Group compositing buffers have the wrong size');
  if (!finite(opacity) || opacity < 0 || opacity > 1)
    throw new RangeError('Group opacity must be between 0 and 1');
  if (!validBlendMode(blend)) throw new RangeError('Group blend mode is invalid');

  const output = new Uint8ClampedArray(background);
  blendPixelsInPlace(output, group, opacity, blend);
  return output;
}

export const groupCompositingBounds = {
  maxPixels: MAX_PIXELS,
  modes: GROUP_BLEND_MODES,
};
