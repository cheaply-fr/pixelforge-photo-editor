/**
 * Deterministic Smudge engine with a per-pixel carried paint load.
 *
 * A Smudge stroke "picks up" the pixels under its first dab into a
 * tip-sized carried buffer (the paint load) and drags it along the stroke.
 * Each dab deposits the carried paint onto the layer by Strength × tip
 * coverage, then picks the result back up into the load, so colour, texture
 * and alpha are smeared and fade with distance. At Strength 100% the load is
 * never diluted inside the tip and is dragged almost unchanged.
 *
 * - Finger Painting starts the load as the foreground colour (fully opaque).
 * - Sample All Layers reads (and picks up from) a composite snapshot of the
 *   visible layers while depositing onto the active layer, so smudging on an
 *   empty layer above an image works. The composite is smudged virtually with
 *   the same deposits, so later dabs pick up what the user sees.
 * - Modes (Normal, Darken, Lighten, Hue, Saturation, Color, Luminosity) decide
 *   how the smudged colour is written over the existing pixel.
 * - Tip angle/roundness/flip, bristle filaments, paper texture, pressure size
 *   and strength, Scatter/Count/size and angle jitter and Paint Symmetry copies
 *   are resolved per dab. Every random choice is a hash of the stroke point,
 *   so a replayed stroke yields identical pixels.
 *
 * Distance, not dab count, sets how far paint travels: the load moves with
 * the tip, so canvas paint entering the tip's leading edge reaches its
 * trailing edge after about one diameter ÷ (1 − Strength) of travel whatever
 * the dab spacing (each dab exchanges (1 − Strength) of the load with the
 * canvas the tip has just moved onto). Dense and sparse spacing therefore
 * smear about the same distance (see tests/smudge.test.mjs). The engine is
 * DOM-free and works on windows of a layer (`RasterView`): results only depend
 * on pixels under the dabs, so a window that contains every dab gives the
 * same bytes as the whole layer. This is a bounded local approximation of a
 * smudge tool, not a claim of parity with any other application.
 */

import { BRUSH_MAX_SIZE, BRUSH_PEN_LIFT_PRESSURE, normalizeBrushPressure } from './brush.ts';
import { mapBrushPressure, normalizeBrushPressureCurve, type BrushPressureCurve } from './brushPressure.ts';
import {
  brushDabsAt,
  DEFAULT_BRUSH_DYNAMICS,
  normalizeBrushScatter,
  brushScatterRadius,
  wrapBrushAngle,
  type BrushDynamics,
} from './brushDynamics.ts';
import { bristleCoverage, normalizeBrushBristle } from './brushBristle.ts';
import { brushTextureOpacity, normalizeBrushTexture } from './brushTexture.ts';
import { blendRgb, type LayerBlendMode } from './blendModes.ts';
import { symmetryDabCopies, type SymmetryAffine } from './paintSymmetry.ts';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const SMUDGE_MODES = ['normal', 'darken', 'lighten', 'hue', 'saturation', 'color', 'luminosity'] as const;
export type SmudgeMode = (typeof SMUDGE_MODES)[number];
export const SMUDGE_MODE_LABELS: Record<SmudgeMode, string> = {
  normal: 'Normal',
  darken: 'Darken',
  lighten: 'Lighten',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Color',
  luminosity: 'Luminosity',
};

export const SMUDGE_STRENGTH_MIN = 0;
export const SMUDGE_STRENGTH_MAX = 100;
export const SMUDGE_STRENGTH_DEFAULT = 50;

/** Persisted Smudge options (tip shape, size and dynamics are the shared brush settings). */
export type SmudgeSettings = {
  /** 0–100%: how much carried paint each dab deposits (and how slowly it fades). */
  strength: number;
  mode: SmudgeMode;
  /** Start each stroke with the foreground colour instead of the pixels under it. */
  fingerPainting: boolean;
  /** Sample the visible composite instead of only the active layer. */
  sampleAllLayers: boolean;
  /** With Sample All Layers, leave adjustment layers out of the sampled composite. */
  ignoreAdjustments: boolean;
  /** Pen/touch pressure scales Strength. */
  pressureStrength: boolean;
};

