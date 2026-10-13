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

