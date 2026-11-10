/**
 * Layer and folder blend modes.
 *
 * Stored values are stable document identifiers. Modes that Canvas 2D
 * implements natively keep their `globalCompositeOperation` name so the
 * browser compositor (GPU on most devices) does the work; the rest are
 * PixelForge-specific identifiers rendered in software with the same
 * source-over compositing equation Canvas uses for its separable modes
 * (W3C Compositing and Blending Level 1). The pure helpers here are the
 * single reference for both paths, unit fixtures and layer-style glows.
 *
 * The formulas follow the published W3C definitions where they exist and
 * the widely documented editor formulas otherwise; they are local
 * approximations and are not claimed to match any other editor bit-for-bit.
 */

export const LAYER_BLEND_MODES = [
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'linear-burn',
  'darker-color',
  'lighten',
  'screen',
  'color-dodge',
  'linear-dodge',
  'lighter-color',
  'overlay',
  'soft-light',
  'hard-light',
  'vivid-light',
  'linear-light',
  'pin-light',
  'hard-mix',
  'difference',
  'exclusion',
  'subtract',
  'divide',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

export type LayerBlendMode = (typeof LAYER_BLEND_MODES)[number];

/** Modes Canvas 2D implements with identical W3C source-over semantics. */
export const NATIVE_CANVAS_BLEND_MODES: ReadonlySet<LayerBlendMode> = new Set<LayerBlendMode>([
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

/** Display names grouped the way common editors order their blend menus. */
export const BLEND_MODE_GROUPS: ReadonlyArray<{
  label: string;
  modes: ReadonlyArray<{ value: LayerBlendMode; label: string }>;
}> = [
  { label: 'Normal', modes: [{ value: 'source-over', label: 'Normal' }] },
  {
    label: 'Darken',
    modes: [
      { value: 'darken', label: 'Darken' },
      { value: 'multiply', label: 'Multiply' },
      { value: 'color-burn', label: 'Color Burn' },
      { value: 'linear-burn', label: 'Linear Burn' },
      { value: 'darker-color', label: 'Darker Color' },
    ],
  },
  {
    label: 'Lighten',
    modes: [
      { value: 'lighten', label: 'Lighten' },
      { value: 'screen', label: 'Screen' },
      { value: 'color-dodge', label: 'Color Dodge' },
      { value: 'linear-dodge', label: 'Linear Dodge (Add)' },
      { value: 'lighter-color', label: 'Lighter Color' },
    ],
  },
  {
    label: 'Contrast',
    modes: [
      { value: 'overlay', label: 'Overlay' },
      { value: 'soft-light', label: 'Soft Light' },
      { value: 'hard-light', label: 'Hard Light' },
      { value: 'vivid-light', label: 'Vivid Light' },
      { value: 'linear-light', label: 'Linear Light' },
      { value: 'pin-light', label: 'Pin Light' },
      { value: 'hard-mix', label: 'Hard Mix' },
    ],
  },
  {
    label: 'Inversion',
    modes: [
      { value: 'difference', label: 'Difference' },
      { value: 'exclusion', label: 'Exclusion' },
      { value: 'subtract', label: 'Subtract' },
      { value: 'divide', label: 'Divide' },
    ],
  },
  {
    label: 'Component',
    modes: [
      { value: 'hue', label: 'Hue' },
      { value: 'saturation', label: 'Saturation' },
      { value: 'color', label: 'Color' },
      { value: 'luminosity', label: 'Luminosity' },
    ],
  },
];

const LABELS = new Map(
  BLEND_MODE_GROUPS.flatMap((group) => group.modes.map((mode) => [mode.value, mode.label] as const)),
);

export function blendModeLabel(mode: LayerBlendMode): string {
  return LABELS.get(mode) ?? mode;
}

export function validBlendMode(value: unknown): value is LayerBlendMode {
  return LAYER_BLEND_MODES.includes(value as LayerBlendMode);
}

export function isNativeCanvasBlendMode(
  mode: LayerBlendMode,
): mode is LayerBlendMode & GlobalCompositeOperation {
  return NATIVE_CANVAS_BLEND_MODES.has(mode);
}

const clamp = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

const colorDodge = (backdrop: number, source: number) =>
  backdrop === 0 ? 0 : source >= 1 ? 1 : Math.min(1, backdrop / (1 - source));

const colorBurn = (backdrop: number, source: number) =>
  backdrop >= 1 ? 1 : source <= 0 ? 0 : 1 - Math.min(1, (1 - backdrop) / source);

const hardLight = (backdrop: number, source: number) =>
  source <= 0.5
    ? backdrop * 2 * source
    : 1 - (1 - backdrop) * (1 - (2 * source - 1));

const softLight = (backdrop: number, source: number) => {
  if (source <= 0.5) return backdrop - (1 - 2 * source) * backdrop * (1 - backdrop);
  const d = backdrop <= 0.25 ? ((16 * backdrop - 12) * backdrop + 4) * backdrop : Math.sqrt(backdrop);
  return backdrop + (2 * source - 1) * (d - backdrop);
};

const vividLight = (backdrop: number, source: number) =>
  source <= 0.5 ? colorBurn(backdrop, 2 * source) : colorDodge(backdrop, 2 * source - 1);

/** Separable blend function B(Cb, Cs) on 0..1 channels. */
export function blendChannel(mode: LayerBlendMode, backdrop: number, source: number): number {
  switch (mode) {
    case 'multiply':
      return backdrop * source;
    case 'screen':
      return backdrop + source - backdrop * source;
    case 'overlay':
      return hardLight(source, backdrop);
    case 'darken':
      return Math.min(backdrop, source);
    case 'lighten':
      return Math.max(backdrop, source);
    case 'color-dodge':
      return colorDodge(backdrop, source);
    case 'color-burn':
      return colorBurn(backdrop, source);
    case 'hard-light':
      return hardLight(backdrop, source);
    case 'soft-light':
      return softLight(backdrop, source);
    case 'difference':
      return Math.abs(backdrop - source);
    case 'exclusion':
      return backdrop + source - 2 * backdrop * source;
    case 'linear-burn':
      return clamp(backdrop + source - 1);
    case 'linear-dodge':
      return clamp(backdrop + source);
    case 'vivid-light':
      return vividLight(backdrop, source);
    case 'linear-light':
      return clamp(backdrop + 2 * source - 1);
    case 'pin-light':
      return source <= 0.5 ? Math.min(backdrop, 2 * source) : Math.max(backdrop, 2 * source - 1);
    case 'hard-mix':
      return backdrop + source >= 1 ? 1 : 0;
    case 'subtract':
      return clamp(backdrop - source);
    case 'divide':
      return source <= 0 ? (backdrop <= 0 ? 0 : 1) : clamp(backdrop / source);
    default:
      return source;
  }
}

const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;

function clipColor(r: number, g: number, b: number): [number, number, number] {
  const l = lum(r, g, b), n = Math.min(r, g, b), x = Math.max(r, g, b);
  if (n < 0) {
    const scale = l - n;
    r = scale === 0 ? l : l + ((r - l) * l) / scale;
    g = scale === 0 ? l : l + ((g - l) * l) / scale;
    b = scale === 0 ? l : l + ((b - l) * l) / scale;
  }
  if (x > 1) {
    const scale = x - l;
    r = scale === 0 ? l : l + ((r - l) * (1 - l)) / scale;
    g = scale === 0 ? l : l + ((g - l) * (1 - l)) / scale;
    b = scale === 0 ? l : l + ((b - l) * (1 - l)) / scale;
  }
  return [r, g, b];
}

function setLum(r: number, g: number, b: number, l: number): [number, number, number] {
  const d = l - lum(r, g, b);
  return clipColor(r + d, g + d, b + d);
}

const sat = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);

function setSat(r: number, g: number, b: number, s: number): [number, number, number] {
  const values = [r, g, b];
  const order = [0, 1, 2].sort((a, c) => values[a] - values[c]);
  const [min, mid, max] = order;
  const out = [0, 0, 0];
  if (values[max] > values[min]) {
    out[mid] = ((values[mid] - values[min]) * s) / (values[max] - values[min]);
    out[max] = s;
  }
  out[min] = 0;
  return [out[0], out[1], out[2]];
}

/**
 * Blend one RGB triple (0..1). Writes the result into `out` to avoid
 * allocating in per-pixel loops.
 */
export function blendRgb(
  mode: LayerBlendMode,
  br: number,
  bg: number,
  bb: number,
  sr: number,
  sg: number,
  sb: number,
  out: [number, number, number],
): [number, number, number] {
  switch (mode) {
    case 'hue': {
      const [r, g, b] = setSat(sr, sg, sb, sat(br, bg, bb));
      [out[0], out[1], out[2]] = setLum(r, g, b, lum(br, bg, bb));
      return out;
    }
    case 'saturation': {
      const [r, g, b] = setSat(br, bg, bb, sat(sr, sg, sb));
      [out[0], out[1], out[2]] = setLum(r, g, b, lum(br, bg, bb));
      return out;
    }
    case 'color':
      [out[0], out[1], out[2]] = setLum(sr, sg, sb, lum(br, bg, bb));
      return out;
    case 'luminosity':
      [out[0], out[1], out[2]] = setLum(br, bg, bb, lum(sr, sg, sb));
      return out;
    case 'darker-color': {
      const keepSource = sr + sg + sb < br + bg + bb;
      out[0] = keepSource ? sr : br;
      out[1] = keepSource ? sg : bg;
      out[2] = keepSource ? sb : bb;
      return out;
    }
    case 'lighter-color': {
      const keepSource = sr + sg + sb > br + bg + bb;
      out[0] = keepSource ? sr : br;
      out[1] = keepSource ? sg : bg;
      out[2] = keepSource ? sb : bb;
      return out;
    }
    default:
      out[0] = blendChannel(mode, br, sr);
      out[1] = blendChannel(mode, bg, sg);
      out[2] = blendChannel(mode, bb, sb);
      return out;
  }
}

/**
 * Composite a straight-alpha RGBA source over a straight-alpha RGBA backdrop
 * in place using the W3C source-over equation with blend mode `mode`:
 *
 *   Cs' = (1 - ab) * Cs + ab * B(Cb, Cs)
 *   ao  = as + ab * (1 - as)
 *   Co  = (as * Cs' + ab * (1 - as) * Cb) / ao
 *
 * `opacity` scales source alpha once. Pixels with no resulting coverage keep
 * the backdrop's hidden RGB bytes, and fully transparent source pixels leave
 * the backdrop byte-identical.
 */
export function blendPixelsInPlace(
  backdrop: Uint8ClampedArray,
  source: Uint8ClampedArray,
  opacity: number,
  mode: LayerBlendMode,
): void {
  if (opacity <= 0) return;
  const out: [number, number, number] = [0, 0, 0];
  const separable = mode !== 'hue' && mode !== 'saturation' && mode !== 'color' &&
    mode !== 'luminosity' && mode !== 'darker-color' && mode !== 'lighter-color';
  for (let offset = 0; offset < backdrop.length; offset += 4) {
    const sourceAlphaByte = source[offset + 3];
    if (sourceAlphaByte === 0) continue;
    const as = (sourceAlphaByte / 255) * opacity;
    const ab = backdrop[offset + 3] / 255;
    const ao = as + ab * (1 - as);
    if (ao <= 0) continue;
    const sr = source[offset] / 255, sg = source[offset + 1] / 255, sb = source[offset + 2] / 255;
    const br = backdrop[offset] / 255, bg = backdrop[offset + 1] / 255, bb = backdrop[offset + 2] / 255;
    if (separable) {
      out[0] = blendChannel(mode, br, sr);
      out[1] = blendChannel(mode, bg, sg);
      out[2] = blendChannel(mode, bb, sb);
    } else blendRgb(mode, br, bg, bb, sr, sg, sb, out);
    const covered = ab * (1 - as);
    backdrop[offset] = Math.round(((as * ((1 - ab) * sr + ab * out[0]) + covered * br) / ao) * 255);
    backdrop[offset + 1] = Math.round(((as * ((1 - ab) * sg + ab * out[1]) + covered * bg) / ao) * 255);
    backdrop[offset + 2] = Math.round(((as * ((1 - ab) * sb + ab * out[2]) + covered * bb) / ao) * 255);
    backdrop[offset + 3] = Math.round(ao * 255);
  }
}

/**
 * Composite one solid colour with coverage `alpha` (0..255) at `offset`
 * using the same equation. Used by layer-style glows.
 */
export function blendColorAt(
  target: Uint8ClampedArray,
  offset: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
  mode: LayerBlendMode,
  scratch: [number, number, number],
): void {
  if (alpha <= 0) return;
  const as = Math.min(1, alpha / 255);
  const ab = target[offset + 3] / 255;
  const ao = as + ab * (1 - as);
  if (ao <= 0) return;
  const sr = red / 255, sg = green / 255, sb = blue / 255;
  const br = target[offset] / 255, bg = target[offset + 1] / 255, bb = target[offset + 2] / 255;
  if (ab > 0 && mode !== 'source-over') blendRgb(mode, br, bg, bb, sr, sg, sb, scratch);
  else {
    scratch[0] = sr;
    scratch[1] = sg;
    scratch[2] = sb;
  }
  const covered = ab * (1 - as);
  target[offset] = Math.round(((as * ((1 - ab) * sr + ab * scratch[0]) + covered * br) / ao) * 255);
  target[offset + 1] = Math.round(((as * ((1 - ab) * sg + ab * scratch[1]) + covered * bg) / ao) * 255);
  target[offset + 2] = Math.round(((as * ((1 - ab) * sb + ab * scratch[2]) + covered * bb) / ao) * 255);
  target[offset + 3] = Math.round(ao * 255);
}
