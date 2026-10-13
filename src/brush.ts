/**
 * Deterministic radial brush primitives shared by paint, eraser and retouch
 * tools. The primitive works on RGBA byte arrays so pressure, hardness,
 * clipping, alpha compositing and clone masks can be tested without a DOM.
 */
import { bristleCoverage, normalizeBrushBristle } from './brushBristle.ts';
import { wetEdgesOpacity } from './brushWetEdges.ts';

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
} & BrushTipSettings;
export type ResolvedBrushStamp = {
  pressure: number;
  size: number;
  radius: number;
  hardness: number;
  opacity: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  spacing: number;
  angle: number;
  roundness: number;
  flipX: boolean;
  flipY: boolean;
  bristle: number;
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
    (candidate.pressureOpacity === undefined || typeof candidate.pressureOpacity === 'boolean');
}

export function effectiveBrushPressureSettings(value: BrushPressureSettings | undefined): Required<BrushPressureSettings> {
  return {
    pressureSize: value?.pressureSize ?? false,
    pressureOpacity: value?.pressureOpacity ?? false,
  };
}

export function validBrushTipSettings(value: unknown): value is BrushTipSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as BrushTipSettings;
  return (
    (candidate.spacing === undefined ||
      (finite(candidate.spacing) && candidate.spacing >= 1 && candidate.spacing <= 100)) &&
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

/** Match PointerEvent behavior: mouse and missing/zero touch pressure use a deterministic full-pressure fallback. */
export function normalizeBrushPressure(pointerType: string | undefined, pressure: number | undefined): number {
  return (pointerType === 'pen' || pointerType === 'touch') && finite(pressure) && pressure > 0 && pressure <= 1
    ? pressure
    : 1;
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
    size = settings.size * (flags.pressureSize ? pressure : 1),
    opacity = settings.opacity * (flags.pressureOpacity ? pressure : 1);
  return {
    pressure,
    size: Math.max(0.0001, size),
    radius: Math.max(0.00005, size / 2),
    hardness: settings.hardness,
    opacity: clamp(opacity, 0, 1),
    ...flags,
    ...tip,
    bristle,
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
  for (let py = bounds.top; py < bounds.bottom; py += 1) {
    for (let px = bounds.left; px < bounds.right; px += 1) {
      const coverage = brushCoverage(
        px - request.x,
        py - request.y,
        stamp.radius,
        stamp.hardness,
        stamp.roundness,
        stamp.angle,
        stamp.flipX,
        stamp.flipY,
      );
      const filament = bristleCoverage(
        px - request.x,
        py - request.y,
        stamp.radius,
        request.bristle ?? 0,
      );
      const wetEdges = wetEdgesOpacity(
        Math.hypot(px - request.x, py - request.y),
        stamp.radius,
        request.wetEdges ?? 0,
      );
      if (coverage > 0 && filament > 0)
        data[(py - bounds.top) * width + (px - bounds.left)] = Math.round(coverage * filament * wetEdges * scale);
    }
  }
  return { width, height, data, bounds, stamp };
}

function assertPixels(value: ArrayLike<number>, width: number, height: number, label: string, bounds?: StampBounds): void {
  if (value.length !== width * height * 4) throw new Error(`${label} must contain RGBA data for every pixel`);
  if (!bounds) return;
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

/**
 * Apply a radial stamp in-place and return its reusable mask. Clone/heal use
 * source pixels with source-over compositing; callers can also consume the
 * returned mask to build a nondestructive source/mask layer.
 */
export function applyRadialStamp(
  destination: Uint8ClampedArray,
  request: ApplyRadialStampRequest,
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
  for (let py = radial.bounds.top; py < radial.bounds.bottom; py += 1) {
    for (let px = radial.bounds.left; px < radial.bounds.right; px += 1) {
      const alpha = radial.data[(py - radial.bounds.top) * radial.width + (px - radial.bounds.left)] / 255;
      if (alpha <= 0) continue;
      const offset = (py * request.width + px) * 4;
      if (request.mode === 'destination-out') changed = destinationOut(destination, offset, alpha) || changed;
      else if (request.mode === 'source-over') changed = sourceOver(destination, offset, request.color!, alpha) || changed;
      else {
        const sx = Math.round(sourceX + px - request.x),
          sy = Math.round(sourceY + py - request.y);
        if (sx < 0 || sy < 0 || sx >= request.width || sy >= request.height) continue;
        const sourceOffset = (sy * request.width + sx) * 4,
          sourceColor: BrushColor = [request.source![sourceOffset], request.source![sourceOffset + 1], request.source![sourceOffset + 2], request.source![sourceOffset + 3]];
        changed = sourceOver(destination, offset, sourceColor, alpha * healFactor) || changed;
      }
    }
  }
  return { ...radial, changed, mask: radial.data };
}
