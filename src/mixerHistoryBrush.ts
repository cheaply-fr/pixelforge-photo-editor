import { brushCoverage, effectiveBrushTipSettings, resolveBrushStamp, validBrushTipSettings, type BrushTipSettings } from './brush.ts';

/**
 * Bounded, deterministic controls for the Mixer Brush.  PixelForge keeps the
 * source immutable and models a stroke as a colour mix at the touched pixels;
 * full Photoshop wet-media dynamics are intentionally outside this contract.
 */
export type MixerBrushSettings = BrushTipSettings & {
  size: number;
  hardness: number;
  flow: number;
  wet: number;
  load: number;
  mix: number;
};

/** History Brush restores an earlier document raster through a local brush. */
export type HistoryBrushSettings = BrushTipSettings & {
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
};

/** Art History uses the selected undo snapshot but lays down bounded,
 * source-safe painterly dabs instead of restoring a literal pixel patch. */
export type ArtHistoryBrushSettings = BrushTipSettings & {
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  /** Neighbourhood radius used to form each deterministic dab colour. */
  style: number;
  /** Fidelity to the historical source colour, from 0 to 100. */
  fidelity: number;
};

export type BrushStrokePoint = { x: number; y: number; pressure?: number };

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const validDimensions = (width: number, height: number) =>
  Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width * height <= 16_000_000;
const validPixels = (value: ArrayLike<number>, width: number, height: number) => value.length === width * height * 4;

export const DEFAULT_MIXER_BRUSH: MixerBrushSettings = {
  size: 36,
  hardness: 40,
  flow: 65,
  wet: 45,
  load: 55,
  mix: 50,
  spacing: 25,
  angle: 0,
  roundness: 100,
  flipX: false,
  flipY: false,
};

export const DEFAULT_HISTORY_BRUSH: HistoryBrushSettings = {
  size: 36,
  hardness: 65,
  opacity: 100,
  flow: 75,
  spacing: 25,
  angle: 0,
  roundness: 100,
  flipX: false,
  flipY: false,
};

export const DEFAULT_ART_HISTORY_BRUSH: ArtHistoryBrushSettings = {
  size: 36,
  hardness: 55,
  opacity: 100,
  flow: 65,
  style: 4,
  fidelity: 72,
  spacing: 25,
  angle: 0,
  roundness: 100,
  flipX: false,
  flipY: false,
};

/** At most one million candidate pixels per pure render request. */
export const MAX_ART_HISTORY_BRUSH_WORK = 1_000_000;

/** Deterministic spacing for pointer segments so fast drags leave no dab gaps. */
export function interpolateArtHistoryPoints(from: BrushStrokePoint, to: BrushStrokePoint, spacing: number): BrushStrokePoint[] {
  if (!finite(spacing) || spacing <= 0 || !finite(from.x) || !finite(from.y) || !finite(to.x) || !finite(to.y))
    throw new Error('Art History Brush interpolation is invalid');
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / spacing));
  return Array.from({ length: steps }, (_, index) => {
    const ratio = (index + 1) / steps;
    return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, pressure: to.pressure };
  });
}

export function validMixerBrushSettings(value: unknown): value is MixerBrushSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<MixerBrushSettings>;
  return finite(v.size) && v.size >= 1 && v.size <= 10000 &&
    finite(v.hardness) && v.hardness >= 0 && v.hardness <= 100 &&
    finite(v.flow) && v.flow >= 1 && v.flow <= 100 &&
    finite(v.wet) && v.wet >= 0 && v.wet <= 100 &&
    finite(v.load) && v.load >= 0 && v.load <= 100 &&
    finite(v.mix) && v.mix >= 0 && v.mix <= 100 &&
    validBrushTipSettings(v);
}

export function validHistoryBrushSettings(value: unknown): value is HistoryBrushSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<HistoryBrushSettings>;
  return finite(v.size) && v.size >= 1 && v.size <= 10000 &&
    finite(v.hardness) && v.hardness >= 0 && v.hardness <= 100 &&
    finite(v.opacity) && v.opacity >= 0 && v.opacity <= 100 &&
    finite(v.flow) && v.flow >= 1 && v.flow <= 100 &&
    validBrushTipSettings(v);
}

