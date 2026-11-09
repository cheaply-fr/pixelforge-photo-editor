/**
 * Deterministic radial brush primitives shared by paint, eraser and retouch
 * tools. The primitive works on RGBA byte arrays so pressure, hardness,
 * clipping, alpha compositing and clone masks can be tested without a DOM.
 */
import { bristleCoverage, normalizeBrushBristle } from './brushBristle.ts';
import { normalizeBrushWetEdges, wetEdgesOpacity } from './brushWetEdges.ts';
import { buildUpOpacity, normalizeBrushBuildUp } from './brushBuildUp.ts';
import {
  mapBrushPressure,
  normalizeBrushPressureCurve,
  validBrushPressureCurve,
  type BrushPressureCurve,
} from './brushPressure.ts';

export const BRUSH_MAX_SIZE = 10000;
export const BRUSH_MAX_DIMENSION = 16000;
export const BRUSH_MAX_PIXELS = 16000000;

export const BRUSH_MODES = ['source-over', 'destination-out', 'clone', 'heal'] as const;
export type BrushMode = (typeof BRUSH_MODES)[number];
/** PointerEvent pointerType values; named values stay visible in editor hints. */
export type BrushPointerType = 'mouse' | 'pen' | 'touch' | (string & { readonly __pointerType?: never });
export type BrushColor = [number, number, number, number];
export type BrushPressureSettings = {
  /** Defaults to false; pressure modulation is opt-in and explicit. */
  pressureSize?: boolean;
  /** Defaults to false; pressure modulation is opt-in and explicit. */
  pressureOpacity?: boolean;
  /** Bounded response curve for enabled pen/touch pressure mappings. */
  pressureCurve?: BrushPressureCurve;
};
/** Bounded brush-tip geometry controls shared by raster brush tools. */
export type BrushTipSettings = {
  /** Distance between dabs as a percentage of the brush diameter. */
  spacing?: number;
  /** Tip rotation in degrees. */
  angle?: number;
  /** Tip roundness, where 100 is circular and lower values are elliptical. */
  roundness?: number;
  /** Mirror the tip around its local horizontal/vertical axis. */
  flipX?: boolean;
  flipY?: boolean;
};
export const BRUSH_DEFAULT_SPACING = 25;
/** Dab spacing bounds, as a percentage of the brush diameter (1,000% = sparse stamps). */
export const BRUSH_SPACING_MIN = 1;
export const BRUSH_SPACING_MAX = 1000;
/**
 * Normalized pen pressure at or below this value is a pen lift: when a
 * pressure mapping is enabled the dab paints nothing.
 */
export const BRUSH_PEN_LIFT_PRESSURE = 0.01;
export const BRUSH_DEFAULT_ANGLE = 0;
export const BRUSH_DEFAULT_ROUNDNESS = 100;
export type BrushStampSettings = BrushPressureSettings & {
  size: number;
  hardness: number;
  /** Opacity is a normalized 0..1 value. */
  opacity: number;
  pressure?: number;
  pointerType?: BrushPointerType;
  /** Deterministic physical-filament coverage amount. */
  bristle?: number;
  /** Deterministic edge-weighted opacity amount. */
  wetEdges?: number;
  /** Deterministic centre-weighted opacity amount. */
  buildUp?: number;
} & BrushTipSettings;
export type ResolvedBrushStamp = {
  pressure: number;
  size: number;
  radius: number;
  hardness: number;
  opacity: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  pressureCurve: BrushPressureCurve;
  spacing: number;
  angle: number;
  roundness: number;
  flipX: boolean;
  flipY: boolean;
  bristle: number;
  /** True when enabled pressure mapping saw a pen lift (near-zero pressure); opacity is then 0. */
  lifted: boolean;
};
export type StampBounds = { left: number; top: number; right: number; bottom: number };
export type RadialMask = {
  /** Local mask width; the array is bounded by `bounds`, not full-canvas sized. */
  width: number;
  /** Local mask height; the array is bounded by `bounds`, not full-canvas sized. */
  height: number;
  data: Uint8ClampedArray;
  bounds: StampBounds;
  stamp: ResolvedBrushStamp;
};
export type RadialStampRequest = BrushStampSettings & {
  width: number;
  height: number;
  x: number;
  y: number;
};
export type ApplyRadialStampRequest = RadialStampRequest & {
  mode: BrushMode;
  color?: BrushColor;
  /** Clone/heal source pixels. It is read-only and must match the destination dimensions. */
  source?: ArrayLike<number>;
  /** Source-space point corresponding to the destination stamp centre. Defaults to x/y. */
  sourceX?: number;
  sourceY?: number;
  /** Heal opacity multiplier; defaults to the existing 0.65 retouch behavior. */
  healingOpacity?: number;
};
export type AppliedRadialStamp = RadialMask & { changed: boolean; mask: Uint8ClampedArray };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && width >= 1 && width <= BRUSH_MAX_DIMENSION &&
    Number.isInteger(height) && height >= 1 && height <= BRUSH_MAX_DIMENSION &&
    width * height <= BRUSH_MAX_PIXELS;
}

