/**
 * Bounded local contract for Photoshop-style Type Mask selections. The text
 * remains an editable text layer; this module only validates the temporary
 * canvas request and packs rendered alpha into the existing Selection.mask
 * asset format.
 */

export type TextMaskOrientation = 'horizontal' | 'vertical';

export const TEXT_MASK_MAX_TEXT = 10000;
export const TEXT_MASK_MAX_PIXELS = 16000000;

export type TextMaskRequest = {
  width: number;
  height: number;
  text: string;
  orientation: TextMaskOrientation;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const validDimensions = (width: number, height: number) =>
  Number.isInteger(width) &&
  Number.isInteger(height) &&
  width >= 1 &&
  width <= 16000 &&
  height >= 1 &&
  height <= 16000 &&
  width * height <= TEXT_MASK_MAX_PIXELS;

/** Validate and detach the bounded request before any canvas allocation. */
export function normalizeTextMaskRequest(value: unknown): TextMaskRequest {
  if (!isRecord(value)) throw new Error('Text mask request is invalid');
  const { width, height, text, orientation } = value;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !validDimensions(width, height)
  )
    throw new Error('Text mask dimensions are outside the safe limit');
  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > TEXT_MASK_MAX_TEXT
  )
    throw new Error('Text mask content is empty or too large');
  if (orientation !== 'horizontal' && orientation !== 'vertical')
    throw new Error('Text mask orientation is invalid');
  return { width, height, text, orientation };
}

/** Extract alpha bytes from an RGBA buffer without mutating that buffer. */
export function alphaFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (
    !(rgba instanceof Uint8ClampedArray) ||
    !validDimensions(width, height) ||
    rgba.length !== width * height * 4
  )
    throw new Error('Text mask RGBA pixels are invalid');
  const alpha = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < alpha.length; pixel += 1)
    alpha[pixel] = rgba[pixel * 4 + 3];
  return alpha;
}

/** Pack alpha as a white RGB canvas suitable for Selection.mask assets. */
export function packAlphaMask(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (
    !(alpha instanceof Uint8ClampedArray) ||
    !validDimensions(width, height) ||
    alpha.length !== width * height
  )
    throw new Error('Text mask alpha pixels are invalid');
  const rgba = new Uint8ClampedArray(alpha.length * 4);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const offset = pixel * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = alpha[pixel];
  }
  return rgba;
}

/** Return the nonzero alpha bounds for portable representative assertions. */
export function alphaBounds(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  if (
    !(alpha instanceof Uint8ClampedArray) ||
    !validDimensions(width, height) ||
    alpha.length !== width * height
  )
    throw new Error('Text mask alpha pixels are invalid');
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (alpha[y * width + x] > 0) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  return right < 0
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}


/** Outcome of validating text typed for a Type Mask tool entry. */
export type TypeMaskEntryResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Validate the temporary text typed with the Horizontal/Vertical Type Mask
 * tools. Unlike the Type menu command there is no source layer: the entry is
 * discarded after it becomes a selection, so blank or oversized text must be
 * rejected before any canvas is allocated.
 */
export function typeMaskEntryText(value: unknown): TypeMaskEntryResult {
  if (typeof value !== 'string') return { ok: false, error: 'Type some text for the mask' };
  // Normalise Windows/old-Mac line endings so the rendered lines match the
  // text layer renderer, which splits on "\n" only.
  const text = value.replace(/\r\n?/g, '\n');
  if (text.trim().length === 0) return { ok: false, error: 'Type some text for the mask' };
  if (text.length > TEXT_MASK_MAX_TEXT)
    return { ok: false, error: `Type mask text is limited to ${TEXT_MASK_MAX_TEXT} characters` };
  return { ok: true, text };
}
