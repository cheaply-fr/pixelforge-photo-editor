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

export const GROUP_BLEND_MODES = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
] as const;

export type GroupBlendMode = (typeof GROUP_BLEND_MODES)[number];

const MAX_PIXELS = 16_000_000;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const channel = (value: number) => Math.max(0, Math.min(1, value));

const blendChannel = (
  source: number,
  backdrop: number,
  mode: GroupBlendMode,
): number => {
  switch (mode) {
    case 'multiply':
      return source * backdrop;
    case 'screen':
      return source + backdrop - source * backdrop;
    case 'overlay':
      return backdrop <= 0.5
        ? 2 * source * backdrop
        : 1 - 2 * (1 - source) * (1 - backdrop);
    case 'darken':
      return Math.min(source, backdrop);
    case 'lighten':
      return Math.max(source, backdrop);
    case 'difference':
      return Math.abs(backdrop - source);
    case 'source-over':
      return source;
  }
};

function validMode(value: unknown): value is GroupBlendMode {
  return GROUP_BLEND_MODES.includes(value as GroupBlendMode);
}

/**
 * Composite an isolated group surface over a parent surface.
 *
 * The group surface is treated as the source and `opacity` scales its alpha
 * before blending.  This is intentionally equivalent to applying group
 * opacity after all child layers have overlapped, rather than multiplying
 * each child separately.  The implementation follows the source-over blend
 * equations used by Canvas 2D for the seven modes PixelForge exposes.
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
  if (!validMode(blend)) throw new RangeError('Group blend mode is invalid');

  const output = new Uint8ClampedArray(background);
  if (opacity === 0) return output;
  for (let offset = 0; offset < output.length; offset += 4) {
    const sourceAlpha = (group[offset + 3] / 255) * opacity;
    const backdropAlpha = background[offset + 3] / 255;
    const outputAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha);
    if (outputAlpha <= 0) {
      // Keep the parent's hidden RGB padding exactly as it arrived.
      output[offset + 3] = 0;
      continue;
    }
    for (let channelIndex = 0; channelIndex < 3; channelIndex += 1) {
      const sourceChannel = channel(group[offset + channelIndex] / 255);
      const backdropChannel = channel(background[offset + channelIndex] / 255);
      const blended = blendChannel(sourceChannel, backdropChannel, blend);
      // Premultiplied form of source-over with a separable blend function:
      // source coverage over transparent backdrop, blended source over the
      // covered backdrop, then the uncovered backdrop remainder.
      const premultiplied =
        sourceAlpha *
          ((1 - backdropAlpha) * sourceChannel + backdropAlpha * blended) +
        backdropAlpha * (1 - sourceAlpha) * backdropChannel;
      output[offset + channelIndex] = Math.round(
        (premultiplied / outputAlpha) * 255,
      );
    }
    output[offset + 3] = Math.round(outputAlpha * 255);
  }
  return output;
}

export const groupCompositingBounds = {
  maxPixels: MAX_PIXELS,
  modes: GROUP_BLEND_MODES,
};
