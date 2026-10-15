/**
 * Bounds and metadata for PixelForge's local Generative Upscale approximation.
 *
 * The editor does not call a remote model here. The command uses the existing
 * source-safe canvas resampler while keeping the document editable. Keeping
 * the plan pure lets the UI reject oversized requests before any assets or
 * history are touched.
 */

import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  RESAMPLE_METHODS,
  type ResampleMethod,
} from './imageSize.ts';

export const GENERATIVE_UPSCALE_FACTORS = [2, 4] as const;
export type GenerativeUpscaleFactor = (typeof GENERATIVE_UPSCALE_FACTORS)[number];

export type GenerativeUpscaleRequest = {
  factor: GenerativeUpscaleFactor;
  method: ResampleMethod;
};

export type GenerativeUpscalePlan = {
  factor: GenerativeUpscaleFactor;
  method: ResampleMethod;
  width: number;
  height: number;
};

const validDimension = (value: number) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_IMAGE_DIMENSION;

/** Validate and resolve a bounded local upscale request. */
export function planGenerativeUpscale(
  width: number,
  height: number,
  request: GenerativeUpscaleRequest,
): GenerativeUpscalePlan {
  if (!validDimension(width) || !validDimension(height))
    throw new Error('Current image dimensions are invalid');
  if (!GENERATIVE_UPSCALE_FACTORS.includes(request.factor))
    throw new Error('Choose a 2x or 4x upscale factor');
  if (!RESAMPLE_METHODS.includes(request.method) || request.method === 'nearest')
    throw new Error('Choose a supported upscale method');
  const nextWidth = width * request.factor;
  const nextHeight = height * request.factor;
  if (
    !validDimension(nextWidth) ||
    !validDimension(nextHeight) ||
    nextWidth * nextHeight > MAX_IMAGE_PIXELS
  )
    throw new Error('Choose an upscale that stays within 16,000 pixels and 16 megapixels');
  return {
    factor: request.factor,
    method: request.method,
    width: nextWidth,
    height: nextHeight,
  };
}
