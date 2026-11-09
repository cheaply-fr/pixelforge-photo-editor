/**
 * Pixel logic for the Color Replacement brush.
 *
 * Modes use the W3C non-separable blend formulas (the same family as the
 * layer blend modes): `color` keeps the pixel's luminosity and takes the hue
 * and saturation of the replacement colour, `hue` takes only the hue,
 * `saturation` only the saturation, `luminosity` only the luminosity, and
 * `normal` paints the flat replacement colour (the tool's original
 * behaviour). This is a bounded local approximation of Photoshop's options,
 * not a colour-managed reproduction of them.
 */

import type { ColorReplaceLimits, ColorReplaceMode, ColorReplaceSampling } from './retouchOptions.ts';

export type Rgb = [number, number, number];
export type Rgba = [number, number, number, number];

const lum = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(color: Rgb): Rgb {
  const l = lum(color), n = Math.min(...color), x = Math.max(...color);
  let out = color.slice() as Rgb;
  if (n < 0) out = out.map((c) => l + ((c - l) * l) / (l - n)) as Rgb;
  if (x > 255) out = out.map((c) => l + ((c - l) * (255 - l)) / (x - l)) as Rgb;
  return out;
}
const setLum = (color: Rgb, l: number): Rgb => {
  const d = l - lum(color);
  return clipColor([color[0] + d, color[1] + d, color[2] + d]);
};
const sat = (color: Rgb) => Math.max(...color) - Math.min(...color);
function setSat(color: Rgb, s: number): Rgb {
  const max = Math.max(...color), min = Math.min(...color);
  if (max === min) return [0, 0, 0];
  return color.map((c) => ((c - min) * s) / (max - min)) as Rgb;
}

/** The replacement result for one pixel (`base`) and colour (`paint`). */
export function replacePixelColor(base: Rgb, paint: Rgb, mode: ColorReplaceMode): Rgb {
  let out: Rgb;
  if (mode === 'normal') out = paint;
  else if (mode === 'color') out = setLum(paint, lum(base));
  else if (mode === 'hue') out = setLum(setSat(paint, sat(base)), lum(base));
  else if (mode === 'saturation') out = setLum(setSat(base, sat(paint)), lum(base));
  else out = setLum(base, lum(paint));
  return out.map((c) => Math.max(0, Math.min(255, Math.round(c)))) as Rgb;
}

export type ColorReplaceWindowRequest = {
  /** Stroke-start pixels of the window (never modified). */
  source: ArrayLike<number>;
  /** Pixels written in place (same window). */
  output: Uint8ClampedArray;
  /** Window rectangle in layer coordinates. */
  window: { x: number; y: number; width: number; height: number };
  /** Layer size; dab footprints are clipped to it. */
  layerWidth: number;
  layerHeight: number;
  /** Dab centres in layer coordinates. */
  dabs: ReadonlyArray<{ x: number; y: number }>;
  radius: number;
  paint: Rgb;
  tolerance: number;
  opacity: number;
  mode: ColorReplaceMode;
  /** `once` and `background` use `target`; `continuous` samples each dab centre. */
  sampling: ColorReplaceSampling;
  target: Rgba;
  limits: ColorReplaceLimits;
};

/**
 * Replace matching colours inside each dab. Continuous sampling re-reads the
 * stroke-start pixel under every dab centre; Contiguous limits each dab to
 * the matching pixels 4-connected to its centre inside the brush circle.
 */
export function replaceColorWindow(request: ColorReplaceWindowRequest): boolean {
  const { source, output, window, radius, paint, tolerance, mode, sampling, limits } = request,
    amount = Math.max(0, Math.min(1, request.opacity));
  if (amount <= 0) return false;
  const local = (x: number, y: number) => ((y - window.y) * window.width + x - window.x) * 4;
  const insideWindow = (x: number, y: number) =>
    x >= window.x && y >= window.y && x < window.x + window.width && y < window.y + window.height;
  let changed = false;
  for (const dab of request.dabs) {
    const cx = dab.x, cy = dab.y,
      left = Math.max(0, window.x, Math.floor(cx - radius)),
      right = Math.min(request.layerWidth - 1, window.x + window.width - 1, Math.ceil(cx + radius)),
      top = Math.max(0, window.y, Math.floor(cy - radius)),
      bottom = Math.min(request.layerHeight - 1, window.y + window.height - 1, Math.ceil(cy + radius));
    if (right < left || bottom < top) continue;
    const centreX = Math.max(left, Math.min(right, Math.floor(cx))),
      centreY = Math.max(top, Math.min(bottom, Math.floor(cy)));
    let target = request.target;
    if (sampling === 'continuous') {
      const offset = local(centreX, centreY);
      target = [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
    }
    const matches = (offset: number) =>
      source[offset + 3] > 0 &&
      Math.max(
        Math.abs(source[offset] - target[0]),
        Math.abs(source[offset + 1] - target[1]),
        Math.abs(source[offset + 2] - target[2]),
        Math.abs(source[offset + 3] - target[3]),
      ) <= tolerance;
    const inCircle = (x: number, y: number) => Math.hypot(x - cx, y - cy) <= radius;
    const replace = (x: number, y: number) => {
      const offset = local(x, y),
        result = replacePixelColor([source[offset], source[offset + 1], source[offset + 2]], paint, mode);
      for (let channel = 0; channel < 3; channel += 1)
        output[offset + channel] = Math.round(source[offset + channel] * (1 - amount) + result[channel] * amount);
      output[offset + 3] = source[offset + 3];
      changed = true;
    };
    if (limits === 'discontiguous') {
      for (let y = top; y <= bottom; y += 1)
        for (let x = left; x <= right; x += 1)
          if (inCircle(x, y) && matches(local(x, y))) replace(x, y);
      continue;
    }
    // Contiguous: flood from the dab centre through matching pixels.
    if (!inCircle(centreX, centreY) || !matches(local(centreX, centreY))) continue;
    const spanWidth = right - left + 1,
      seen = new Uint8Array(spanWidth * (bottom - top + 1)),
      stack = [centreX, centreY];
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      if (x < left || x > right || y < top || y > bottom || !insideWindow(x, y)) continue;
      const key = (y - top) * spanWidth + (x - left);
      if (seen[key]) continue;
      seen[key] = 1;
      if (!inCircle(x, y) || !matches(local(x, y))) continue;
      replace(x, y);
      stack.push(x - 1, y, x + 1, y, x, y - 1, x, y + 1);
    }
  }
  return changed;
}
