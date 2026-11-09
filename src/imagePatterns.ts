/**
 * Selection-defined Pattern Stamp tiles.
 *
 * "Define pattern from selection" crops the selected pixels of the active
 * raster layer to the selection bounds, multiplies their alpha by the
 * selection coverage and keeps a small PNG tile in the local draft settings.
 * Tiles are bounded (at most 128 × 128 pixels, eight patterns, a capped data
 * URL) so a draft cannot grow without limit; larger selections are reduced
 * with a box filter. Nothing leaves the browser.
 */

export const IMAGE_PATTERN_LIMIT = 8;
export const IMAGE_PATTERN_MAX_EDGE = 128;
/** A 128 × 128 RGBA PNG is far below this; it only rejects foreign payloads. */
export const IMAGE_PATTERN_MAX_URL = 120_000;

export type ImagePattern = {
  id: string;
  label: string;
  width: number;
  height: number;
  /** `data:image/png;base64,…` */
  url: string;
};

export type PatternTile = { width: number; height: number; data: Uint8ClampedArray };

const edge = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= IMAGE_PATTERN_MAX_EDGE;

export function validImagePattern(value: unknown): value is ImagePattern {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<ImagePattern>;
  return (
    typeof item.id === 'string' && /^[a-f0-9-]{36}$/i.test(item.id) &&
    typeof item.label === 'string' && item.label.trim().length >= 1 && item.label.length <= 80 &&
    edge(item.width) && edge(item.height) &&
    typeof item.url === 'string' && item.url.length <= IMAGE_PATTERN_MAX_URL &&
    /^data:image\/png;base64,[a-z\d+/]+=*$/i.test(item.url)
  );
}

/** Valid, de-duplicated, newest-last list bounded to the limit. */
export function normalizeImagePatterns(value: unknown): ImagePattern[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((item): item is ImagePattern => validImagePattern(item))
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
    .slice(-IMAGE_PATTERN_LIMIT)
    .map((item) => ({ ...item, label: item.label.trim() }));
}

/** Add a pattern, dropping the oldest beyond the limit. */
export function addImagePattern(list: readonly ImagePattern[], pattern: ImagePattern): ImagePattern[] {
  if (!validImagePattern(pattern)) throw new Error('Image pattern is invalid');
  return [...list.filter((item) => item.id !== pattern.id), pattern].slice(-IMAGE_PATTERN_LIMIT);
}

/** Bounds of mask coverage above zero, or null for an empty mask. */
export function coverageBounds(mask: ArrayLike<number>, width: number, height: number) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (mask[y * width + x] > 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Crop the selected pixels into a pattern tile. Alpha is multiplied by the
 * selection coverage; a tile larger than 128 px on either edge is reduced
 * with an alpha-weighted box filter. Returns null when nothing visible is
 * selected.
 */
export function capturePatternTile(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  mask: ArrayLike<number>,
): PatternTile | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Pattern source dimensions are invalid');
  if (pixels.length !== width * height * 4 || mask.length !== width * height)
    throw new Error('Pattern source and selection must match');
  const bounds = coverageBounds(mask, width, height);
  if (!bounds) return null;
  const scale = Math.max(1, bounds.width / IMAGE_PATTERN_MAX_EDGE, bounds.height / IMAGE_PATTERN_MAX_EDGE),
    tileWidth = Math.max(1, Math.min(IMAGE_PATTERN_MAX_EDGE, Math.round(bounds.width / scale))),
    tileHeight = Math.max(1, Math.min(IMAGE_PATTERN_MAX_EDGE, Math.round(bounds.height / scale))),
    data = new Uint8ClampedArray(tileWidth * tileHeight * 4);
  let visible = false;
  for (let ty = 0; ty < tileHeight; ty += 1)
    for (let tx = 0; tx < tileWidth; tx += 1) {
      const x0 = bounds.x + Math.floor((tx * bounds.width) / tileWidth),
        x1 = Math.max(x0 + 1, bounds.x + Math.floor(((tx + 1) * bounds.width) / tileWidth)),
        y0 = bounds.y + Math.floor((ty * bounds.height) / tileHeight),
        y1 = Math.max(y0 + 1, bounds.y + Math.floor(((ty + 1) * bounds.height) / tileHeight));
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let y = y0; y < y1; y += 1)
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * width + x) * 4,
            alpha = (pixels[offset + 3] * mask[y * width + x]) / 255;
          r += pixels[offset] * alpha;
          g += pixels[offset + 1] * alpha;
          b += pixels[offset + 2] * alpha;
          a += alpha;
          count += 1;
        }
      const offset = (ty * tileWidth + tx) * 4;
      if (a > 0) {
        data[offset] = Math.round(r / a);
        data[offset + 1] = Math.round(g / a);
        data[offset + 2] = Math.round(b / a);
        data[offset + 3] = Math.round(a / count);
        visible = visible || data[offset + 3] > 0;
      }
    }
  return visible ? { width: tileWidth, height: tileHeight, data } : null;
}