export function validArtHistoryBrushSettings(value: unknown): value is ArtHistoryBrushSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<ArtHistoryBrushSettings>;
  return finite(v.size) && v.size >= 1 && v.size <= 10000 &&
    finite(v.hardness) && v.hardness >= 0 && v.hardness <= 100 &&
    finite(v.opacity) && v.opacity >= 0 && v.opacity <= 100 &&
    finite(v.flow) && v.flow >= 1 && v.flow <= 100 &&
    Number.isInteger(v.style) && v.style !== undefined && v.style >= 1 && v.style <= 24 &&
    finite(v.fidelity) && v.fidelity >= 0 && v.fidelity <= 100 &&
    validBrushTipSettings(v);
}

export function effectiveMixerBrush(value: Partial<MixerBrushSettings> | undefined): MixerBrushSettings {
  const next = { ...DEFAULT_MIXER_BRUSH, ...value };
  return {
    ...next,
    size: clamp(Number(next.size) || DEFAULT_MIXER_BRUSH.size, 1, 10000),
    hardness: clamp(Number(next.hardness) || 0, 0, 100),
    flow: clamp(Number(next.flow) || DEFAULT_MIXER_BRUSH.flow, 1, 100),
    wet: clamp(Number(next.wet) || 0, 0, 100),
    load: clamp(Number(next.load) || 0, 0, 100),
    mix: clamp(Number(next.mix) || 0, 0, 100),
    ...effectiveBrushTipSettings(next),
  };
}

export function effectiveHistoryBrush(value: Partial<HistoryBrushSettings> | undefined): HistoryBrushSettings {
  const next = { ...DEFAULT_HISTORY_BRUSH, ...value };
  return {
    ...next,
    size: clamp(Number(next.size) || DEFAULT_HISTORY_BRUSH.size, 1, 10000),
    hardness: clamp(Number(next.hardness) || 0, 0, 100),
    opacity: clamp(Number(next.opacity) || 0, 0, 100),
    flow: clamp(Number(next.flow) || DEFAULT_HISTORY_BRUSH.flow, 1, 100),
    ...effectiveBrushTipSettings(next),
  };
}

export function effectiveArtHistoryBrush(value: Partial<ArtHistoryBrushSettings> | undefined): ArtHistoryBrushSettings {
  const next = { ...DEFAULT_ART_HISTORY_BRUSH, ...value };
  return {
    ...next,
    size: clamp(Number(next.size) || DEFAULT_ART_HISTORY_BRUSH.size, 1, 10000),
    hardness: clamp(Number(next.hardness) || 0, 0, 100),
    opacity: clamp(Number(next.opacity) || 0, 0, 100),
    flow: clamp(Number(next.flow) || DEFAULT_ART_HISTORY_BRUSH.flow, 1, 100),
    style: Math.round(clamp(Number(next.style) || DEFAULT_ART_HISTORY_BRUSH.style, 1, 24)),
    fidelity: clamp(Number(next.fidelity) || 0, 0, 100),
    ...effectiveBrushTipSettings(next),
  };
}

function assertInput(destination: ArrayLike<number>, source: ArrayLike<number>, width: number, height: number, points: readonly BrushStrokePoint[]) {
  if (!validDimensions(width, height)) throw new Error('Brush canvas dimensions are invalid');
  if (!validPixels(destination, width, height) || !validPixels(source, width, height)) throw new Error('Brush source pixels are invalid');
  if (!Array.isArray(points) || points.length > 2048 || points.some((p) => !p || !finite(p.x) || !finite(p.y))) throw new Error('Brush stroke points are invalid');
}

