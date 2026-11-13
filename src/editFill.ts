import { NATIVE_CANVAS_BLEND_MODES, type LayerBlendMode } from './blendModes.ts';
import {
  PATTERN_MAX_TILE,
  PATTERN_MIN_TILE,
  createPatternTile,
  validPatternId,
  type PatternId,
} from './patternStamp.ts';
import type { PatternTile } from './imagePatterns.ts';

/** Edit > Fill contents (a bounded subset of the common editor Fill dialog). */
export const EDIT_FILL_CONTENTS = [
  { value: 'foreground', label: 'Foreground Color' },
  { value: 'background', label: 'Background Color' },
  { value: 'color', label: 'Color…' },
  { value: 'black', label: 'Black' },
  { value: 'white', label: 'White' },
  { value: 'gray', label: '50% Gray' },
  { value: 'pattern', label: 'Pattern' },
] as const;

export type EditFillContents = (typeof EDIT_FILL_CONTENTS)[number]['value'];

export type EditFillOptions = {
  contents: EditFillContents;
  /** Only used when `contents` is 'color'. */
  color: string;
  /** Percent, 1–100. */
  opacity: number;
  /** A blend mode the Canvas 2D compositor implements natively. */
  mode: LayerBlendMode;
  /** Present only when `contents` is 'pattern'. */
  pattern?: EditFillPattern;
};

/**
 * A repeating Fill pattern: one of the Pattern Stamp procedural patterns
 * (coloured from the foreground and background wells, like Pattern Stamp) or
 * a selection-defined image pattern (`image:<id>`, used at its defined size).
 */
export type EditFillPattern = {
  source: PatternId | `image:${string}`;
  /** Procedural tile edge in layer pixels (4–128); ignored for image patterns. */
  tileSize: number;
  /** Procedural patterns only: leave background-coloured pixels transparent. */
  transparentBackground: boolean;
};

const IMAGE_SOURCE = /^image:([a-f0-9-]{36})$/i;

