/** Authorable interior colour stops for the Gradient tool. */
export const MAX_GRADIENT_STOPS = 6;

export type GradientStop = {
  position: number;
  color: string;
};

const HEX = /^#[a-f\d]{6}$/i;

export function isGradientStop(value: unknown): value is GradientStop {
  if (!value || typeof value !== 'object') return false;
  const stop = value as Partial<GradientStop>;
  const position = stop.position;
  return typeof position === 'number' && Number.isInteger(position) && position >= 1 && position <= 99 &&
    typeof stop.color === 'string' && HEX.test(stop.color);
}

/** Validate persisted interior stops, including deterministic ordering. */
export function isGradientStops(value: unknown): value is GradientStop[] {
  if (!Array.isArray(value) || value.length > MAX_GRADIENT_STOPS) return false;
  let previous = 0;
  for (const stop of value) {
    if (!isGradientStop(stop) || stop.position <= previous) return false;
    previous = stop.position;
  }
  return true;
}

/** Return a detached sorted stop list suitable for a canvas gradient. */
export function normalizeGradientStops(value: unknown): GradientStop[] {
  if (!Array.isArray(value)) return [];
  const sorted = value
    .filter(isGradientStop)
    .slice(0, MAX_GRADIENT_STOPS)
    .sort((a, b) => a.position - b.position)
    .map((stop) => ({ position: stop.position, color: stop.color.toLowerCase() }));
  return sorted.filter((stop, index) => index === 0 || stop.position !== sorted[index - 1].position);
}

export type GradientColorStop = {
  /** Canvas offset in [0, 1]. */
  offset: number;
  /** `#rrggbb` for opaque stops, `#rrggbb00` for a transparent end. */
  color: string;
};

export type GradientStopPlan = {
  mode: 'linear' | 'radial' | 'reflected' | 'angle' | 'diamond';
  /** Drawing (foreground) colour. */
  color: string;
  /** Background colour, used only when `end` is `background`. */
  backgroundColor: string;
  end: 'transparent' | 'background';
  reverse: boolean;
  /** `none` or a midpoint colour. */
  midpoint: string;
  /** Midpoint position as a percentage (1-99). */
  midpointPosition: number;
  /** Authored interior stops (normalized here). */
  stops?: unknown;
};

const FALLBACK_TRANSPARENT = '#ffffff00';

/** Return a hex colour as `#rrggbb00`: the same hue with zero alpha. */
export function transparentOf(color: string): string {
  const value = color.trim().toLowerCase();
  const short = /^#([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}00`;
  const long = /^#([a-f\d]{6})([a-f\d]{2})?$/.exec(value);
  if (long) return `#${long[1]}00`;
  return FALLBACK_TRANSPARENT;
}

/**
 * Build the ordered canvas colour stops for the Gradient tool.
 *
 * Canvas gradients interpolate colour stops un-premultiplied, so fading toward
 * a fixed transparent white leaks a pale fringe through the ramp. Like
 * Photoshop's "Foreground to Transparent", a transparent end therefore takes
 * the colour of its adjacent opaque stop with zero alpha.
 */
export function buildGradientColorStops(plan: GradientStopPlan): GradientColorStop[] {
  const midpointOffset = plan.midpoint === 'none'
    ? 0.5
    : Math.max(0.01, Math.min(0.99, plan.midpointPosition / 100));
  if (plan.mode === 'reflected') {
    const middle = plan.midpoint !== 'none'
      ? plan.midpoint
      : plan.end === 'background' ? plan.backgroundColor : transparentOf(plan.color);
    return [
      { offset: 0, color: plan.color },
      { offset: midpointOffset, color: middle },
      { offset: 1, color: plan.color },
    ];
  }
  const authored = normalizeGradientStops(plan.stops);
  const interior: GradientColorStop[] = authored.length > 0
    ? authored.map((stop) => ({ offset: stop.position / 100, color: stop.color }))
    : plan.midpoint !== 'none'
      ? [{ offset: midpointOffset, color: plan.midpoint }]
      : [];
  const endColor = (neighbour: string) =>
    plan.end === 'background' ? plan.backgroundColor : transparentOf(neighbour);
  const first = plan.reverse ? endColor(interior[0]?.color ?? plan.color) : plan.color;
  const last = plan.reverse
    ? plan.color
    : endColor(interior[interior.length - 1]?.color ?? plan.color);
  return [{ offset: 0, color: first }, ...interior, { offset: 1, color: last }];
}