function assertDimensions(width: number, height: number): void {
  if (!validDimensions(width, height)) throw new Error('Brush canvas dimensions are invalid');
}

function validChannel(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 255;
}

function assertColor(color: unknown): asserts color is BrushColor {
  if (!Array.isArray(color) || color.length !== 4 || !color.every(validChannel))
    throw new Error('Brush color must contain four 8-bit channels');
}

export function validBrushPressureSettings(value: unknown): value is BrushPressureSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as BrushPressureSettings;
  return (candidate.pressureSize === undefined || typeof candidate.pressureSize === 'boolean') &&
    (candidate.pressureOpacity === undefined || typeof candidate.pressureOpacity === 'boolean') &&
    (candidate.pressureCurve === undefined || validBrushPressureCurve(candidate.pressureCurve));
}

export function effectiveBrushPressureSettings(value: BrushPressureSettings | undefined): Required<BrushPressureSettings> {
  return {
    pressureSize: value?.pressureSize ?? false,
    pressureOpacity: value?.pressureOpacity ?? false,
    pressureCurve: normalizeBrushPressureCurve(value?.pressureCurve),
  };
}

export function validBrushTipSettings(value: unknown): value is BrushTipSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as BrushTipSettings;
  return (
    (candidate.spacing === undefined ||
      (finite(candidate.spacing) && candidate.spacing >= BRUSH_SPACING_MIN && candidate.spacing <= BRUSH_SPACING_MAX)) &&
    (candidate.angle === undefined ||
      (finite(candidate.angle) && candidate.angle >= -180 && candidate.angle <= 180)) &&
    (candidate.roundness === undefined ||
      (finite(candidate.roundness) && candidate.roundness >= 1 && candidate.roundness <= 100)) &&
    (candidate.flipX === undefined || typeof candidate.flipX === 'boolean') &&
    (candidate.flipY === undefined || typeof candidate.flipY === 'boolean')
  );
}

export function effectiveBrushTipSettings(value: BrushTipSettings | undefined): Required<BrushTipSettings> {
  return {
    spacing: value?.spacing ?? BRUSH_DEFAULT_SPACING,
    angle: value?.angle ?? BRUSH_DEFAULT_ANGLE,
    roundness: value?.roundness ?? BRUSH_DEFAULT_ROUNDNESS,
    flipX: value?.flipX ?? false,
    flipY: value?.flipY ?? false,
  };
}

/**
 * Match PointerEvent behavior: mouse and missing/out-of-range pressure use a
 * deterministic full-pressure fallback. Touch pressure 0 also means full
 * pressure (many touch screens report 0 when they cannot sense force), but a
 * pen reading of 0 is real: the nib is lifting off the surface.
 */
