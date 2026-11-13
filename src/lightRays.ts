/**
 * Render → Light Rays: a bounded, seeded local approximation of radial light
 * rays, god rays and starburst glints around an editable centre.
 *
 * Two sources of light:
 * - `generate` draws `count` analytic rays (or `starburst` spikes) from the
 *   centre. Every output pixel depends only on its own source pixel and the
 *   ray geometry, so the effect is band-safe (halo 0) for the parallel
 *   filter worker pool when rendered with an explicit full-image frame.
 * - `source` streaks the layer's own bright pixels outward from the centre
 *   (radial accumulation with exponential decay). It needs pixels between the
 *   centre and the output pixel, so it renders as one full-frame job.
 *
 * Light is composited with Screen or Add over visible pixels (alpha and fully
 * transparent padding stay byte-identical, like the other local filters), or
 * with `transparent`, which also lets rays fill transparent pixels (alpha may
 * grow, like Render → Clouds with Fill). Geometry is layer-local: lengths and
 * the inner radius are percentages of half the layer's shorter side, ray
 * width is in layer pixels, and the centre is a fraction of the layer span.
 *
 * This module is pure (no DOM) and deterministic for a given seed.
 */

export type LightRaysMode = 'generate' | 'source';
export type LightRaysShape = 'rays' | 'starburst';
export type LightRaysBlend = 'screen' | 'add' | 'transparent';

export type LightRaysSettings = {
  /** Generate analytic rays, or streak existing bright pixels outward. */
  mode: LightRaysMode;
  /** Soft rays, or sharp pointed starburst spikes with a small core glow. */
  shape: LightRaysShape;
  /** Number of rays/spikes (generate), or angular variation cells (source). */
  count: number;
  /** Ray length as a percentage of half the layer's shorter side. */
  length: number;
  /** Ray half-width at its base, in layer pixels. */
  width: number;
  /** 0 keeps rays parallel-sided; 100 tapers each ray to a point. */
  sharpness: number;
  /** Seeded per-ray length, brightness, width and angle variation. */
  randomness: number;
  /** Rotation of the ray fan in degrees. */
  rotation: number;
  /** Rays start outside this radius (percentage of half the shorter side). */
  innerRadius: number;
  /** 0 keeps rays bright to their tips; 100 fades them quickly. */
  falloff: number;
  /** Light colour, #rrggbb. */
  color: string;
  /** Ray brightness gain as a percentage (0–400). */
  intensity: number;
  blend: LightRaysBlend;
  /** Source mode: luminance at or below this level does not streak (0–254). */
  threshold: number;
};

export const LIGHT_RAYS_LIMITS = {
  count: [2, 720],
  length: [1, 300],
  width: [0.5, 256],
  sharpness: [0, 100],
  randomness: [0, 100],
  rotation: [-180, 180],
  innerRadius: [0, 100],
  falloff: [0, 100],
  intensity: [0, 400],
  threshold: [0, 254],
} as const;

export const DEFAULT_LIGHT_RAYS_SETTINGS: LightRaysSettings = {
  mode: 'generate',
  shape: 'rays',
  count: 48,
  length: 80,
  width: 3,
  sharpness: 60,
  randomness: 45,
  rotation: 0,
  innerRadius: 0,
  falloff: 50,
  color: '#ffe3a3',
  intensity: 100,
  blend: 'screen',
  threshold: 170,
};

/**
 * Settings for a newly applied Light Rays filter. "Render on transparent"
 * matches Screen on opaque pixels and also lights empty ones, so rays work on
 * their own empty layer instead of showing only where something was painted.
 * Legacy records without a blend still normalize to Screen.
 */
export const NEW_LIGHT_RAYS_SETTINGS: LightRaysSettings = {
  ...DEFAULT_LIGHT_RAYS_SETTINGS,
  blend: 'transparent',
};

/** Starting values applied when the shape is switched to Starburst. */
export const DEFAULT_STARBURST_PATCH: Partial<LightRaysSettings> = {
  shape: 'starburst',
  count: 8,
  length: 40,
  width: 4,
  randomness: 0,
  falloff: 35,
};