export const DEFAULT_SMUDGE_SETTINGS: Readonly<SmudgeSettings> = Object.freeze({
  strength: SMUDGE_STRENGTH_DEFAULT,
  mode: 'normal',
  fingerPainting: false,
  sampleAllLayers: false,
  ignoreAdjustments: false,
  pressureStrength: false,
});

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const optionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean';

export function validSmudgeMode(value: unknown): value is SmudgeMode {
  return typeof value === 'string' && (SMUDGE_MODES as readonly string[]).includes(value);
}

/**
 * Validate persisted Smudge settings. Every key is optional so drafts written
 * before a control existed stay valid; present keys must be in range.
 */
export function validSmudgeSettings(value: unknown): value is Partial<SmudgeSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<Record<keyof SmudgeSettings, unknown>>;
  return (
    (candidate.strength === undefined ||
      (finite(candidate.strength) && candidate.strength >= SMUDGE_STRENGTH_MIN && candidate.strength <= SMUDGE_STRENGTH_MAX)) &&
    (candidate.mode === undefined || validSmudgeMode(candidate.mode)) &&
    optionalBoolean(candidate.fingerPainting) &&
    optionalBoolean(candidate.sampleAllLayers) &&
    optionalBoolean(candidate.ignoreAdjustments) &&
    optionalBoolean(candidate.pressureStrength)
  );
}

/**
 * Complete, bounded Smudge settings. `legacyStrength` migrates documents
 * saved before Strength existed, when the Smudge "Flow" slider was the shared
 * brush opacity; it is only used when `value` carries no strength.
 */
export function normalizeSmudgeSettings(value: unknown, legacyStrength?: unknown): SmudgeSettings {
  const candidate = (value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}) as Partial<Record<keyof SmudgeSettings, unknown>>;
  const strength = finite(candidate.strength)
    ? candidate.strength
    : finite(legacyStrength)
      ? legacyStrength
      : SMUDGE_STRENGTH_DEFAULT;
  const flag = (entry: unknown, fallback: boolean) => (typeof entry === 'boolean' ? entry : fallback);
  return {
    strength: clamp(Math.round(strength), SMUDGE_STRENGTH_MIN, SMUDGE_STRENGTH_MAX),
    mode: validSmudgeMode(candidate.mode) ? candidate.mode : 'normal',
    fingerPainting: flag(candidate.fingerPainting, false),
    sampleAllLayers: flag(candidate.sampleAllLayers, false),
    ignoreAdjustments: flag(candidate.ignoreAdjustments, false),
    pressureStrength: flag(candidate.pressureStrength, false),
  };
}

// ---------------------------------------------------------------------------
// Stroke planning
// ---------------------------------------------------------------------------

/** Dab spacing used by Smudge, as a percentage of the diameter. */
export const SMUDGE_SPACING_DEFAULT = 10;
export const SMUDGE_SPACING_MIN = 2;
export const SMUDGE_SPACING_MAX = 50;
/** Carried-buffer resolution bound (cells per side) for one copy. */
const CARRY_MAX_SIDE = 512;
/** Total carried cells across symmetry copies (keeps memory bounded). */
const CARRY_MAX_CELLS = 2 * 1024 * 1024;

export type SmudgePoint = {
  x: number;
  y: number;
  pressure?: number;
  pointerType?: string;
  /** Simulated pressure (Stroke Path): diameter multiplier. */
  sizeScale?: number;
  /** Simulated pressure (Stroke Path): strength multiplier. */
  strengthScale?: number;
};

export type SmudgeTip = {
  size: number;
  hardness: number;
  angle?: number;
  roundness?: number;
  flipX?: boolean;
  flipY?: boolean;
  scatter?: number;
  dynamics?: BrushDynamics;
  pressureSize?: boolean;
  pressureStrength?: boolean;
  pressureCurve?: BrushPressureCurve;
};

export type SmudgeDab = {
  x: number;
  y: number;
  size: number;
  hardness: number;
  angle: number;
  roundness: number;
  flipX: boolean;
  flipY: boolean;
  /** Multiplier for Strength from pressure and jitter, [0, 1]. */
  strength: number;
  /** Symmetry copy index; each copy carries its own paint load. */
  copy: number;
};