export function normalizeBrushPressure(pointerType: string | undefined, pressure: number | undefined): number {
  if (pointerType === 'pen' && finite(pressure) && pressure >= 0 && pressure <= 1) return pressure;
  return pointerType === 'touch' && finite(pressure) && pressure > 0 && pressure <= 1
    ? pressure
    : 1;
}

/** Whether a normalized pressure is a pen lift for the enabled pressure mappings. */
export function isBrushPenLift(pressure: number, settings: BrushPressureSettings | undefined): boolean {
  const flags = effectiveBrushPressureSettings(settings);
  return (flags.pressureSize || flags.pressureOpacity) && finite(pressure) && pressure <= BRUSH_PEN_LIFT_PRESSURE;
}

export function resolveBrushStamp(settings: BrushStampSettings): ResolvedBrushStamp {
  if (!finite(settings.size) || settings.size < 1 || settings.size > BRUSH_MAX_SIZE)
    throw new Error('Brush size must be between 1 and 10,000');
  if (!finite(settings.hardness) || settings.hardness < 0 || settings.hardness > 100)
    throw new Error('Brush hardness must be between 0 and 100');
  if (!finite(settings.opacity) || settings.opacity < 0 || settings.opacity > 1)
    throw new Error('Brush opacity must be between 0 and 1');
  if (!validBrushPressureSettings(settings)) throw new Error('Brush pressure settings are invalid');
  if (!validBrushTipSettings(settings)) throw new Error('Brush tip settings are invalid');
  const pressure = normalizeBrushPressure(settings.pointerType, settings.pressure),
    flags = effectiveBrushPressureSettings(settings),
    tip = effectiveBrushTipSettings(settings),
    bristle = normalizeBrushBristle(settings.bristle),
    response = mapBrushPressure(pressure, flags.pressureCurve),
    size = settings.size * (flags.pressureSize ? response : 1),
    lifted = isBrushPenLift(pressure, flags),
    opacity = lifted ? 0 : settings.opacity * (flags.pressureOpacity ? response : 1);
  return {
    pressure,
    size: Math.max(0.0001, size),
    radius: Math.max(0.00005, size / 2),
    hardness: settings.hardness,
    opacity: clamp(opacity, 0, 1),
    ...flags,
    ...tip,
    bristle,
    lifted,
  };
}

/** Return radial alpha coverage at a pixel centre. */
export function radialCoverage(distance: number, radius: number, hardness: number): number {
  if (!finite(distance) || !finite(radius) || !finite(hardness) || radius <= 0 || hardness < 0 || hardness > 100)
    throw new Error('Radial brush geometry is invalid');
  if (distance > radius) return 0;
  if (hardness >= 100) return 1;
  const softRadius = radius * (1 - hardness / 100),
    plateau = radius - softRadius;
  return distance <= plateau ? 1 : clamp((radius - distance) / Math.max(0.0000001, softRadius), 0, 1);
}