function coverageAt(x: number, y: number, point: BrushStrokePoint, settings: MixerBrushSettings | HistoryBrushSettings): number {
  const pressure = finite(point.pressure) ? clamp(point.pressure!, 0, 1) : 1;
  const stamp = resolveBrushStamp({
    size: settings.size,
    hardness: settings.hardness,
    opacity: 1,
    pressure,
    pressureSize: false,
    pressureOpacity: false,
    ...effectiveBrushTipSettings(settings),
  });
  return brushCoverage(x - point.x, y - point.y, stamp.radius, stamp.hardness, stamp.roundness, stamp.angle, stamp.flipX, stamp.flipY);
}

function alphaMix(destination: Uint8ClampedArray, source: ArrayLike<number>, offset: number, amount: number, preserveSourceTransparency: boolean) {
  const sa = source[offset + 3] / 255;
  if (preserveSourceTransparency && sa <= 0) return false;
  const da = destination[offset + 3] / 255;
  const outputAlpha = clamp(da + (sa - da) * amount, 0, 1);
  let changed = false;
  for (let channel = 0; channel < 3; channel += 1) {
    const before = destination[offset + channel];
    const sourceColour = source[offset + channel];
    destination[offset + channel] = Math.round(before + (sourceColour - before) * amount);
    changed = changed || before !== destination[offset + channel];
  }
  const beforeAlpha = destination[offset + 3];
  destination[offset + 3] = Math.round(outputAlpha * 255);
  return changed || beforeAlpha !== destination[offset + 3];
}

function applyStroke(destinationInput: Uint8ClampedArray, source: ArrayLike<number>, width: number, height: number, points: readonly BrushStrokePoint[], size: number, hardness: number, intensity: (coverage: number, point: BrushStrokePoint) => number, selectionMask?: ArrayLike<number>): Uint8ClampedArray {
  const destination = new Uint8ClampedArray(destinationInput);
  if (!points.length) return destination;
  const radius = size / 2;
  for (const point of points) {
    const left = Math.max(0, Math.floor(point.x - radius));
    const top = Math.max(0, Math.floor(point.y - radius));
    const right = Math.min(width, Math.floor(point.x + radius) + 1);
    const bottom = Math.min(height, Math.floor(point.y + radius) + 1);
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const index = y * width + x;
      const selection = selectionMask ? clamp(selectionMask[index] / 255, 0, 1) : 1;
      if (!selection) continue;
      const amount = clamp(intensity(coverageAt(x, y, point, { size, hardness } as MixerBrushSettings), point) * selection, 0, 1);
      if (amount <= 0) continue;
      alphaMix(destination, source, index * 4, amount, true);
    }
  }
  return destination;
}

/** Apply one immutable-source Mixer Brush stroke. The input destination is never mutated. */
export function applyMixerBrushPixels(destination: Uint8ClampedArray, source: ArrayLike<number>, width: number, height: number, points: readonly BrushStrokePoint[], settings: MixerBrushSettings, selectionMask?: ArrayLike<number>): Uint8ClampedArray {
  assertInput(destination, source, width, height, points);
  if (!validMixerBrushSettings(settings)) throw new Error('Mixer Brush settings are invalid');
  const wet = settings.wet / 100;
  const load = settings.load / 100;
  const mix = settings.mix / 100;
  const flow = settings.flow / 100;
  return applyStroke(destination, source, width, height, points, settings.size, settings.hardness, (coverage) => coverage * flow * mix * (0.25 + 0.75 * wet * load), selectionMask);
}

/** Restore a historical source through an opacity/flow-controlled brush. */
export function applyHistoryBrushPixels(destination: Uint8ClampedArray, source: ArrayLike<number>, width: number, height: number, points: readonly BrushStrokePoint[], settings: HistoryBrushSettings, selectionMask?: ArrayLike<number>): Uint8ClampedArray {
  assertInput(destination, source, width, height, points);
  if (!validHistoryBrushSettings(settings)) throw new Error('History Brush settings are invalid');
  return applyStroke(destination, source, width, height, points, settings.size, settings.hardness, (coverage) => coverage * (settings.opacity / 100) * (settings.flow / 100), selectionMask);
}

