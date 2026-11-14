/**
 * Bounded, deterministic Puppet Warp approximation.
 *
 * Pins are expressed in layer-local pixel coordinates. Each pin contributes
 * a smooth inverse displacement with a compact falloff, so a pin bends the
 * layer around it and pixels beyond every pin's radius stay put; this keeps the
 * operation source-safe and replayable without pretending to implement
 * Photoshop's mesh, pin constraints, or rigid-region solver.
 */

export type PuppetPin = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  influence: number;
};

export type PuppetWarpPlan = {
  width: number;
  height: number;
  pins: PuppetPin[];
};

export const PUPPET_WARP_MAX_PINS = 8;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function validDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_000_000)
    throw new Error('Puppet Warp dimensions are invalid');
}

export function normalizePuppetPins(
  pins: readonly Partial<PuppetPin>[] | undefined,
  width: number,
  height: number,
): PuppetPin[] {
  validDimensions(width, height);
  if (!Array.isArray(pins)) return [];
  return pins.slice(0, PUPPET_WARP_MAX_PINS).map((pin) => ({
    x: finite(pin.x) ? clamp(pin.x, 0, width - 1) : 0,
    y: finite(pin.y) ? clamp(pin.y, 0, height - 1) : 0,
    dx: finite(pin.dx) ? clamp(pin.dx, -Math.max(width, height), Math.max(width, height)) : 0,
    dy: finite(pin.dy) ? clamp(pin.dy, -Math.max(width, height), Math.max(width, height)) : 0,
    influence: finite(pin.influence)
      ? clamp(pin.influence, 1, Math.max(width, height))
      : Math.max(1, Math.round(Math.min(width, height) * 0.35)),
  }));
}

export function validPuppetWarpPlan(plan: PuppetWarpPlan): boolean {
  if (!plan || !Number.isInteger(plan.width) || !Number.isInteger(plan.height)) return false;
  try {
    validDimensions(plan.width, plan.height);
  } catch {
    return false;
  }
  if (!Array.isArray(plan.pins) || plan.pins.length > PUPPET_WARP_MAX_PINS) return false;
  return plan.pins.every((pin) =>
    pin && finite(pin.x) && finite(pin.y) && finite(pin.dx) && finite(pin.dy) && finite(pin.influence) &&
    pin.x >= 0 && pin.x <= plan.width - 1 && pin.y >= 0 && pin.y <= plan.height - 1 &&
    Math.abs(pin.dx) <= Math.max(plan.width, plan.height) &&
    Math.abs(pin.dy) <= Math.max(plan.width, plan.height) &&
    pin.influence >= 1 && pin.influence <= Math.max(plan.width, plan.height));
}

export function planPuppetWarp(
  width: number,
  height: number,
  pins: readonly Partial<PuppetPin>[] | undefined,
): PuppetWarpPlan {
  const normalized = normalizePuppetPins(pins, width, height);
  const plan = { width, height, pins: normalized };
  if (!validPuppetWarpPlan(plan)) throw new Error('Puppet Warp pins are invalid');
  return plan;
}

/**
 * A pin's reach. Wide enough that its displacement field never folds over
 * itself (the falloff's steepest slope is about 1.54 / radius, so the radius
 * must exceed about 1.54 times the move); otherwise the pin's own influence.
 */
export function puppetPinRadius(pin: PuppetPin): number {
  return Math.max(pin.influence, Math.hypot(pin.dx, pin.dy) * 1.6);
}

/**
 * Smooth compact falloff: 1 at the pin's target, 0 at and beyond its radius,
 * with zero slope at both ends.
 */
function falloff(distanceSquared: number, radius: number): number {
  const ratio = distanceSquared / (radius * radius);
  if (ratio >= 1) return 0;
  const remaining = 1 - ratio;
  return remaining * remaining;
}

/**
 * Inverse map: which source point lands on output (x, y). Each pin's
 * influence is centred on where it moves to, so the pixel under the pin lands
 * exactly on its target, nearby pixels follow with a smooth falloff, and
 * pixels beyond every pin's radius stay where they are. Overlapping pins blend
 * by weight without exceeding any pin's own move.
 */
export function puppetSourcePoint(x: number, y: number, plan: PuppetWarpPlan): { x: number; y: number } {
  let weightedX = 0;
  let weightedY = 0;
  let total = 0;
  for (const pin of plan.pins) {
    const distanceX = x - (pin.x + pin.dx);
    const distanceY = y - (pin.y + pin.dy);
    const weight = falloff(distanceX * distanceX + distanceY * distanceY, puppetPinRadius(pin));
    if (!weight) continue;
    weightedX += pin.dx * weight;
    weightedY += pin.dy * weight;
    total += weight;
  }
  if (!total) return { x, y };
  const scale = 1 / Math.max(1, total);
  return { x: x - weightedX * scale, y: y - weightedY * scale };
}

function sampleNearest(source: ArrayLike<number>, width: number, height: number, x: number, y: number, target: Uint8ClampedArray, destination: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    target[destination + 3] = 0;
    return;
  }
  const sourceX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const sourceY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const origin = (sourceY * width + sourceX) * 4;
  const alpha = source[origin + 3];
  target[destination] = alpha ? source[origin] : 0;
  target[destination + 1] = alpha ? source[origin + 1] : 0;
  target[destination + 2] = alpha ? source[origin + 2] : 0;
  target[destination + 3] = alpha;
}

/** Warp a source-sized RGBA buffer while retaining alpha and transparent RGB safety. */
export function warpPuppetRgba(
  source: ArrayLike<number>,
  width: number,
  height: number,
  plan: PuppetWarpPlan,
): Uint8ClampedArray {
  validDimensions(width, height);
  if (source.length !== width * height * 4 || plan.width !== width || plan.height !== height || !validPuppetWarpPlan(plan))
    throw new Error('Puppet Warp dimensions or plan are invalid');
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const sourcePoint = puppetSourcePoint(x, y, plan);
      sampleNearest(source, width, height, sourcePoint.x, sourcePoint.y, output, destination);
    }
  }
  return output;
}
