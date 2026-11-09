import {
  BRUSH_MAX_DIMENSION,
  BRUSH_MAX_PIXELS,
  radialStampMask,
  type BrushColor,
  type BrushPressureSettings,
  type BrushTipSettings,
  type RadialMask,
} from './brush.ts';

/**
 * Small, deterministic pattern sources used by Pattern Stamp.  They are
 * generated locally from the two colour wells; no image or network data is
 * retained in a project.  Keeping the pattern vocabulary finite also gives
 * the renderer a bounded worst-case tile allocation.
 */
export const PATTERN_IDS = [
  'checker',
  'stripes',
  'dots',
  'grid',
  'diagonal',
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];
export const PATTERN_MIN_TILE = 4;
export const PATTERN_MAX_TILE = 128;

export type PatternStampRequest = BrushPressureSettings & BrushTipSettings & {
  width: number;
  height: number;
  x: number;
  y: number;
  size: number;
  hardness: number;
  /** Normalized 0..1 opacity. */
  opacity: number;
  pressure?: number;
  pointerType?: string;
  pattern: PatternId;
  /** The tile's edge length in canvas pixels. */
  tileSize?: number;
  foreground?: BrushColor;
  background?: BrushColor;
  /** Absolute canvas origin of a bounded destination buffer. */
  originX?: number;
  originY?: number;
  /**
   * Tile phase anchor in canvas pixels. Aligned stamping keeps the default
   * (0, 0) so every stroke continues one canvas-wide tiling; non-aligned
   * stamping passes the stroke start so each stroke restarts the tile there.
   */
  anchorX?: number;
  anchorY?: number;
  /** A selection-defined RGBA tile used instead of the procedural pattern. */
  tile?: { width: number; height: number; data: ArrayLike<number> };
};

export type AppliedPatternStamp = RadialMask & { changed: boolean };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const validDimensions = (width: number, height: number) =>
  Number.isInteger(width) &&
  width >= 1 &&
  width <= BRUSH_MAX_DIMENSION &&
  Number.isInteger(height) &&
  height >= 1 &&
  height <= BRUSH_MAX_DIMENSION &&
  width * height <= BRUSH_MAX_PIXELS;
const validChannel = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= 255;
const validColor = (value: unknown): value is BrushColor =>
  Array.isArray(value) && value.length === 4 && value.every(validChannel);

export function validPatternId(value: unknown): value is PatternId {
  return typeof value === 'string' && PATTERN_IDS.includes(value as PatternId);
}

export function normalizePatternTileSize(value: unknown): number {
  if (value === undefined) return 32;
  if (!finite(value) || !Number.isInteger(value))
    throw new Error('Pattern tile size must be an integer');
  if (value < PATTERN_MIN_TILE || value > PATTERN_MAX_TILE)
    throw new Error(
      `Pattern tile size must be between ${PATTERN_MIN_TILE} and ${PATTERN_MAX_TILE}`,
    );
  return value;
}

function assertRequest(request: PatternStampRequest): {
  tileSize: number;
  foreground: BrushColor;
  background: BrushColor;
} {
  if (!validDimensions(request.width, request.height))
    throw new Error('Pattern canvas dimensions are invalid');
  if (request.tile) {
    const { width, height, data } = request.tile;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > PATTERN_MAX_TILE || height > PATTERN_MAX_TILE || data.length !== width * height * 4)
      throw new Error('Pattern tile is invalid');
  } else if (!validPatternId(request.pattern))
    throw new Error('Pattern id is invalid');
  if (!finite(request.originX ?? 0) || !finite(request.originY ?? 0) ||
    !finite(request.anchorX ?? 0) || !finite(request.anchorY ?? 0))
    throw new Error('Pattern origin is invalid');
  const tileSize = normalizePatternTileSize(request.tileSize),
    foreground = request.foreground ?? [0, 0, 0, 255],
    background = request.background ?? [255, 255, 255, 0];
  if (!validColor(foreground) || !validColor(background))
    throw new Error('Pattern colours must contain four 8-bit channels');
  return { tileSize, foreground, background };
}