type NumericKey = keyof typeof LIGHT_RAYS_LIMITS;
const INTEGER_KEYS: ReadonlySet<NumericKey> = new Set<NumericKey>([
  'count', 'sharpness', 'randomness', 'rotation', 'innerRadius', 'falloff', 'intensity', 'threshold',
]);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const validHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function numeric(key: NumericKey, value: unknown): number {
  const [min, max] = LIGHT_RAYS_LIMITS[key];
  if (!finite(value)) return DEFAULT_LIGHT_RAYS_SETTINGS[key];
  // Width keeps half-pixel steps; everything else is a whole number.
  const rounded = INTEGER_KEYS.has(key) ? Math.round(value) : Math.round(value * 2) / 2;
  return clamp(rounded, min, max);
}

/** Normalize a partial or untrusted settings record (every persistence/render boundary). */
export function normalizeLightRaysSettings(value: unknown): LightRaysSettings {
  const source = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Partial<LightRaysSettings>;
  return {
    mode: source.mode === 'source' ? 'source' : 'generate',
    shape: source.shape === 'starburst' ? 'starburst' : 'rays',
    count: numeric('count', source.count),
    length: numeric('length', source.length),
    width: numeric('width', source.width),
    sharpness: numeric('sharpness', source.sharpness),
    randomness: numeric('randomness', source.randomness),
    rotation: numeric('rotation', source.rotation),
    innerRadius: numeric('innerRadius', source.innerRadius),
    falloff: numeric('falloff', source.falloff),
    color: validHex(source.color) ? source.color.toLowerCase() : DEFAULT_LIGHT_RAYS_SETTINGS.color,
    intensity: numeric('intensity', source.intensity),
    blend: source.blend === 'add' || source.blend === 'transparent' ? source.blend : 'screen',
    threshold: numeric('threshold', source.threshold),
  };
}

/** Strict validator for stored records: exactly the normalized shape. */
export function validLightRaysSettings(value: unknown): value is LightRaysSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(DEFAULT_LIGHT_RAYS_SETTINGS);
  const own = Object.keys(value);
  if (own.length !== keys.length || !own.every((key) => keys.includes(key))) return false;
  const normalized = normalizeLightRaysSettings(value) as Record<string, unknown>;
  return keys.every((key) => (value as Record<string, unknown>)[key] === normalized[key]);
}

/** Whether a Light Rays effect can render as independent row bands (halo 0). */
export function lightRaysBandSafe(value: Partial<LightRaysSettings> | undefined): boolean {
  return normalizeLightRaysSettings(value).mode === 'generate';
}

/** Brightness below which a ray tip counts as faded out for the UI readout. */
export const LIGHT_RAYS_VISIBLE_THRESHOLD = 0.05;

export type LightRaysPixelExtent = {
  /** The percentage base: half the layer's shorter side, in layer pixels. */
  base: number;
  /** Rays start this far from the centre (layer pixels). */
  innerRadius: number;
  /** Nominal ray length beyond the inner radius (layer pixels). */
  length: number;
  /** innerRadius + length: where the longest unvaried ray ends. */
  outerRadius: number;
  /**
   * Where an unvaried generated ray fades below 5% brightness with the
   * current falloff (layer pixels from the centre). Randomness can shorten
   * individual rays further. Equal to outerRadius for source streaks, whose
   * exponential decay is not a hard tip.
   */
  visibleRadius: number;
};

/**
 * Pixel meaning of the stored percentage settings for a layer of
 * `width` x `height` pixels. Lengths and the inner radius are stored as
 * percentages of half the shorter side (so saved documents keep their look
 * when the canvas is resized); the UI shows these pixel values next to them.
 */