/** Apply deterministic painterly dabs from an immutable historical source. */
export function applyArtHistoryBrushPixels(destination: Uint8ClampedArray, source: ArrayLike<number>, width: number, height: number, points: readonly BrushStrokePoint[], settings: ArtHistoryBrushSettings, selectionMask?: ArrayLike<number>): Uint8ClampedArray {
  assertInput(destination, source, width, height, points);
  if (!validArtHistoryBrushSettings(settings)) throw new Error('Art History Brush settings are invalid');
  if (selectionMask) {
    if (selectionMask.length !== width * height) throw new Error('Art History Brush selection mask is invalid');
    for (let index = 0; index < selectionMask.length; index += 1) {
      const value = selectionMask[index];
      if (!finite(value) || value < 0 || value > 255) throw new Error('Art History Brush selection mask is invalid');
    }
  }
  if (!points.length || settings.opacity === 0) return new Uint8ClampedArray(destination);
  // Preflight before the detached output allocation. Never silently shrink the
  // requested footprint or skip grid cells to satisfy the local work budget.
  const bounds = points.map((point) => {
    const left = Math.max(0, Math.floor(point.x - settings.size / 2));
    const top = Math.max(0, Math.floor(point.y - settings.size / 2));
    const right = Math.min(width, Math.floor(point.x + settings.size / 2) + 1);
    const bottom = Math.min(height, Math.floor(point.y + settings.size / 2) + 1);
    return { left, top, right, bottom };
  });
  const work = bounds.reduce((total, box) => total + Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top), 0);
  if (work > MAX_ART_HISTORY_BRUSH_WORK)
    throw new Error('Art History Brush stroke exceeds local work limit; reduce Size or use a shorter stroke');
  const output = new Uint8ClampedArray(destination);
  // Output is always detached, so even source === destination stays immutable.
  const sourcePixels = source;
  const radius = Math.max(1, Math.round(settings.style));
  const fidelity = settings.fidelity / 100;
  for (let stampIndex = 0; stampIndex < points.length; stampIndex += 1) {
    const point = points[stampIndex];
    const { left, top, right, bottom } = bounds[stampIndex];
    if (left >= right || top >= bottom) continue;
    // One alpha-weighted colour per dab provides a painterly local colour
    // approximation. Hidden RGB never enters the colour and sampling stays
    // bounded to 49 × 49 regardless of the footprint size.
    const centreX = Math.round(clamp(point.x, 0, width - 1));
    const centreY = Math.round(clamp(point.y, 0, height - 1));
    let red = 0, green = 0, blue = 0, weight = 0;
    for (let sampleY = Math.max(0, centreY - radius); sampleY <= Math.min(height - 1, centreY + radius); sampleY += 1)
      for (let sampleX = Math.max(0, centreX - radius); sampleX <= Math.min(width - 1, centreX + radius); sampleX += 1) {
        const sample = (sampleY * width + sampleX) * 4;
        const alpha = sourcePixels[sample + 3] / 255;
        red += sourcePixels[sample] * alpha;
        green += sourcePixels[sample + 1] * alpha;
        blue += sourcePixels[sample + 2] * alpha;
        weight += alpha;
      }
    if (!weight) continue;
    const dab = [red / weight, green / weight, blue / weight];
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      // Retouch colour only: do not erase the target or resurrect transparent
      // historical pixels. Partial destination alpha remains byte-identical.
      if (!sourcePixels[offset + 3] || !output[offset + 3]) continue;
      const selection = selectionMask ? clamp(selectionMask[index] / 255, 0, 1) : 1;
      const coverage = coverageAt(x, y, point, settings);
      const amount = coverage * selection * (settings.opacity / 100) * (settings.flow / 100);
      if (amount <= 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const colour = sourcePixels[offset + channel] * fidelity + dab[channel] * (1 - fidelity);
        output[offset + channel] = Math.round(output[offset + channel] + (colour - output[offset + channel]) * amount);
      }
    }
  }
  return output;
}