/** The image pattern id of an `image:<id>` source, or null for a procedural one. */
export function editFillImagePatternId(source: string): string | null {
  return IMAGE_SOURCE.exec(source)?.[1] ?? null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The #rrggbb colour a Fill with these contents paints. */
export function editFillColor(
  contents: EditFillContents,
  colors: { foreground: string; background: string; color: string },
): string {
  const pick = (value: string, fallback: string) => (HEX.test(value) ? value.toLowerCase() : fallback);
  switch (contents) {
    case 'foreground':
      return pick(colors.foreground, '#000000');
    case 'background':
      return pick(colors.background, '#ffffff');
    case 'color':
      return pick(colors.color, pick(colors.foreground, '#000000'));
    case 'black':
      return '#000000';
    case 'white':
      return '#ffffff';
    case 'gray':
      return '#808080';
    case 'pattern':
      // The pattern's foreground: what a procedural tile draws its lines in.
      return pick(colors.foreground, '#000000');
  }
}

/**
 * Validate dialog input. Returns null for anything the Fill cannot apply
 * exactly (unknown contents, non-native blend modes, opacity out of range).
 */
export function normalizeEditFillOptions(
  value: {
    contents: string;
    color?: string;
    opacity: number | string;
    mode: string;
    pattern?: { source?: unknown; tileSize?: unknown; transparentBackground?: unknown };
  },
  /** Image pattern ids that exist; an `image:` source outside this list is refused. */
  imagePatternIds: readonly string[] = [],
): EditFillOptions | null {
  const contents = EDIT_FILL_CONTENTS.find((item) => item.value === value.contents)?.value;
  const opacity = typeof value.opacity === 'number' ? value.opacity : Number(String(value.opacity).trim());
  if (
    !contents ||
    !Number.isFinite(opacity) ||
    !Number.isInteger(opacity) ||
    opacity < 1 ||
    opacity > 100 ||
    !NATIVE_CANVAS_BLEND_MODES.has(value.mode as LayerBlendMode)
  )
    return null;
  const color = HEX.test(value.color ?? '') ? value.color!.toLowerCase() : '#000000';
  const options: EditFillOptions = { contents, color, opacity, mode: value.mode as LayerBlendMode };
  if (contents !== 'pattern') return options;
  const pattern = normalizeEditFillPattern(value.pattern, imagePatternIds);
  return pattern ? { ...options, pattern } : null;
}

function normalizeEditFillPattern(
  value: { source?: unknown; tileSize?: unknown; transparentBackground?: unknown } | undefined,
  imagePatternIds: readonly string[],
): EditFillPattern | null {
  if (!value || typeof value.source !== 'string') return null;
  const imageId = editFillImagePatternId(value.source);
  if (imageId) {
    if (!imagePatternIds.some((id) => id.toLowerCase() === imageId.toLowerCase())) return null;
  } else if (!validPatternId(value.source)) return null;
  const tileSize =
    typeof value.tileSize === 'number'
      ? value.tileSize
      : typeof value.tileSize === 'string' && value.tileSize.trim()
        ? Number(value.tileSize.trim())
        : Number.NaN;
  // Image patterns keep their defined size, so their tile-size field is not read.
  if (!imageId && (!Number.isInteger(tileSize) || tileSize < PATTERN_MIN_TILE || tileSize > PATTERN_MAX_TILE))
    return null;
  return {
    source: value.source as EditFillPattern['source'],
    tileSize: imageId ? 32 : tileSize,
    transparentBackground: value.transparentBackground !== false,
  };
}

const rgba = (hex: string, alpha: number): [number, number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
  alpha,
];

/**
 * The RGBA tile a procedural Fill pattern repeats: the Pattern Stamp tile in
 * the foreground colour over the background colour (or transparent gaps).
 */
export function editFillPatternTile(
  pattern: EditFillPattern,
  colors: { foreground: string; background: string },
): PatternTile {
  if (!validPatternId(pattern.source)) throw new Error('Fill pattern must be procedural');
  const foreground = HEX.test(colors.foreground) ? colors.foreground : '#000000',
    background = HEX.test(colors.background) ? colors.background : '#ffffff',
    size = pattern.tileSize;
  return {
    width: size,
    height: size,
    data: createPatternTile(
      pattern.source,
      size,
      rgba(foreground, 255),
      rgba(background, pattern.transparentBackground ? 0 : 255),
    ),
  };
}

/** Largest layer the pattern buffer is built for (matches the brush limits). */
export const EDIT_FILL_PATTERN_MAX_PIXELS = 100_000_000;

/**
 * Repeat a tile across a `width` × `height` layer, phase-anchored at the layer
 * origin. With a `mask` (RGBA selection coverage, alpha channel read, same
 * size as the layer) every pixel's alpha is multiplied by its coverage, which
 * is what the colour Fill does with a `destination-in` mask: unselected pixels
 * stay fully transparent and a feathered edge fades.
 */
export function renderEditFillPattern(
  width: number,
  height: number,
  tile: { width: number; height: number; data: ArrayLike<number> },
  mask?: ArrayLike<number>,
): Uint8ClampedArray<ArrayBuffer> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
    width * height > EDIT_FILL_PATTERN_MAX_PIXELS)
    throw new Error('Fill dimensions are invalid');
  if (!Number.isInteger(tile.width) || !Number.isInteger(tile.height) || tile.width < 1 || tile.height < 1 ||
    tile.data.length !== tile.width * tile.height * 4)
    throw new Error('Fill pattern tile is invalid');
  if (mask && mask.length !== width * height * 4) throw new Error('Fill mask must match the layer');
  const output = new Uint8ClampedArray(width * height * 4),
    rowBytes = width * 4,
    source = tile.data instanceof Uint8ClampedArray ? tile.data : Uint8ClampedArray.from(tile.data);
  // Build one row per tile row, then copy rows down the layer.
  const rows = Math.min(height, tile.height);
  for (let y = 0; y < rows; y += 1) {
    const rowStart = y * rowBytes,
      tileRow = source.subarray(y * tile.width * 4, (y + 1) * tile.width * 4);
    for (let x = 0; x < width; x += tile.width)
      output.set(x + tile.width <= width ? tileRow : tileRow.subarray(0, (width - x) * 4), rowStart + x * 4);
  }
  for (let y = rows; y < height; y += 1)
    output.copyWithin(y * rowBytes, (y % tile.height) * rowBytes, (y % tile.height + 1) * rowBytes);
  if (mask)
    for (let index = 3; index < output.length; index += 4) {
      const coverage = mask[index];
      if (coverage === 255) continue;
      output[index] = coverage === 0 ? 0 : Math.round((output[index] * coverage) / 255);
    }
  return output;
}