export function lightRaysPixelExtent(
  value: Partial<LightRaysSettings> | undefined,
  width: number,
  height: number,
): LightRaysPixelExtent {
  const settings = normalizeLightRaysSettings(value);
  const base = Math.max(0.5, Math.min(Math.max(1, width), Math.max(1, height)) / 2);
  const length = Math.max(1, (settings.length / 100) * base);
  const innerRadius = (settings.innerRadius / 100) * base;
  const exponent = 0.15 + (settings.falloff / 100) * 3.85;
  const visibleFraction =
    settings.mode === 'generate' ? 1 - LIGHT_RAYS_VISIBLE_THRESHOLD ** (1 / exponent) : 1;
  return {
    base,
    innerRadius,
    length,
    outerRadius: innerRadius + length,
    visibleRadius: innerRadius + length * visibleFraction,
  };
}

export type LightRay = {
  /** Direction in radians, normalized to [0, 2π). */
  angle: number;
  /** Length in layer pixels, measured outward from the inner radius. */
  length: number;
  /** Half-width at the ray base, in layer pixels. */
  width: number;
  /** Relative brightness, 0.25..1. */
  brightness: number;
};

export type LightRaysGeometry = {
  centreX: number;
  centreY: number;
  innerRadius: number;
  /** Nominal (unvaried) ray length in pixels. */
  length: number;
  /** Rays sorted by angle. */
  rays: LightRay[];
};

const TAU = Math.PI * 2;

function seededHash(seed: number) {
  return (key: number): number => {
    let next = Math.imul((key | 0) ^ seed, 0x9e3779b1);
    next = Math.imul(next ^ (next >>> 15), 0x85ebca6b);
    next = Math.imul(next ^ (next >>> 13), 0xc2b2ae35);
    return ((next ^ (next >>> 16)) >>> 0) / 0x100000000;
  };
}

/** Deterministic ray layout for a layer of `width` × `height` pixels. */
export function lightRaysGeometry(
  value: Partial<LightRaysSettings> | undefined,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  seed: number,
): LightRaysGeometry {
  const settings = normalizeLightRaysSettings(value);
  const { length, innerRadius } = lightRaysPixelExtent(settings, width, height);
  const hash = seededHash(seed >>> 0);
  const random = settings.randomness / 100;
  const count = settings.count;
  const spacing = TAU / count;
  const rotation = (settings.rotation * Math.PI) / 180;
  const starburst = settings.shape === 'starburst';
  const rays: LightRay[] = [];
  for (let index = 0; index < count; index += 1) {
    const key = index * 4;
    const jitter = (hash(key) - 0.5) * spacing * 0.9 * random;
    let angle = (rotation + index * spacing + jitter) % TAU;
    if (angle < 0) angle += TAU;
    // Classic glints alternate long and short spikes.
    const alternate = starburst && count >= 6 && index % 2 === 1 ? 0.55 : 1;
    rays.push({
      angle,
      length: Math.max(1, length * alternate * (1 - random * 0.85 * hash(key + 1))),
      width: Math.max(0.25, settings.width * (1 + random * 0.6 * (hash(key + 2) - 0.5))),
      brightness: 1 - random * 0.75 * hash(key + 3),
    });
  }
  rays.sort((a, b) => a.angle - b.angle);
  return {
    centreX: clamp(finite(centerX) ? centerX : 0.5, 0, 1) * Math.max(0, width - 1),
    centreY: clamp(finite(centerY) ? centerY : 0.5, 0, 1) * Math.max(0, height - 1),
    innerRadius,
    length,
    rays,
  };
}

export type LightRaysRender = {
  settings: Partial<LightRaysSettings> | undefined;
  centerX: number;
  centerY: number;
  seed: number;
  /** Effect amount, 0..1. */
  strength: number;
};

/**
 * Rows of a full image held in `source`: `rowOffset` is the image row of
 * `source` row 0, `fullHeight` the image height, and [start, end) the image
 * rows to render. Omitted means `source` is the whole image.
 */
export type LightRaysFrame = { rowOffset: number; fullHeight: number; start: number; end: number };

const smoothFade = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value * value * (3 - 2 * value));

/**
 * Composite per-channel light (0..∞, 1 = full white) onto one pixel. Screen
 * and Add keep alpha and skip fully transparent pixels; `transparent` also
 * fills uncovered alpha with the light colour.
 */