/** Return the deterministic pattern colour at a tile-local coordinate. */
export function patternColor(
  pattern: PatternId,
  x: number,
  y: number,
  tileSize: number,
  foreground: BrushColor,
  background: BrushColor,
): BrushColor {
  if (!validPatternId(pattern)) throw new Error('Pattern id is invalid');
  const size = normalizePatternTileSize(tileSize);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= size ||
    y >= size
  )
    throw new Error('Pattern coordinate is outside the tile');
  if (!validColor(foreground) || !validColor(background))
    throw new Error('Pattern colours must contain four 8-bit channels');
  const third = Math.max(1, Math.floor(size / 3)),
    half = Math.max(1, Math.floor(size / 2));
  let useForeground = false;
  if (pattern === 'checker')
    useForeground = (Math.floor(x / half) + Math.floor(y / half)) % 2 === 0;
  else if (pattern === 'stripes')
    useForeground = Math.floor((x + y) / third) % 2 === 0;
  else if (pattern === 'diagonal') useForeground = (x + y) % size < half;
  else if (pattern === 'grid') useForeground = x < 2 || y < 2;
  else {
    const radius = Math.max(1, Math.floor(size * 0.18)),
      cx = half,
      cy = half;
    useForeground =
      (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius;
  }
  return (useForeground ? foreground : background).slice() as BrushColor;
}

/**
 * Build a bounded RGBA tile.  This helper is useful to render previews and
 * is deliberately independent of Canvas APIs so its output can be tested in
 * Node and reused by a worker later.
 */
export function createPatternTile(
  pattern: PatternId,
  tileSize = 32,
  foreground: BrushColor = [0, 0, 0, 255],
  background: BrushColor = [255, 255, 255, 0],
): Uint8ClampedArray {
  const size = normalizePatternTileSize(tileSize);
  if (!validPatternId(pattern)) throw new Error('Pattern id is invalid');
  if (!validColor(foreground) || !validColor(background))
    throw new Error('Pattern colours must contain four 8-bit channels');
  const tile = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const color = patternColor(pattern, x, y, size, foreground, background),
        offset = (y * size + x) * 4;
      tile.set(color, offset);
    }
  return tile;
}

function sourceOver(
  destination: Uint8ClampedArray,
  offset: number,
  color: BrushColor,
  alpha: number,
): boolean {
  const sourceAlpha = clamp((color[3] / 255) * alpha, 0, 1);
  if (sourceAlpha <= 0) return false;
  const destinationAlpha = destination[offset + 3] / 255,
    outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) return false;
  let changed = false;
  for (let channel = 0; channel < 3; channel += 1) {
    const next = Math.round(
      (color[channel] * sourceAlpha +
        destination[offset + channel] * destinationAlpha * (1 - sourceAlpha)) /
        outputAlpha,
    );
    changed = destination[offset + channel] !== next || changed;
    destination[offset + channel] = next;
  }
  const nextAlpha = Math.round(outputAlpha * 255);
  changed = destination[offset + 3] !== nextAlpha || changed;
  destination[offset + 3] = nextAlpha;
  return changed;
}

/** Apply one radial pattern stamp to an RGBA byte buffer in-place. */
export function applyPatternStamp(
  destination: Uint8ClampedArray,
  request: PatternStampRequest,
): AppliedPatternStamp {
  const { tileSize, foreground, background } = assertRequest(request);
  if (destination.length !== request.width * request.height * 4)
    throw new Error(
      'Pattern destination must contain RGBA data for every pixel',
    );
  const radial = radialStampMask(request),
    originX = (request.originX ?? 0) - Math.round(request.anchorX ?? 0),
    originY = (request.originY ?? 0) - Math.round(request.anchorY ?? 0),
    tile = request.tile,
    tileWidth = tile?.width ?? tileSize,
    tileHeight = tile?.height ?? tileSize;
  let changed = false;
  for (let py = radial.bounds.top; py < radial.bounds.bottom; py += 1)
    for (let px = radial.bounds.left; px < radial.bounds.right; px += 1) {
      const alpha =
        radial.data[
          (py - radial.bounds.top) * radial.width + (px - radial.bounds.left)
        ] / 255;
      if (alpha <= 0) continue;
      const tileX =
          ((Math.floor(originX + px) % tileWidth) + tileWidth) % tileWidth,
        tileY = ((Math.floor(originY + py) % tileHeight) + tileHeight) % tileHeight,
        color = tile
          ? (Array.from({ length: 4 }, (_, channel) =>
            tile.data[(tileY * tileWidth + tileX) * 4 + channel]) as BrushColor)
          : patternColor(
            request.pattern,
            tileX,
            tileY,
            tileSize,
            foreground,
            background,
          );
      changed =
        sourceOver(destination, (py * request.width + px) * 4, color, alpha) ||
        changed;
    }
  return { ...radial, changed };
}