/** Return alpha coverage for a rotated, optionally mirrored elliptical tip. */
export function brushCoverage(
  dx: number,
  dy: number,
  radius: number,
  hardness: number,
  roundness = BRUSH_DEFAULT_ROUNDNESS,
  angle = BRUSH_DEFAULT_ANGLE,
  flipX = false,
  flipY = false,
): number {
  if (!finite(dx) || !finite(dy) || !finite(radius) || radius <= 0)
    throw new Error('Brush tip geometry is invalid');
  if (!finite(roundness) || roundness < 1 || roundness > 100)
    throw new Error('Brush roundness must be between 1 and 100');
  if (!finite(angle) || angle < -180 || angle > 180)
    throw new Error('Brush angle must be between -180 and 180');
  if (typeof flipX !== 'boolean' || typeof flipY !== 'boolean')
    throw new Error('Brush tip flip settings are invalid');
  const radians = (angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  // Rotate into tip-local space. Mirrors are retained as explicit controls;
  // symmetric round/elliptical tips intentionally remain pixel-identical.
  let localX = dx * cos + dy * sin,
    localY = -dx * sin + dy * cos;
  if (flipX) localX = -localX;
  if (flipY) localY = -localY;
  const verticalScale = roundness / 100,
    distance = Math.hypot(localX, localY / verticalScale);
  return radialCoverage(distance, radius, hardness);
}

function stampBounds(width: number, height: number, x: number, y: number, radius: number): StampBounds {
  const left = Math.max(0, Math.floor(x - radius)),
    top = Math.max(0, Math.floor(y - radius)),
    right = Math.min(width, Math.floor(x + radius) + 1),
    bottom = Math.min(height, Math.floor(y + radius) + 1);
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

/** Build a bounded local mask. The returned byte array is newly allocated. */
export function radialStampMask(request: RadialStampRequest): RadialMask {
  assertDimensions(request.width, request.height);
  if (!finite(request.x) || !finite(request.y)) throw new Error('Brush point is invalid');
  const stamp = resolveBrushStamp(request),
    bounds = stampBounds(request.width, request.height, request.x, request.y, stamp.radius),
    width = Math.max(0, bounds.right - bounds.left),
    height = Math.max(0, bounds.bottom - bounds.top),
    data = new Uint8ClampedArray(width * height),
    scale = stamp.opacity * 255;
  // Hoist every per-stamp constant out of the pixel loop. The arithmetic below
  // mirrors `brushCoverage`/`radialCoverage` exactly; it only avoids repeated
  // validation and trigonometry so multi-thousand-pixel dabs stay interactive.
  const radius = stamp.radius,
    radians = (stamp.angle * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    verticalScale = stamp.roundness / 100,
    hard = stamp.hardness >= 100,
    softRadius = radius * (1 - stamp.hardness / 100),
    plateau = radius - softRadius,
    softDivisor = Math.max(0.0000001, softRadius),
    bristle = normalizeBrushBristle(request.bristle ?? 0),
    wet = normalizeBrushWetEdges(request.wetEdges ?? 0),
    buildUpAmount = normalizeBrushBuildUp(request.buildUp ?? 0),
    needsCentreDistance = wet !== 0 || buildUpAmount !== 0,
    // Every tip is inscribed in the circle of `radius`, so pixels outside a
    // slightly widened circle have zero coverage and can be skipped per row.
    spanRadiusSquared = (radius + 1) * (radius + 1),
    centreX = request.x,
    centreY = request.y,
    flipX = stamp.flipX,
    flipY = stamp.flipY;
  for (let py = bounds.top; py < bounds.bottom; py += 1) {
    const dy = py - centreY,
      rowReach = spanRadiusSquared - dy * dy;
    if (rowReach < 0) continue;
    const reach = Math.sqrt(rowReach),
      rowLeft = Math.max(bounds.left, Math.floor(centreX - reach)),
      rowRight = Math.min(bounds.right, Math.ceil(centreX + reach) + 1),
      rowOffset = (py - bounds.top) * width - bounds.left;
    for (let px = rowLeft; px < rowRight; px += 1) {
      const dx = px - centreX;
      let localX = dx * cos + dy * sin,
        localY = -dx * sin + dy * cos;
      if (flipX) localX = -localX;
      if (flipY) localY = -localY;
      const scaledY = localY / verticalScale,
        distance = Math.sqrt(localX * localX + scaledY * scaledY);
      if (distance > radius) continue;
      const coverage = hard || distance <= plateau
        ? 1
        : clamp((radius - distance) / softDivisor, 0, 1);
      if (coverage <= 0) continue;
      const filament = bristle === 0 ? 1 : bristleCoverage(dx, dy, radius, bristle);
      if (filament <= 0) continue;
      let wetEdges = 1,
        buildUp = 1;
      if (needsCentreDistance) {
        const centreDistance = Math.hypot(dx, dy);
        if (wet !== 0) wetEdges = wetEdgesOpacity(centreDistance, radius, wet);
        if (buildUpAmount !== 0) buildUp = buildUpOpacity(centreDistance, radius, buildUpAmount);
      }
      data[rowOffset + px] = Math.round(coverage * filament * wetEdges * buildUp * scale);
    }
  }
  return { width, height, data, bounds, stamp };
}

function assertPixels(value: ArrayLike<number>, width: number, height: number, label: string, bounds?: StampBounds): void {
  if (value.length !== width * height * 4) throw new Error(`${label} must contain RGBA data for every pixel`);
  // Clamped byte arrays can only hold integer channels 0…255, so the per-pixel
  // scan is redundant for them (and costs seconds on multi-thousand-pixel dabs).
  if (!bounds || value instanceof Uint8ClampedArray) return;
  for (let py = bounds.top; py < bounds.bottom; py += 1)
    for (let px = bounds.left; px < bounds.right; px += 1) {
      const offset = (py * width + px) * 4;
      for (let channel = 0; channel < 4; channel += 1)
        if (!validChannel(value[offset + channel])) throw new Error(`${label} contains invalid RGBA channels`);
    }
}

/** Translate destination stamp bounds into the source rectangle sampled by clone/heal. */
function translatedSourceBounds(
  bounds: StampBounds,
  sourceX: number,
  sourceY: number,
  destinationX: number,
  destinationY: number,
  width: number,
  height: number,
): StampBounds {
  const left = clamp(Math.round(sourceX + bounds.left - destinationX), 0, width),
    top = clamp(Math.round(sourceY + bounds.top - destinationY), 0, height),
    right = clamp(Math.round(sourceX + bounds.right - 1 - destinationX) + 1, 0, width),
    bottom = clamp(Math.round(sourceY + bounds.bottom - 1 - destinationY) + 1, 0, height);
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

function sourceOver(destination: Uint8ClampedArray, offset: number, color: BrushColor, alpha: number): boolean {
  const sourceAlpha = clamp((color[3] / 255) * alpha, 0, 1);
  if (sourceAlpha <= 0) return false;
  const destinationAlpha = destination[offset + 3] / 255,
    outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) return false;
  for (let channel = 0; channel < 3; channel += 1)
    destination[offset + channel] = Math.round((color[channel] * sourceAlpha + destination[offset + channel] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
  destination[offset + 3] = Math.round(outputAlpha * 255);
  return true;
}

function destinationOut(destination: Uint8ClampedArray, offset: number, alpha: number): boolean {
  const before = destination[offset + 3], after = Math.round(before * (1 - clamp(alpha, 0, 1)));
  if (after === before) return false;
  destination[offset + 3] = after;
  if (after === 0) {
    destination[offset] = 0;
    destination[offset + 1] = 0;
    destination[offset + 2] = 0;
  }
  return true;
}

/** Edge length of the lazily allocated tiles of a `BrushStrokeBuffer`. */
export const BRUSH_STROKE_TILE = 64;
const STROKE_TILE_SHIFT = 6;
type BrushStrokeTile = {
  /** Stroke coverage 0..1 (0 = this pixel has not been touched by the stroke). */
  coverage: Float32Array;
  /** Accumulated (straight) stroke colour. */
  color: Uint8ClampedArray;
  /** The destination pixel as it was before the stroke first touched it. */
  base: Uint8ClampedArray;
};

/**
 * Per-stroke coverage buffer that makes Opacity a per-stroke ceiling. Dabs
 * accumulate stroke coverage `s` (each dab adds `e·(1 − s)`, where `e` is the
 * dab's flow-scaled alpha divided by the ceiling); the destination is always
 * recomposited from the pixel it held before the stroke, at `ceiling · s`.
 * A long Opacity 50 % / Flow 100 % stroke therefore stays at 50 % instead of
 * compounding every overlapping dab. Tiles are allocated only where the
 * stroke paints, so memory follows the painted area, not the canvas size.
 */
export class BrushStrokeBuffer {
  readonly width: number;
  readonly height: number;
  /** Stroke opacity ceiling, 0..1. */
  readonly ceiling: number;
  private readonly tilesX: number;
  private readonly tiles = new Map<number, BrushStrokeTile>();
  private lastKey = -1;
  private lastTile: BrushStrokeTile | undefined;

  constructor(width: number, height: number, ceiling: number) {
    assertDimensions(width, height);
    if (!finite(ceiling) || ceiling < 0 || ceiling > 1) throw new Error('Brush stroke opacity must be between 0 and 1');
    this.width = width;
    this.height = height;
    this.ceiling = ceiling;
    this.tilesX = Math.ceil(width / BRUSH_STROKE_TILE);
  }

  /** Number of allocated tiles (memory follows the painted area). */
  get tileCount(): number {
    return this.tiles.size;
  }

  /** Stroke coverage (0..1) at a pixel, 0 where the stroke has not painted. */
  coverageAt(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    const tile = this.tiles.get((y >> STROKE_TILE_SHIFT) * this.tilesX + (x >> STROKE_TILE_SHIFT));
    return tile ? tile.coverage[(y & (BRUSH_STROKE_TILE - 1)) * BRUSH_STROKE_TILE + (x & (BRUSH_STROKE_TILE - 1))] : 0;
  }

  /**
   * Add one dab's alpha at a pixel and rewrite `destination[offset…]` from
   * the pre-stroke pixel. `alpha` is the dab's flow-scaled alpha (≤ the
   * ceiling); `color` is the dab colour with its own alpha (clone/heal
   * samples may be translucent). `erase` removes alpha instead of painting
   * and `factor` scales the final alpha (Healing's bounded blend).
   */
  accumulate(
    destination: Uint8ClampedArray,
    offset: number,
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    colorAlpha: number,
    alpha: number,
    erase: boolean,
    factor = 1,
  ): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || this.ceiling <= 0) return false;
    const key = (y >> STROKE_TILE_SHIFT) * this.tilesX + (x >> STROKE_TILE_SHIFT);
    let tile = key === this.lastKey ? this.lastTile : this.tiles.get(key);
    if (!tile) {
      const area = BRUSH_STROKE_TILE * BRUSH_STROKE_TILE;
      tile = { coverage: new Float32Array(area), color: new Uint8ClampedArray(area * 3), base: new Uint8ClampedArray(area * 4) };
      this.tiles.set(key, tile);
    }
    this.lastKey = key;
    this.lastTile = tile;
    const index = (y & (BRUSH_STROKE_TILE - 1)) * BRUSH_STROKE_TILE + (x & (BRUSH_STROKE_TILE - 1)),
      before = tile.coverage[index],
      dab = clamp(alpha / this.ceiling, 0, 1) * clamp(colorAlpha / 255, 0, 1);
    if (dab <= 0) return false;
    const base = tile.base, baseOffset = index * 4;
    if (before === 0)
      for (let channel = 0; channel < 4; channel += 1) base[baseOffset + channel] = destination[offset + channel];
    const after = before + dab * (1 - before),
      colorOffset = index * 3,
      strokeColor = tile.color;
    tile.coverage[index] = after;
    if (!erase) {
      const keep = before * (1 - dab);
      strokeColor[colorOffset] = Math.round((red * dab + strokeColor[colorOffset] * keep) / after);
      strokeColor[colorOffset + 1] = Math.round((green * dab + strokeColor[colorOffset + 1] * keep) / after);
      strokeColor[colorOffset + 2] = Math.round((blue * dab + strokeColor[colorOffset + 2] * keep) / after);
    }
    const strokeAlpha = clamp(this.ceiling * after * factor, 0, 1),
      baseAlpha = base[baseOffset + 3] / 255;
    let r: number, g: number, b: number, a: number;
    if (erase) {
      a = Math.round(base[baseOffset + 3] * (1 - strokeAlpha));
      r = a === 0 ? 0 : base[baseOffset];
      g = a === 0 ? 0 : base[baseOffset + 1];
      b = a === 0 ? 0 : base[baseOffset + 2];
    } else {
      const inverse = 1 - strokeAlpha, outputAlpha = strokeAlpha + baseAlpha * inverse;
      if (outputAlpha <= 0) {
        r = base[baseOffset];
        g = base[baseOffset + 1];
        b = base[baseOffset + 2];
        a = base[baseOffset + 3];
      } else {
        r = Math.round((strokeColor[colorOffset] * strokeAlpha + base[baseOffset] * baseAlpha * inverse) / outputAlpha);
        g = Math.round((strokeColor[colorOffset + 1] * strokeAlpha + base[baseOffset + 1] * baseAlpha * inverse) / outputAlpha);
        b = Math.round((strokeColor[colorOffset + 2] * strokeAlpha + base[baseOffset + 2] * baseAlpha * inverse) / outputAlpha);
        a = Math.round(outputAlpha * 255);
      }
    }
    const changed = destination[offset] !== r || destination[offset + 1] !== g ||
      destination[offset + 2] !== b || destination[offset + 3] !== a;
    destination[offset] = r;
    destination[offset + 1] = g;
    destination[offset + 2] = b;
    destination[offset + 3] = a;
    return changed;
  }
}

/** A stroke buffer plus the canvas position of the local destination region. */
export type BrushStrokeTarget = { buffer: BrushStrokeBuffer; originX: number; originY: number };

/**
 * Apply a radial stamp in-place and return its reusable mask. Clone/heal use
 * source pixels with source-over compositing; callers can also consume the
 * returned mask to build a nondestructive source/mask layer. With a `stroke`
 * target the dab accumulates into that per-stroke buffer instead, so the
 * stroke never exceeds the buffer's opacity ceiling.
 */
export function applyRadialStamp(
  destination: Uint8ClampedArray,
  request: ApplyRadialStampRequest,
  stroke?: BrushStrokeTarget,
): AppliedRadialStamp {
  assertDimensions(request.width, request.height);
  if (!BRUSH_MODES.includes(request.mode)) throw new Error('Brush mode is invalid');
  const radial = radialStampMask(request);
  assertPixels(destination, request.width, request.height, 'Destination', radial.bounds);
  const sourceX = request.sourceX ?? request.x,
    sourceY = request.sourceY ?? request.y;
  if (!finite(sourceX) || !finite(sourceY)) throw new Error('Brush source point is invalid');
  const sourceMode = request.mode === 'clone' || request.mode === 'heal';
  if (sourceMode) {
    if (!request.source) throw new Error('Clone and healing stamps require source pixels');
    // Only validate the source rectangle sampled by this bounded stamp. The
    // source centre can be offset from the destination centre for clone tools.
    const sourceBounds = translatedSourceBounds(
      radial.bounds,
      sourceX,
      sourceY,
      request.x,
      request.y,
      request.width,
      request.height,
    );
    assertPixels(request.source, request.width, request.height, 'Source', sourceBounds);
  } else if (request.mode === 'source-over') {
    assertColor(request.color);
  }
  const healFactor = request.mode === 'heal' ? request.healingOpacity ?? 0.65 : 1;
  if (!finite(healFactor) || healFactor < 0 || healFactor > 1) throw new Error('Healing opacity is invalid');
  let changed = false;
  // Hoist request fields: callers often pass large spread option objects, and
  // re-reading them per pixel dominates multi-thousand-pixel dabs.
  const mode = request.mode,
    canvasWidth = request.width,
    canvasHeight = request.height,
    centreX = request.x,
    centreY = request.y,
    color = request.color!,
    source = request.source,
    mask = radial.data,
    maskWidth = radial.width,
    { top, bottom, left, right } = radial.bounds;
  if (stroke) {
    const buffer = stroke.buffer, originX = stroke.originX, originY = stroke.originY,
      erase = mode === 'destination-out';
    for (let py = top; py < bottom; py += 1) {
      const maskRow = (py - top) * maskWidth - left,
        destinationRow = py * canvasWidth;
      for (let px = left; px < right; px += 1) {
        const coverage = mask[maskRow + px];
        if (coverage === 0) continue;
        const offset = (destinationRow + px) * 4;
        if (mode === 'source-over' || erase) {
          changed = buffer.accumulate(destination, offset, px + originX, py + originY,
            erase ? 0 : color[0], erase ? 0 : color[1], erase ? 0 : color[2], erase ? 255 : color[3],
            coverage / 255, erase) || changed;
          continue;
        }
        const sx = Math.round(sourceX + px - centreX),
          sy = Math.round(sourceY + py - centreY);
        if (sx < 0 || sy < 0 || sx >= canvasWidth || sy >= canvasHeight) continue;
        const sourceOffset = (sy * canvasWidth + sx) * 4;
        changed = buffer.accumulate(destination, offset, px + originX, py + originY,
          source![sourceOffset], source![sourceOffset + 1], source![sourceOffset + 2], source![sourceOffset + 3],
          coverage / 255, false, healFactor) || changed;
      }
    }
    return { ...radial, changed, mask: radial.data };
  }
  if (mode === 'source-over') {
    // Inline `sourceOver` with a per-coverage alpha table (masks hold only 256
    // distinct values); the arithmetic is identical to the helper.
    const sourceAlphaByCoverage = new Float64Array(256);
    for (let coverage = 1; coverage < 256; coverage += 1)
      sourceAlphaByCoverage[coverage] = clamp((color[3] / 255) * (coverage / 255), 0, 1);
    const red = color[0], green = color[1], blue = color[2];
    for (let py = top; py < bottom; py += 1) {
      const maskRow = (py - top) * maskWidth - left,
        destinationRow = py * canvasWidth;
      for (let px = left; px < right; px += 1) {
        const coverage = mask[maskRow + px];
        if (coverage === 0) continue;
        const sourceAlpha = sourceAlphaByCoverage[coverage];
        if (sourceAlpha <= 0) continue;
        const offset = (destinationRow + px) * 4,
          destinationAlpha = destination[offset + 3] / 255,
          inverse = 1 - sourceAlpha,
          outputAlpha = sourceAlpha + destinationAlpha * inverse;
        if (outputAlpha <= 0) continue;
        destination[offset] = Math.round((red * sourceAlpha + destination[offset] * destinationAlpha * inverse) / outputAlpha);
        destination[offset + 1] = Math.round((green * sourceAlpha + destination[offset + 1] * destinationAlpha * inverse) / outputAlpha);
        destination[offset + 2] = Math.round((blue * sourceAlpha + destination[offset + 2] * destinationAlpha * inverse) / outputAlpha);
        destination[offset + 3] = Math.round(outputAlpha * 255);
        changed = true;
      }
    }
    return { ...radial, changed, mask: radial.data };
  }
  for (let py = top; py < bottom; py += 1) {
    const maskRow = (py - top) * maskWidth - left,
      destinationRow = py * canvasWidth;
    for (let px = left; px < right; px += 1) {
      const coverage = mask[maskRow + px];
      if (coverage === 0) continue;
      const alpha = coverage / 255,
        offset = (destinationRow + px) * 4;
      if (mode === 'destination-out') changed = destinationOut(destination, offset, alpha) || changed;
      else {
        const sx = Math.round(sourceX + px - centreX),
          sy = Math.round(sourceY + py - centreY);
        if (sx < 0 || sy < 0 || sx >= canvasWidth || sy >= canvasHeight) continue;
        const sourceOffset = (sy * canvasWidth + sx) * 4,
          sourceColor: BrushColor = [source![sourceOffset], source![sourceOffset + 1], source![sourceOffset + 2], source![sourceOffset + 3]];
        changed = sourceOver(destination, offset, sourceColor, alpha * healFactor) || changed;
      }
    }
  }
  return { ...radial, changed, mask: radial.data };
}