function compositeLight(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
  blend: LightRaysBlend,
): void {
  const alpha = source[offset + 3];
  if (blend === 'add') {
    if (!alpha) return;
    output[offset] = source[offset] + red * 255;
    output[offset + 1] = source[offset + 1] + green * 255;
    output[offset + 2] = source[offset + 2] + blue * 255;
    output[offset + 3] = alpha;
    return;
  }
  const r = red > 1 ? 1 : red, g = green > 1 ? 1 : green, b = blue > 1 ? 1 : blue;
  const sr = 255 - (255 - source[offset]) * (1 - r);
  const sg = 255 - (255 - source[offset + 1]) * (1 - g);
  const sb = 255 - (255 - source[offset + 2]) * (1 - b);
  if (blend === 'screen' || alpha === 255) {
    if (!alpha) return;
    output[offset] = sr;
    output[offset + 1] = sg;
    output[offset + 2] = sb;
    output[offset + 3] = alpha;
    return;
  }
  // Render on transparent: the light's coverage fills the uncovered part.
  const coverage = Math.max(r, g, b);
  if (coverage <= 0) return;
  const sourceAlpha = alpha / 255;
  const outAlpha = sourceAlpha + coverage * (1 - sourceAlpha);
  // Premultiplied: the source (screened) plus the light over the uncovered part.
  const lightWeight = (1 - sourceAlpha) * 255;
  output[offset] = (sr * sourceAlpha + r * lightWeight) / outAlpha;
  output[offset + 1] = (sg * sourceAlpha + g * lightWeight) / outAlpha;
  output[offset + 2] = (sb * sourceAlpha + b * lightWeight) / outAlpha;
  output[offset + 3] = outAlpha * 255;
}

