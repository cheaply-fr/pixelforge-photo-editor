/**
 * Bounded, deterministic Puppet Warp approximation.
 *
 * Pins are expressed in layer-local pixel coordinates. Each pin contributes
 * a smooth inverse displacement whose influence is bounded; this keeps the
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

function sourcePointForOutput(x: number, y: number, plan: PuppetWarpPlan): { x: number; y: number } {
  let weightedX = 0;
  let weightedY = 0;
  let total = 0;
  for (const pin of plan.pins) {
    const distanceX = x - pin.x;
    const distanceY = y - pin.y;
    const distanceSquared = distanceX * distanceX + distanceY * distanceY;
    const radiusSquared = pin.influence * pin.influence;
    const weight = radiusSquared / (radiusSquared + distanceSquared);
    weightedX += pin.dx * weight;
    weightedY += pin.dy * weight;
    total += weight;
  }
  if (!total) return { x, y };
  return { x: x - weightedX / total, y: y - weightedY / total };
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
      const sourcePoint = sourcePointForOutput(x, y, plan);
      sampleNearest(source, width, height, sourcePoint.x, sourcePoint.y, output, destination);
    }
  }
  return output;
}