export type SmudgeStroke = {
  /** Largest dab diameter (the carried buffer covers it). */
  readonly size: number;
  /** Distance between dab centres in layer pixels. */
  readonly interval: number;
  /** Half extent of the carried buffer in pixels (offsets -half…half). */
  readonly half: number;
  /** Pixels per carried cell along each axis. */
  readonly cell: number;
  /** Carried cells per side. */
  readonly side: number;
  /** Premultiplied 0..1 RGBA per cell, one buffer per symmetry copy. */
  carries: Array<Float32Array | undefined>;
  started: boolean;
  /** Distance travelled since the last dab. */
  travelled: number;
};

/** Start a stroke. `size` is the largest diameter the stroke may use. */
export function createSmudgeStroke(options: { size: number; spacing?: number; copies?: number }): SmudgeStroke {
  if (!finite(options.size) || options.size < 1 || options.size > BRUSH_MAX_SIZE)
    throw new Error('Smudge brush size must be between 1 and 10,000');
  const spacing = clamp(finite(options.spacing) ? options.spacing : SMUDGE_SPACING_DEFAULT, SMUDGE_SPACING_MIN, SMUDGE_SPACING_MAX),
    copies = Math.max(1, Math.min(128, Math.round(finite(options.copies) ? options.copies : 1))),
    interval = Math.max(1, (options.size * spacing) / 100),
    half = Math.ceil(options.size / 2) + 1,
    pixels = half * 2 + 1,
    maxSide = Math.max(16, Math.min(CARRY_MAX_SIDE, Math.floor(Math.sqrt(CARRY_MAX_CELLS / copies)))),
    cell = Math.max(1, Math.ceil(pixels / maxSide));
  return {
    size: options.size,
    interval,
    half,
    cell,
    side: Math.ceil(pixels / cell),
    carries: Array.from({ length: copies }, () => undefined),
    started: false,
    travelled: 0,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Advance the stroke from `from` to `to` and return the dabs to apply.
 * The first call also places a dab at `from` (it loads the paint).
 */
export function planSmudgeSegment(
  stroke: SmudgeStroke,
  from: SmudgePoint,
  to: SmudgePoint,
  tip: SmudgeTip,
  symmetry?: readonly SymmetryAffine[],
): SmudgeDab[] {
  for (const value of [from.x, from.y, to.x, to.y])
    if (!finite(value)) throw new Error('Smudge stroke points are invalid');
  if (!finite(tip.size) || tip.size < 1 || tip.size > BRUSH_MAX_SIZE)
    throw new Error('Smudge brush size must be between 1 and 10,000');
  if (!finite(tip.hardness) || tip.hardness < 0 || tip.hardness > 100)
    throw new Error('Smudge brush hardness must be between 0 and 100');
  const distance = Math.hypot(to.x - from.x, to.y - from.y),
    positions: number[] = [];
  if (!stroke.started) {
    stroke.started = true;
    stroke.travelled = 0;
    positions.push(0);
  }
  if (distance > 0) {
    let next = stroke.interval - stroke.travelled;
    while (next <= distance + 1e-9) {
      positions.push(next / distance);
      next += stroke.interval;
    }
    stroke.travelled = distance - (next - stroke.interval);
  }
  const dynamics = tip.dynamics ?? DEFAULT_BRUSH_DYNAMICS,
    curve = normalizeBrushPressureCurve(tip.pressureCurve),
    scatter = normalizeBrushScatter(tip.scatter ?? 0),
    direction = { x: to.x - from.x, y: to.y - from.y },
    dabs: SmudgeDab[] = [],
    baseAngle = finite(tip.angle) ? clamp(tip.angle, -180, 180) : 0,
    roundness = finite(tip.roundness) ? clamp(tip.roundness, 1, 100) : 100,
    flipX = tip.flipX === true,
    flipY = tip.flipY === true,
    copies = symmetry && symmetry.length > 1 ? symmetry : undefined;
  for (const t of positions) {
    const x = lerp(from.x, to.x, t),
      y = lerp(from.y, to.y, t),
      rawPressure = finite(from.pressure) && finite(to.pressure)
        ? lerp(from.pressure, to.pressure, t)
        : (finite(to.pressure) ? to.pressure : from.pressure),
      pressure = normalizeBrushPressure(t === 0 ? from.pointerType ?? to.pointerType : to.pointerType ?? from.pointerType, rawPressure),
      mapped = (tip.pressureSize || tip.pressureStrength) ? mapBrushPressure(pressure, curve) : 1;
    // A pen lift paints nothing when a pressure mapping is enabled.
    if ((tip.pressureSize || tip.pressureStrength) && pressure <= BRUSH_PEN_LIFT_PRESSURE) continue;
    const sizeScale = (tip.pressureSize ? mapped : 1) * lerp(from.sizeScale ?? 1, to.sizeScale ?? 1, t),
      strengthScale = (tip.pressureStrength ? mapped : 1) * lerp(from.strengthScale ?? 1, to.strengthScale ?? 1, t),
      size = clamp(tip.size * sizeScale, 1, stroke.size);
    if (!(strengthScale > 0)) continue;
    for (const dab of brushDabsAt({ x, y }, size, scatter, dynamics, direction)) {
      const dabSize = clamp(size * dab.sizeScale, 1, stroke.size),
        angle = dab.angleOffset === 0 ? baseAngle : wrapBrushAngle(baseAngle + dab.angleOffset),
        strength = clamp(strengthScale * dab.opacityScale, 0, 1);
      if (!copies) {
        dabs.push({ x: dab.x, y: dab.y, size: dabSize, hardness: tip.hardness, angle, roundness, flipX, flipY, strength, copy: 0 });
        continue;
      }
      symmetryDabCopies(copies, { x: dab.x, y: dab.y, angle, flipX, flipY }).forEach((copy, index) =>
        dabs.push({
          x: copy.x,
          y: copy.y,
          size: dabSize,
          hardness: tip.hardness,
          angle: copy.angle,
          roundness,
          flipX: copy.flipX,
          flipY: copy.flipY,
          strength,
          copy: Math.min(index, stroke.carries.length - 1),
        }));
    }
  }
  return dabs;
}

/**
 * Layer pixels a planned dab can read or change, beyond its centre: the
 * carried buffer (loaded around the first dab) spans the stroke's largest
 * diameter, so this does not shrink with pressure or size jitter.
 */
export function smudgeDabReach(stroke: Pick<SmudgeStroke, 'half'>): number {
  return stroke.half + 2;
}

/** Window reach for a segment before it is planned (scatter included). */
export function smudgeSegmentReach(size: number, scatter = 0): number {
  const safe = finite(size) ? Math.max(1, size) : 1;
  return safe / 2 + brushScatterRadius(safe, scatter) + 2;
}

// ---------------------------------------------------------------------------
// Pixel kernel
// ---------------------------------------------------------------------------

/** A rectangle of RGBA pixels positioned at (x, y) in layer pixel space. */
export type RasterView = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  x: number;
  y: number;
};

export type SmudgeApplyOptions = {
  /** Strength, 0..1. */
  strength: number;
  mode?: SmudgeMode;
  fingerPainting?: boolean;
  /** Foreground RGB (0..255) for Finger Painting. */
  color?: readonly [number, number, number] | readonly [number, number, number, number];
  /** Selection alpha (0..255) aligned with the destination view. */
  selectionMask?: ArrayLike<number>;
  /**
   * Separate pixels to sample and pick up from (Sample All Layers). The
   * engine also deposits into it, so it stays a smudged view of the
   * composite. Omitted: the destination is sampled.
   */
  sample?: RasterView;
  /** Bristle filaments 0–100 (streaks in the carried paint). */
  bristle?: number;
  /** Paper texture 0–100, fixed to layer pixels. */
  texture?: number;
};

function assertView(view: RasterView, label: string): void {
  if (
    !view ||
    !(view.data instanceof Uint8ClampedArray) ||
    !Number.isInteger(view.width) ||
    !Number.isInteger(view.height) ||
    view.width < 0 ||
    view.height < 0 ||
    view.data.length !== view.width * view.height * 4 ||
    !finite(view.x) ||
    !finite(view.y)
  )
    throw new Error(`${label} must contain RGBA data for every pixel`);
}

const BLEND_OUT: [number, number, number] = [0, 0, 0];

/**
 * Deposit premultiplied paint (cr, cg, cb, ca) at `offset` of `data` by
 * `amount`, writing the mode result over the existing pixel. Returns whether
 * the bytes changed.
 */
function deposit(
  data: Uint8ClampedArray,
  offset: number,
  cr: number,
  cg: number,
  cb: number,
  ca: number,
  amount: number,
  mode: SmudgeMode,
): boolean {
  const da = data[offset + 3] / 255,
    dr = data[offset] / 255,
    dg = data[offset + 1] / 255,
    db = data[offset + 2] / 255,
    ra = da + (ca - da) * amount;
  if (ra * 255 < 0.5) {
    if (data[offset + 3] === 0) return false;
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
    return true;
  }
  let ur = (dr * da + (cr - dr * da) * amount) / ra,
    ug = (dg * da + (cg - dg * da) * amount) / ra,
    ub = (db * da + (cb - db * da) * amount) / ra;
  if (mode !== 'normal' && da > 0) {
    blendRgb(mode as LayerBlendMode, dr, dg, db, clamp(ur, 0, 1), clamp(ug, 0, 1), clamp(ub, 0, 1), BLEND_OUT);
    // Over transparent pixels the mode has no backdrop, so the smudged colour
    // shows through in proportion to the missing backdrop alpha.
    ur += (BLEND_OUT[0] - ur) * da;
    ug += (BLEND_OUT[1] - ug) * da;
    ub += (BLEND_OUT[2] - ub) * da;
  }
  const r = Math.round(clamp(ur, 0, 1) * 255),
    g = Math.round(clamp(ug, 0, 1) * 255),
    b = Math.round(clamp(ub, 0, 1) * 255),
    a = Math.round(clamp(ra, 0, 1) * 255);
  if (r === data[offset] && g === data[offset + 1] && b === data[offset + 2] && a === data[offset + 3]) return false;
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = a;
  return true;
}

/** Load a fresh carried buffer from the sample pixels (or the foreground colour). */
function loadCarry(
  stroke: SmudgeStroke,
  centreX: number,
  centreY: number,
  sample: RasterView,
  fingerColor: readonly number[] | undefined,
): Float32Array {
  const carry = new Float32Array(stroke.side * stroke.side * 4);
  if (fingerColor) {
    const r = clamp(fingerColor[0] ?? 0, 0, 255) / 255,
      g = clamp(fingerColor[1] ?? 0, 0, 255) / 255,
      b = clamp(fingerColor[2] ?? 0, 0, 255) / 255;
    for (let index = 0; index < carry.length; index += 4) {
      carry[index] = r;
      carry[index + 1] = g;
      carry[index + 2] = b;
      carry[index + 3] = 1;
    }
    return carry;
  }
  const centre = Math.floor(stroke.cell / 2),
    span = stroke.half * 2;
  for (let row = 0; row < stroke.side; row += 1) {
    const py = centreY - stroke.half + Math.min(span, row * stroke.cell + centre) - sample.y;
    if (py < 0 || py >= sample.height) continue;
    for (let column = 0; column < stroke.side; column += 1) {
      const px = centreX - stroke.half + Math.min(span, column * stroke.cell + centre) - sample.x;
      if (px < 0 || px >= sample.width) continue;
      const offset = (py * sample.width + px) * 4,
        alpha = sample.data[offset + 3] / 255,
        target = (row * stroke.side + column) * 4;
      carry[target] = (sample.data[offset] / 255) * alpha;
      carry[target + 1] = (sample.data[offset + 1] / 255) * alpha;
      carry[target + 2] = (sample.data[offset + 2] / 255) * alpha;
      carry[target + 3] = alpha;
    }
  }
  return carry;
}

/**
 * Apply planned dabs to `destination` in place, updating the stroke's carried
 * paint. Returns whether any destination byte changed.
 */
export function applySmudgeDabs(
  stroke: SmudgeStroke,
  dabs: readonly SmudgeDab[],
  destination: RasterView,
  options: SmudgeApplyOptions,
): boolean {
  assertView(destination, 'Destination');
  const sample = options.sample ?? destination,
    separate = sample !== destination;
  if (separate) assertView(sample, 'Sample');
  if (!finite(options.strength) || options.strength < 0 || options.strength > 1)
    throw new Error('Smudge strength must be between 0 and 1');
  const mode = options.mode ?? 'normal';
  if (!validSmudgeMode(mode)) throw new Error('Smudge mode is invalid');
  const selection = options.selectionMask;
  if (selection && selection.length !== destination.width * destination.height)
    throw new Error('Selection mask must contain one alpha value per pixel');
  const bristle = normalizeBrushBristle(options.bristle ?? 0),
    texture = normalizeBrushTexture(options.texture ?? 0),
    fingerColor = options.fingerPainting ? options.color ?? [0, 0, 0] : undefined,
    cellArea = stroke.cell * stroke.cell,
    delta = stroke.cell > 1 ? new Float32Array(stroke.side * stroke.side * 4) : undefined;
  let changed = false;

  for (const dab of dabs) {
    const anchorX = Math.round(dab.x),
      anchorY = Math.round(dab.y);
    let carry = stroke.carries[dab.copy];
    // The first dab of each copy loads the paint. Without Finger Painting the
    // load equals the pixels under it, so that dab deposits nothing.
    const loading = !carry;
    if (!carry) carry = stroke.carries[dab.copy] = loadCarry(stroke, anchorX, anchorY, sample, fingerColor);
    if (loading && !fingerColor) continue;
    const radius = Math.max(0.5, dab.size / 2),
      strength = clamp(options.strength * dab.strength, 0, 1),
      radians = (dab.angle * Math.PI) / 180,
      cos = Math.cos(radians),
      sin = Math.sin(radians),
      verticalScale = dab.roundness / 100,
      hard = dab.hardness >= 100,
      softRadius = radius * (1 - dab.hardness / 100),
      plateau = radius - softRadius,
      softDivisor = Math.max(0.0000001, softRadius),
      left = Math.max(destination.x, Math.floor(dab.x - radius), anchorX - stroke.half),
      top = Math.max(destination.y, Math.floor(dab.y - radius), anchorY - stroke.half),
      right = Math.min(destination.x + destination.width, Math.floor(dab.x + radius) + 1, anchorX + stroke.half + 1),
      bottom = Math.min(destination.y + destination.height, Math.floor(dab.y + radius) + 1, anchorY + stroke.half + 1);
    if (right <= left || bottom <= top) continue;
    if (delta) delta.fill(0);
    for (let py = top; py < bottom; py += 1) {
      const dy = py - dab.y,
        cellRow = Math.floor((py - anchorY + stroke.half) / stroke.cell) * stroke.side,
        destinationRow = (py - destination.y) * destination.width - destination.x,
        sampleY = py - sample.y,
        sampleRow = sampleY * sample.width - sample.x,
        sampleRowValid = sampleY >= 0 && sampleY < sample.height;
      for (let px = left; px < right; px += 1) {
        const dx = px - dab.x;
        let localX = dx * cos + dy * sin,
          localY = -dx * sin + dy * cos;
        if (dab.flipX) localX = -localX;
        if (dab.flipY) localY = -localY;
        const scaledY = localY / verticalScale,
          distance = Math.sqrt(localX * localX + scaledY * scaledY);
        if (distance > radius) continue;
        let coverage = hard || distance <= plateau ? 1 : clamp((radius - distance) / softDivisor, 0, 1);
        if (bristle !== 0) coverage *= bristleCoverage(localX, localY, radius, bristle);
        if (coverage <= 0) continue;
        const cellIndex = (cellRow + Math.floor((px - anchorX + stroke.half) / stroke.cell)) * 4,
          cr = carry[cellIndex],
          cg = carry[cellIndex + 1],
          cb = carry[cellIndex + 2],
          ca = carry[cellIndex + 3],
          pixel = destinationRow + px;
        let amount = coverage * strength;
        if (amount > 0 && texture !== 0) amount *= brushTextureOpacity(px, py, texture);
        if (amount > 0 && selection) amount *= selection[pixel] / 255;
        if (amount > 0) {
          if (deposit(destination.data, pixel * 4, cr, cg, cb, ca, amount, mode)) changed = true;
          if (separate && sampleRowValid && px >= sample.x && px < sample.x + sample.width)
            deposit(sample.data, (sampleRow + px) * 4, cr, cg, cb, ca, amount, mode);
        }
        // Pick the result back up into the load (outside the sample: nothing to pick up).
        if (!sampleRowValid || px < sample.x || px >= sample.x + sample.width) continue;
        const offset = (sampleRow + px) * 4,
          alpha = sample.data[offset + 3] / 255,
          sr = (sample.data[offset] / 255) * alpha,
          sg = (sample.data[offset + 1] / 255) * alpha,
          sb = (sample.data[offset + 2] / 255) * alpha;
        if (delta) {
          const weight = coverage / cellArea;
          delta[cellIndex] += (sr - cr) * weight;
          delta[cellIndex + 1] += (sg - cg) * weight;
          delta[cellIndex + 2] += (sb - cb) * weight;
          delta[cellIndex + 3] += (alpha - ca) * weight;
        } else {
          carry[cellIndex] = cr + (sr - cr) * coverage;
          carry[cellIndex + 1] = cg + (sg - cg) * coverage;
          carry[cellIndex + 2] = cb + (sb - cb) * coverage;
          carry[cellIndex + 3] = ca + (alpha - ca) * coverage;
        }
      }
    }
    if (delta) for (let index = 0; index < carry.length; index += 1) carry[index] += delta[index];
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Convenience: a whole stroke over full-layer buffers
// ---------------------------------------------------------------------------

export type SmudgeStrokeOptions = SmudgeTip &
  Omit<SmudgeApplyOptions, 'sample' | 'selectionMask'> & {
    width: number;
    height: number;
    spacing?: number;
    selectionMask?: ArrayLike<number>;
    /** Full-size composite to sample (Sample All Layers). */
    sample?: ArrayLike<number>;
    symmetry?: readonly SymmetryAffine[];
  };

export type SmudgeResult = {
  /** Fresh RGBA bytes; the inputs are never mutated. */
  pixels: Uint8ClampedArray;
  changed: boolean;
};

/**
 * Smudge a polyline over a full raster and return fresh pixels. The input
 * buffers are not mutated. Used by Stroke Path and the pure tests.
 */
export function applySmudgeStroke(
  pixels: ArrayLike<number>,
  points: readonly SmudgePoint[],
  options: SmudgeStrokeOptions,
): SmudgeResult {
  const { width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    throw new Error('Smudge canvas dimensions are invalid');
  if (!pixels || pixels.length !== width * height * 4)
    throw new Error('Destination must contain RGBA data for every pixel');
  const destination: RasterView = { data: Uint8ClampedArray.from(pixels), width, height, x: 0, y: 0 };
  let sample: RasterView | undefined;
  if (options.sample) {
    if (options.sample.length !== width * height * 4) throw new Error('Sample must contain RGBA data for every pixel');
    sample = { data: Uint8ClampedArray.from(options.sample), width, height, x: 0, y: 0 };
  }
  const stroke = createSmudgeStroke({
    size: options.size,
    spacing: options.spacing,
    copies: options.symmetry?.length ?? 1,
  });
  let changed = false;
  for (let index = 0; index < points.length; index += 1) {
    const from = points[Math.max(0, index - 1)], to = points[index];
    const dabs = planSmudgeSegment(stroke, from, to, options, options.symmetry);
    if (dabs.length)
      changed = applySmudgeDabs(stroke, dabs, destination, {
        ...options,
        sample,
        selectionMask: options.selectionMask,
      }) || changed;
  }
  return { pixels: destination.data, changed };
}

/** Alias for callers that use the tool name as the operation name. */
export const smudgeStroke = applySmudgeStroke;