function hexColour(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

const ANGLE_BINS = 4096;

/**
 * Generate mode. `source`/`output` hold image rows starting at
 * `frame.rowOffset`; only rows [frame.start, frame.end) are written.
 */
function renderGeneratedRays(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  frame: LightRaysFrame,
  render: LightRaysRender,
  settings: LightRaysSettings,
): void {
  const gain = (settings.intensity / 100) * render.strength;
  if (gain <= 0) return;
  const geometry = lightRaysGeometry(settings, width, frame.fullHeight, render.centerX, render.centerY, render.seed);
  const { centreX, centreY, innerRadius, rays } = geometry;
  const count = rays.length;
  const starburst = settings.shape === 'starburst';
  const taper = starburst ? 1 : settings.sharpness / 100;
  const exponent = 0.15 + (settings.falloff / 100) * 3.85;
  const [colourR, colourG, colourB] = hexColour(settings.color);
  const angles = new Float64Array(count), cosines = new Float64Array(count), sines = new Float64Array(count);
  const lengths = new Float64Array(count), widths = new Float64Array(count), brightness = new Float64Array(count);
  let maxWidth = 0, maxLength = 0;
  for (let index = 0; index < count; index += 1) {
    const ray = rays[index];
    angles[index] = ray.angle;
    cosines[index] = Math.cos(ray.angle);
    sines[index] = Math.sin(ray.angle);
    lengths[index] = ray.length;
    widths[index] = ray.width;
    brightness[index] = ray.brightness;
    maxWidth = Math.max(maxWidth, ray.width);
    maxLength = Math.max(maxLength, ray.length);
  }
  // First sorted ray at or after the start of each angle bin.
  const firstRay = new Int32Array(ANGLE_BINS);
  for (let bin = 0, ray = 0; bin < ANGLE_BINS; bin += 1) {
    const start = (bin / ANGLE_BINS) * TAU;
    while (ray < count && angles[ray] < start) ray += 1;
    firstRay[bin] = ray === count ? 0 : ray;
  }
  const binWidth = TAU / ANGLE_BINS;
  const profileReach = starburst ? 1 : 3;
  const widthScale = starburst ? 1.5 : 1;
  const lateralReach = profileReach * (maxWidth * widthScale + 0.35);
  const fade = Math.max(1, Math.min(maxWidth, geometry.length * 0.05));
  const outerRadius = innerRadius + maxLength + 1;
  const outerSquared = outerRadius * outerRadius;
  const coreRadius = starburst ? Math.max(1.5, settings.width * 3) : 0;
  const coreReachSquared = (coreRadius * 3) ** 2;
  const fillTransparent = settings.blend === 'transparent';
  for (let y = frame.start; y < frame.end; y += 1) {
    const dy = y - centreY;
    const row = (y - frame.rowOffset) * width * 4;
    for (let x = 0; x < width; x += 1) {
      const offset = row + x * 4;
      if (source[offset + 3] === 0 && !fillTransparent) continue;
      const dx = x - centreX;
      const distanceSquared = dx * dx + dy * dy;
      const inCore = distanceSquared < coreReachSquared;
      if (distanceSquared > outerSquared && !inCore) continue;
      const distance = Math.sqrt(distanceSquared);
      let sum = inCore ? Math.exp(-distanceSquared / (coreRadius * coreRadius)) : 0;
      if (distance > innerRadius) {
        let phi = Math.atan2(dy, dx);
        if (phi < 0) phi += TAU;
        const reach = distance > lateralReach ? Math.asin(lateralReach / distance) : Math.PI;
        let from = phi - reach;
        if (from < 0) from += TAU;
        const all = reach >= Math.PI / 2;
        const first = all ? 0 : firstRay[Math.min(ANGLE_BINS - 1, Math.floor(from / binWidth))];
        for (let step = 0; step < count; step += 1) {
          const index = first + step < count ? first + step : first + step - count;
          if (!all) {
            let relative = angles[index] - from;
            if (relative < 0) relative += TAU;
            if (relative > 2 * reach) {
              // Rays inside the bin but before `from` sort first: skip them.
              if (relative > TAU - binWidth) continue;
              break;
            }
          }
          const along = dx * cosines[index] + dy * sines[index];
          if (along <= innerRadius) continue;
          const t = (along - innerRadius) / lengths[index];
          if (t >= 1) continue;
          const lateral = Math.abs(dy * cosines[index] - dx * sines[index]);
          const q = lateral / (widths[index] * widthScale * (1 - taper * t) + 0.35);
          if (q >= profileReach) continue;
          const profile = starburst ? 1.6 * (1 - q) : Math.exp(-q * q);
          const startFade = along - innerRadius < fade ? smoothFade((along - innerRadius) / fade) : 1;
          sum += brightness[index] * profile * startFade * Math.pow(1 - t, exponent);
        }
      }
      if (sum <= 0) continue;
      const light = sum * gain;
      compositeLight(source, output, offset, light * colourR, light * colourG, light * colourB, settings.blend);
    }
  }
}

/** Largest working buffer for source-mode accumulation, in pixels. */
export const LIGHT_RAYS_SOURCE_BUDGET = 2 * 1024 * 1024;

/**
 * Source mode: radial streaks of bright pixels. Bright light is extracted,
 * box-downsampled to a bounded working size (god rays are soft, so this
 * keeps a 10-megapixel layer fast), accumulated outward from the centre with
 * log2(length) doubling passes (an exact truncated exponential kernel along
 * each ray, because radial shifts along one ray compose), modulated by the
 * seeded angular variation, then upsampled bilinearly and composited. The
 * inner radius is applied at full resolution so a pupil edge stays crisp.
 */
function renderSourceStreaks(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  render: LightRaysRender,
  settings: LightRaysSettings,
): void {
  const gain = (settings.intensity / 100) * render.strength;
  if (gain <= 0) return;
  const geometry = lightRaysGeometry(settings, width, height, render.centerX, render.centerY, render.seed);
  const scale = Math.min(1, Math.sqrt(LIGHT_RAYS_SOURCE_BUDGET / (width * height)));
  const workWidth = Math.max(1, Math.round(width * scale));
  const workHeight = Math.max(1, Math.round(height * scale));
  const sx = workWidth / width, sy = workHeight / height;
  const size = workWidth * workHeight;
  let current = new Float32Array(size * 3);
  const threshold = settings.threshold;
  const span = 255 - threshold;
  const counts = scale < 1 ? new Uint16Array(size) : undefined;
  let lit = false;
  for (let y = 0; y < height; y += 1) {
    const rowCell = Math.min(workHeight - 1, Math.floor(y * sy)) * workWidth;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const cell = rowCell + Math.min(workWidth - 1, Math.floor(x * sx));
      if (counts) counts[cell] += 1;
      const alpha = source[offset + 3];
      if (!alpha) continue;
      const red = source[offset], green = source[offset + 1], blue = source[offset + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      if (luminance <= threshold) continue;
      const weight = ((luminance - threshold) / span) * (alpha / 255) / 255;
      current[cell * 3] += red * weight;
      current[cell * 3 + 1] += green * weight;
      current[cell * 3 + 2] += blue * weight;
      lit = true;
    }
  }
  if (!lit) return;
  if (counts)
    for (let cell = 0; cell < size; cell += 1) {
      const count = counts[cell];
      if (count > 1) {
        current[cell * 3] /= count;
        current[cell * 3 + 1] /= count;
        current[cell * 3 + 2] /= count;
      }
    }
  // Work-space centre, kept inside the grid so samples never leave it.
  const centreX = clamp((geometry.centreX + 0.5) * sx - 0.5, 0, workWidth - 1);
  const centreY = clamp((geometry.centreY + 0.5) * sy - 0.5, 0, workHeight - 1);
  const length = Math.max(1, geometry.length * scale);
  // Steps of about one working pixel keep sharp-edged sources from leaving
  // visible step rings; the pass count still only grows with log2(length).
  const baseStep = Math.max(1, length / 512);
  const passes = Math.max(1, Math.ceil(Math.log2(length / baseStep)));
  const decay = 0.5 + (settings.falloff / 100) * 6;
  const ratio = Math.exp((-decay * baseStep) / length);
  const kernelSum = (1 - ratio ** (2 ** passes)) / (1 - ratio);
  const lastColumn = workWidth - 1, lastRow = workHeight - 1;
  let next = new Float32Array(size * 3);
  for (let pass = 0; pass < passes; pass += 1) {
    const shift = baseStep * 2 ** pass;
    const weight = Math.exp((-decay * shift) / length);
    for (let y = 0; y < workHeight; y += 1) {
      const dy = y - centreY;
      let index = y * workWidth * 3;
      for (let x = 0; x < workWidth; x += 1, index += 3) {
        let red = current[index], green = current[index + 1], blue = current[index + 2];
        const dx = x - centreX;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > shift) {
          // Sample the same ray `shift` pixels closer to the centre (between
          // the centre and this pixel, so always inside the grid).
          const factor = 1 - shift / distance;
          const px = centreX + dx * factor, py = centreY + dy * factor;
          const left = px | 0, top = py | 0;
          const tx = px - left, ty = py - top;
          const right = left < lastColumn ? 3 : 0, down = top < lastRow ? workWidth * 3 : 0;
          const i00 = (top * workWidth + left) * 3, i10 = i00 + right, i01 = i00 + down, i11 = i01 + right;
          const w00 = (1 - tx) * (1 - ty) * weight, w10 = tx * (1 - ty) * weight;
          const w01 = (1 - tx) * ty * weight, w11 = tx * ty * weight;
          red += current[i00] * w00 + current[i10] * w10 + current[i01] * w01 + current[i11] * w11;
          green += current[i00 + 1] * w00 + current[i10 + 1] * w10 + current[i01 + 1] * w01 + current[i11 + 1] * w11;
          blue += current[i00 + 2] * w00 + current[i10 + 2] * w10 + current[i01 + 2] * w01 + current[i11 + 2] * w11;
        }
        next[index] = red;
        next[index + 1] = green;
        next[index + 2] = blue;
      }
    }
    const swap = current;
    current = next;
    next = swap;
  }
  // Exposure and seeded angular variation (`count` smooth cells), applied in
  // work space: a streak keeps one angle, so this is exact along each ray.
  const random = settings.randomness / 100;
  const cells = settings.count;
  const cellValues = new Float64Array(cells);
  const hash = seededHash((render.seed >>> 0) ^ 0x5bd1e995);
  for (let cell = 0; cell < cells; cell += 1) cellValues[cell] = hash(cell);
  const rotation = (settings.rotation * Math.PI) / 180;
  // A uniformly bright area stays about as bright as its source; small
  // glints still leave a visible, decaying streak.
  const exposure = (gain * 2) / kernelSum ** 0.85;
  const [colourR, colourG, colourB] = hexColour(settings.color);
  for (let y = 0, index = 0; y < workHeight; y += 1) {
    const dy = y - centreY;
    for (let x = 0; x < workWidth; x += 1, index += 3) {
      if (current[index] <= 0 && current[index + 1] <= 0 && current[index + 2] <= 0) continue;
      let factor = exposure;
      if (random > 0) {
        let turn = (Math.atan2(dy, x - centreX) - rotation) / TAU;
        turn -= Math.floor(turn);
        const position = turn * cells;
        const cell = Math.min(cells - 1, Math.floor(position));
        const mix = smoothFade(position - cell);
        const value = cellValues[cell] + (cellValues[(cell + 1) % cells] - cellValues[cell]) * mix;
        factor *= 1 - random * 0.85 * (1 - value);
      }
      current[index] *= factor * colourR;
      current[index + 1] *= factor * colourG;
      current[index + 2] *= factor * colourB;
    }
  }
  const inner = geometry.innerRadius;
  const innerSquared = inner * inner;
  const fade = Math.max(1, geometry.length * 0.05);
  const fillTransparent = settings.blend === 'transparent';
  for (let y = 0; y < height; y += 1) {
    const dy = y - geometry.centreY;
    const py = clamp((y + 0.5) * sy - 0.5, 0, lastRow);
    const top = py | 0, ty = py - top, down = top < lastRow ? workWidth * 3 : 0;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (source[offset + 3] === 0 && !fillTransparent) continue;
      const dx = x - geometry.centreX;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared <= innerSquared) continue;
      const px = clamp((x + 0.5) * sx - 0.5, 0, lastColumn);
      const left = px | 0, tx = px - left, right = left < lastColumn ? 3 : 0;
      const i00 = (top * workWidth + left) * 3, i10 = i00 + right, i01 = i00 + down, i11 = i01 + right;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      let red = current[i00] * w00 + current[i10] * w10 + current[i01] * w01 + current[i11] * w11;
      let green = current[i00 + 1] * w00 + current[i10 + 1] * w10 + current[i01 + 1] * w01 + current[i11 + 1] * w11;
      let blue = current[i00 + 2] * w00 + current[i10 + 2] * w10 + current[i01 + 2] * w01 + current[i11 + 2] * w11;
      if (red <= 0 && green <= 0 && blue <= 0) continue;
      if (inner > 0) {
        const edge = Math.sqrt(distanceSquared) - inner;
        if (edge < fade) {
          const startFade = smoothFade(edge / fade);
          red *= startFade;
          green *= startFade;
          blue *= startFade;
        }
      }
      compositeLight(source, output, offset, red, green, blue, settings.blend);
    }
  }
}

/**
 * Render Light Rays into `output` (initially a copy of `source`). With
 * `frame`, `source` and `output` hold only one band's rows (generate mode).
 */
export function renderLightRays(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
  render: LightRaysRender,
  frame?: LightRaysFrame,
): void {
  const settings = normalizeLightRaysSettings(render.settings);
  if (!(render.strength > 0)) return;
  if (settings.mode === 'source') {
    if (frame) throw new RangeError('Source-mode Light Rays cannot render as a band');
    renderSourceStreaks(source, output, width, height, render, settings);
    return;
  }
  renderGeneratedRays(
    source, output, width,
    frame ?? { rowOffset: 0, fullHeight: height, start: 0, end: height },
    render, settings,
  );
}
