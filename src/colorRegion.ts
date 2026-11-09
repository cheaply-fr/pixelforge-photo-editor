/**
 * Colour-region matching shared by Magic Wand and Fill (Paint Bucket).
 *
 * Both tools pick the colour under the click and collect pixels whose RGBA
 * channels all lie within `tolerance` (0–255, Chebyshev distance) of it.
 * With `contiguous` the region grows 4-connected from the click; without it
 * every matching pixel in the plane is taken (Photoshop's Contiguous off).
 * Whether the sampled plane is the active layer or the merged visible image
 * ("Sample All Layers") is the caller's choice; the matching stays pure.
 */

export type ColorRegionOptions = {
  tolerance: number;
  contiguous: boolean;
};

/** Persisted Magic Wand / Fill sampling options. */
export type ColorRegionSettings = {
  contiguous: boolean;
  sampleAllLayers: boolean;
};

export const DEFAULT_COLOR_REGION_SETTINGS: ColorRegionSettings = Object.freeze({
  contiguous: true,
  sampleAllLayers: false,
});

/** Older drafts omit the options; anything malformed falls back per field. */
export function normalizeColorRegionSettings(value: unknown): ColorRegionSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    contiguous:
      typeof record.contiguous === 'boolean' ? record.contiguous : DEFAULT_COLOR_REGION_SETTINGS.contiguous,
    sampleAllLayers:
      typeof record.sampleAllLayers === 'boolean'
        ? record.sampleAllLayers
        : DEFAULT_COLOR_REGION_SETTINGS.sampleAllLayers,
  };
}

export const normalizeColorTolerance = (value: unknown, fallback = 24) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(255, Math.round(number))) : fallback;
};

/**
 * Coverage mask (0 or 255 per pixel) of the pixels matching the RGBA colour at
 * (x, y). Returns null when the click is outside the plane.
 */
export function colorRegionMask(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
  options: ColorRegionOptions,
): Uint8Array | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Color region dimensions are invalid');
  if (rgba.length < width * height * 4) throw new Error('Color region plane is too small');
  const startX = Math.floor(x), startY = Math.floor(y);
  if (!(startX >= 0 && startY >= 0 && startX < width && startY < height)) return null;
  const tolerance = normalizeColorTolerance(options.tolerance),
    start = (startY * width + startX) * 4,
    r = Number(rgba[start]),
    g = Number(rgba[start + 1]),
    b = Number(rgba[start + 2]),
    a = Number(rgba[start + 3]),
    mask = new Uint8Array(width * height);
  const same = (offset: number) =>
    Math.abs(Number(rgba[offset]) - r) <= tolerance &&
    Math.abs(Number(rgba[offset + 1]) - g) <= tolerance &&
    Math.abs(Number(rgba[offset + 2]) - b) <= tolerance &&
    Math.abs(Number(rgba[offset + 3]) - a) <= tolerance;
  if (!options.contiguous) {
    for (let pixel = 0; pixel < mask.length; pixel += 1) if (same(pixel * 4)) mask[pixel] = 255;
    return mask;
  }
  // Scanline-free 4-connected fill with an explicit typed stack; `mask` doubles
  // as the visited set because every visited pixel is a match.
  const seen = new Uint8Array(width * height);
  let stack = new Int32Array(1024), top = 0;
  const push = (pixel: number) => {
    if (seen[pixel]) return;
    seen[pixel] = 1;
    if (top === stack.length) {
      const grown = new Int32Array(stack.length * 2);
      grown.set(stack);
      stack = grown;
    }
    stack[top++] = pixel;
  };
  push(startY * width + startX);
  while (top > 0) {
    const pixel = stack[--top];
    if (!same(pixel * 4)) continue;
    mask[pixel] = 255;
    const px = pixel % width, py = (pixel - px) / width;
    if (px > 0) push(pixel - 1);
    if (px + 1 < width) push(pixel + 1);
    if (py > 0) push(pixel - width);
    if (py + 1 < height) push(pixel + width);
  }
  return mask;
}

/**
 * Resample a frame-space coverage mask into a layer's pixel grid. `matrix` is
 * the layer's [a, b, c, d, e, f] placement (layer pixel → frame), matching how
 * selections are sampled for layer edits.
 */
export function frameMaskToLayer(
  mask: ArrayLike<number>,
  frameWidth: number,
  frameHeight: number,
  matrix: readonly number[],
  layerWidth: number,
  layerHeight: number,
): Uint8Array {
  const [a, b, c, d, e, f] = matrix,
    out = new Uint8Array(layerWidth * layerHeight);
  for (let y = 0; y < layerHeight; y += 1)
    for (let x = 0; x < layerWidth; x += 1) {
      const fx = Math.floor(a * (x + 0.5) + c * (y + 0.5) + e),
        fy = Math.floor(b * (x + 0.5) + d * (y + 0.5) + f);
      if (fx >= 0 && fy >= 0 && fx < frameWidth && fy < frameHeight)
        out[y * layerWidth + x] = Number(mask[fy * frameWidth + fx]);
    }
  return out;
}

/** Paint `color` (opaque RGB) over every pixel the mask covers. Returns the changed pixel count. */
export function fillMaskedPixels(
  rgba: Uint8ClampedArray,
  mask: ArrayLike<number>,
  color: readonly [number, number, number],
): number {
  let changed = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!Number(mask[pixel])) continue;
    const offset = pixel * 4;
    if (
      rgba[offset] !== color[0] ||
      rgba[offset + 1] !== color[1] ||
      rgba[offset + 2] !== color[2] ||
      rgba[offset + 3] !== 255
    )
      changed += 1;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return changed;
}

/**
 * Edit > Clear: remove selection coverage from a layer's pixels. Alpha is
 * scaled by (1 − coverage), so feathered selections clear partially, as with a
 * Delete through a soft selection. Returns true when any alpha changed.
 */
export function clearSelectedPixels(rgba: Uint8ClampedArray, mask: ArrayLike<number>): boolean {
  let changed = false;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const coverage = Number(mask[pixel]);
    if (!coverage) continue;
    const offset = pixel * 4 + 3, before = rgba[offset];
    if (!before) continue;
    const after = coverage >= 255 ? 0 : Math.round((before * (255 - coverage)) / 255);
    if (after !== before) {
      rgba[offset] = after;
      changed = true;
    }
  }
  return changed;
}
