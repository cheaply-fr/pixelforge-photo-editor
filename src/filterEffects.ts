/**
 * Deterministic, nondestructive local Filter menu effects.
 *
 * Effects operate on an RGBA render buffer and never mutate the input. They
 * intentionally keep alpha byte-for-byte stable, and leave transparent RGB
 * padding untouched. The document stores this small parameter object so a
 * filter remains editable and source assets remain immutable.
 */

import { deinterlacePixels, effectiveDeinterlaceSettings, validDeinterlaceSettings, type DeinterlaceSettings } from './deinterlace.ts';

export const FILTER_EFFECT_TYPES = [
  'none',
  'average-blur',
  'blur-more',
  'box-blur',
  'gaussian-blur',
  'sharpen',
  'unsharp-mask',
  'sharpen-more',
  'sharpen-edges',
  'smart-sharpen',
  'lens-blur',
  'iris-blur',
  'smart-blur',
  'surface-blur',
  'shape-blur',
  'motion-blur',
  'radial-blur',
  'spin-blur',
  'path-blur',
  'field-blur',
  'tilt-shift',
  'mosaic',
  'crystallize',
  'fragment',
  'facet',
  'color-halftone',
  'mezzotint',
  'pointillize',
  'picture-frame',
  'tree',
  'clouds',
  'fibers',
  'difference-clouds',
  'lens-correction',
  'displace',
  'pinch',
  'polar-coordinates',
  'ripple',
  'spherize',
  'twirl',
  'wave',
  'shear',
  'zigzag',
  'lens-flare',
  'flame',
  'find-edges',
  'emboss',
  'deinterlace',
  'ntsc-colors',
] as const;
export type FilterEffectType = (typeof FILTER_EFFECT_TYPES)[number];

/** One layer-local point in a persisted, bounded motion-blur path. */
export type BlurPathPoint = {
  x: number;
  y: number;
  /** Per-point blur length as a percentage of the effect radius. */
  speed: number;
};

/** Rotated layer-local ellipse; radii are fractions of width and height. */
export type SpinBlurEllipse = {
  radiusX: number;
  radiusY: number;
  rotation: number;
  /** Fraction of the outer ellipse used for a smooth inner feather. */
  feather: number;
};

/** One layer-local Field Blur pin. Coordinates are normalized to the layer. */
export type FieldBlurPoint = {
  x: number;
  y: number;
  /** Local blur radius in source pixels, bounded to the same 0..64 range. */
  radius: number;
};

/**
 * Bounded geometry for the local Tilt-Shift approximation. `focusWidth` is
 * the full sharp band as a fraction of the cross-axis extent and `feather`
 * is the distance over which the blur ramps from zero to full strength.
 */
export type TiltShiftSettings = {
  focusWidth: number;
  feather: number;
};

/**
 * Screen angles for the four deterministic CMYK halftone plates. Angles are
 * expressed in degrees and are kept in the same bounded layer-local metadata
 * as the cell size, so a project never has to persist generated pixels.
 */
export type ColorHalftoneSettings = {
  cyanAngle: number;
  magentaAngle: number;
  yellowAngle: number;
  blackAngle: number;
};

/**
 * Grain geometry for the local Mezzotint approximation. The mode controls
 * the size of the seeded noise field while `radius` remains the persisted
 * cell-size control shared by the Pixelate family.
 */
export type MezzotintSettings = {
  grain: 'fine' | 'medium' | 'coarse';
};

/** Geometry controls for the bounded seeded Fibers approximation. */
export type FibersSettings = {
  /** Amount of seeded lateral warp applied to the filament field. */
  variance: number;
};

/** Bounded geometry controls for the deterministic local Tree approximation. */
export type TreeSettings = {
  branches: number;
  leafiness: number;
};

export const DEFAULT_COLOR_HALFTONE_SETTINGS: ColorHalftoneSettings = {
  cyanAngle: 108,
  magentaAngle: 162,
  yellowAngle: 90,
  blackAngle: 45,
};

export const DEFAULT_TILT_SHIFT_SETTINGS: TiltShiftSettings = {
  focusWidth: 0.36,
  feather: 0.5,
};

export const DEFAULT_MEZZOTINT_SETTINGS: MezzotintSettings = {
  grain: 'medium',
};

export const DEFAULT_FIBERS_SETTINGS: FibersSettings = {
  variance: 50,
};

export const DEFAULT_TREE_SETTINGS: TreeSettings = {
  branches: 5,
  leafiness: 55,
};

export type FilterEffects = {
  type: FilterEffectType;
  /** Legacy lens corrections default to inward source sampling. */
  lensDirection?: 'inward' | 'outward';
  /** Strength as a percentage. */
  amount: number;
  /** Blur radius, distortion wavelength, mosaic/fiber scale or Fragment offset, in source pixels. */
  radius: number;
  /** Direction for directional blur/distortion families, in degrees. */
  angle: number;
  /** Normalized effect centre, in the inclusive range 0..1. */
  centerX: number;
  centerY: number;
  /** Stable seed reserved for deterministic procedural variants. */
  seed: number;
  /** Authored polyline in normalized layer coordinates, limited to 2–8 points. */
  path?: BlurPathPoint[];
  /** Omitted for legacy global radial Spin Blur records. */
  spinEllipse?: SpinBlurEllipse;
  /** New authored paths are centered unless this is explicitly false. */
  pathCentered?: boolean;
  /** Blend falloff along the path trail, in the range 0..1. */
  pathTaper?: number;
  /** Authored Field Blur pins, limited to 1–8 deterministic points. */
  fieldPoints?: FieldBlurPoint[];
  /** Editable sharp-band geometry for the Tilt-Shift Gallery effect. */
  tiltShift?: TiltShiftSettings;
  /** Editable CMYK screen angles for the Color Halftone Pixelate effect. */
  colorHalftone?: ColorHalftoneSettings;
  /** Editable seeded grain geometry for the Mezzotint Pixelate effect. */
  mezzotint?: MezzotintSettings;
  /** Editable warp geometry for the seeded Fibers Render effect. */
  fibers?: FibersSettings;
  tree?: TreeSettings;
  deinterlace?: DeinterlaceSettings;
};

export const neutralFilterEffects: FilterEffects = {
  type: 'none',
  amount: 0,
  radius: 0,
  angle: 0,
  centerX: 0.5,
  centerY: 0.5,
  seed: 0,
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const clampByte = (value: number) => clamp(Math.round(value), 0, 255);

/** Normalize a partial metadata record at every persistence/render boundary. */
export function effectiveFilterEffects(
  value: Partial<FilterEffects> | undefined,
): FilterEffects {
  const source = (value || {}) as Partial<FilterEffects>;
  const type = FILTER_EFFECT_TYPES.includes(source.type as FilterEffectType)
    ? (source.type as FilterEffectType)
    : neutralFilterEffects.type;
  const amount = finite(source.amount)
    ? clamp(source.amount, 0, 100)
    : neutralFilterEffects.amount;
  const radius = finite(source.radius)
    ? clamp(Math.round(source.radius), 0, 64)
    : neutralFilterEffects.radius;
  const angle = finite(source.angle)
    ? clamp(source.angle, -180, 180)
    : neutralFilterEffects.angle;
  const centerX = finite(source.centerX)
    ? clamp(source.centerX, 0, 1)
    : neutralFilterEffects.centerX;
  const centerY = finite(source.centerY)
    ? clamp(source.centerY, 0, 1)
    : neutralFilterEffects.centerY;
  const seed = finite(source.seed)
    ? Math.trunc(source.seed) >>> 0
    : neutralFilterEffects.seed;
  const normalized = { type, amount, radius, angle, centerX, centerY, seed } as FilterEffects;
  if (type === 'lens-correction') {
    normalized.lensDirection = source.lensDirection === 'outward' ? 'outward' : 'inward';
  }
  if (type === 'path-blur' && Array.isArray(source.path)) {
    const path = source.path.slice(0, 8).filter(
      (point) => point && typeof point === 'object' && !Array.isArray(point),
    ).map((point) => ({
      x: finite(point.x) ? clamp(point.x, 0, 1) : 0.5,
      y: finite(point.y) ? clamp(point.y, 0, 1) : 0.5,
      speed: finite(point.speed) ? clamp(point.speed, 0, 100) : 100,
    }));
    if (path.length >= 2) {
      normalized.path = path;
      normalized.pathCentered = source.pathCentered !== false;
      normalized.pathTaper = finite(source.pathTaper) ? clamp(source.pathTaper, 0, 1) : 0;
    }
  }
  if (type === 'spin-blur' && source.spinEllipse && typeof source.spinEllipse === 'object' && !Array.isArray(source.spinEllipse)) {
    const ellipse = source.spinEllipse;
    normalized.spinEllipse = {
      radiusX: finite(ellipse.radiusX) ? clamp(ellipse.radiusX, 0.01, 2) : 0.3,
      radiusY: finite(ellipse.radiusY) ? clamp(ellipse.radiusY, 0.01, 2) : 0.3,
      rotation: finite(ellipse.rotation) ? clamp(ellipse.rotation, -180, 180) : 0,
      feather: finite(ellipse.feather) ? clamp(ellipse.feather, 0, 1) : 0.2,
    };
  }
  if (type === 'field-blur' && Array.isArray(source.fieldPoints)) {
    const fieldPoints = source.fieldPoints.slice(0, 8).filter(
      (point) => point && typeof point === 'object' && !Array.isArray(point),
    ).map((point) => ({
      x: finite(point.x) ? clamp(point.x, 0, 1) : 0.5,
      y: finite(point.y) ? clamp(point.y, 0, 1) : 0.5,
      radius: finite(point.radius) ? clamp(Math.round(point.radius), 0, 64) : 0,
    }));
    if (fieldPoints.length > 0) normalized.fieldPoints = fieldPoints;
  }
  if (type === 'tilt-shift') {
    const settings = source.tiltShift;
    normalized.tiltShift = {
      focusWidth: finite(settings?.focusWidth) ? clamp(settings.focusWidth, 0.05, 0.8) : DEFAULT_TILT_SHIFT_SETTINGS.focusWidth,
      feather: finite(settings?.feather) ? clamp(settings.feather, 0.05, 0.8) : DEFAULT_TILT_SHIFT_SETTINGS.feather,
    };
  }
  if (type === 'color-halftone') {
    const settings = source.colorHalftone;
    const angle = (value: unknown, fallback: number) =>
      finite(value) ? clamp(Math.round(value), -180, 180) : fallback;
    normalized.colorHalftone = {
      cyanAngle: angle(settings?.cyanAngle, DEFAULT_COLOR_HALFTONE_SETTINGS.cyanAngle),
      magentaAngle: angle(settings?.magentaAngle, DEFAULT_COLOR_HALFTONE_SETTINGS.magentaAngle),
      yellowAngle: angle(settings?.yellowAngle, DEFAULT_COLOR_HALFTONE_SETTINGS.yellowAngle),
      blackAngle: angle(settings?.blackAngle, DEFAULT_COLOR_HALFTONE_SETTINGS.blackAngle),
    };
  }
  if (type === 'mezzotint') {
    const grain = source.mezzotint?.grain;
    normalized.mezzotint = {
      grain: grain === 'fine' || grain === 'coarse' ? grain : DEFAULT_MEZZOTINT_SETTINGS.grain,
    };
  }
  if (type === 'fibers') {
    const variance = source.fibers?.variance;
    normalized.fibers = {
      variance: finite(variance) ? clamp(Math.round(variance), 1, 64) : DEFAULT_FIBERS_SETTINGS.variance,
    };
  }
  if (type === 'tree') {
    const settings = source.tree;
    normalized.tree = {
      branches: finite(settings?.branches) ? clamp(Math.round(settings.branches), 2, 8) : DEFAULT_TREE_SETTINGS.branches,
      leafiness: finite(settings?.leafiness) ? clamp(Math.round(settings.leafiness), 0, 100) : DEFAULT_TREE_SETTINGS.leafiness,
    };
  }
  if (type === 'deinterlace') normalized.deinterlace = effectiveDeinterlaceSettings(source.deinterlace);
  return normalized;
}

function validBlurPath(value: unknown): value is BlurPathPoint[] {
  return Array.isArray(value) && value.length >= 2 && value.length <= 8 && value.every((point) =>
    point && typeof point === 'object' && !Array.isArray(point) &&
    finite(point.x) && point.x >= 0 && point.x <= 1 &&
    finite(point.y) && point.y >= 0 && point.y <= 1 &&
    finite(point.speed) && point.speed >= 0 && point.speed <= 100,
  );
}

function validSpinEllipse(value: unknown): value is SpinBlurEllipse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ellipse = value as Partial<SpinBlurEllipse>;
  return finite(ellipse.radiusX) && ellipse.radiusX >= 0.01 && ellipse.radiusX <= 2 &&
    finite(ellipse.radiusY) && ellipse.radiusY >= 0.01 && ellipse.radiusY <= 2 &&
    finite(ellipse.rotation) && ellipse.rotation >= -180 && ellipse.rotation <= 180 &&
    finite(ellipse.feather) && ellipse.feather >= 0 && ellipse.feather <= 1;
}

function validFieldPoints(value: unknown): value is FieldBlurPoint[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 8 && value.every((point) =>
    point && typeof point === 'object' && !Array.isArray(point) &&
    finite(point.x) && point.x >= 0 && point.x <= 1 &&
    finite(point.y) && point.y >= 0 && point.y <= 1 &&
    finite(point.radius) && Number.isInteger(point.radius) && point.radius >= 0 && point.radius <= 64,
  );
}
function validTiltShiftSettings(value: unknown): value is TiltShiftSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Partial<TiltShiftSettings>;
  return finite(settings.focusWidth) && settings.focusWidth >= 0.05 && settings.focusWidth <= 0.8 &&
    finite(settings.feather) && settings.feather >= 0.05 && settings.feather <= 0.8;
}
function validColorHalftoneSettings(value: unknown): value is ColorHalftoneSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Partial<ColorHalftoneSettings>;
  return finite(settings.cyanAngle) && settings.cyanAngle >= -180 && settings.cyanAngle <= 180 &&
    finite(settings.magentaAngle) && settings.magentaAngle >= -180 && settings.magentaAngle <= 180 &&
    finite(settings.yellowAngle) && settings.yellowAngle >= -180 && settings.yellowAngle <= 180 &&
    finite(settings.blackAngle) && settings.blackAngle >= -180 && settings.blackAngle <= 180;
}
function validMezzotintSettings(value: unknown): value is MezzotintSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Partial<MezzotintSettings>;
  return settings.grain === 'fine' || settings.grain === 'medium' || settings.grain === 'coarse';
}
function validFibersSettings(value: unknown): value is FibersSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Partial<FibersSettings>;
  return finite(settings.variance) && Number.isInteger(settings.variance) && settings.variance >= 1 && settings.variance <= 64;
}
function validTreeSettings(value: unknown): value is TreeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Partial<TreeSettings>;
  return finite(settings.branches) && Number.isInteger(settings.branches) && settings.branches >= 2 && settings.branches <= 8 &&
    finite(settings.leafiness) && Number.isInteger(settings.leafiness) && settings.leafiness >= 0 && settings.leafiness <= 100;
}

export function validFilterEffects(value: unknown): value is FilterEffects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const effect = value as Partial<FilterEffects>;
  return (
    FILTER_EFFECT_TYPES.includes(effect.type as FilterEffectType) &&
    (effect.lensDirection === undefined || effect.lensDirection === 'inward' || effect.lensDirection === 'outward') &&
    (effect.path === undefined || validBlurPath(effect.path)) &&
    (effect.spinEllipse === undefined || validSpinEllipse(effect.spinEllipse)) &&
    (effect.pathCentered === undefined || typeof effect.pathCentered === 'boolean') &&
    (effect.pathTaper === undefined || (finite(effect.pathTaper) && effect.pathTaper >= 0 && effect.pathTaper <= 1)) &&
    (effect.fieldPoints === undefined || validFieldPoints(effect.fieldPoints)) &&
    (effect.tiltShift === undefined || validTiltShiftSettings(effect.tiltShift)) &&
    (effect.colorHalftone === undefined || validColorHalftoneSettings(effect.colorHalftone)) &&
    (effect.mezzotint === undefined || validMezzotintSettings(effect.mezzotint)) &&
    (effect.fibers === undefined || validFibersSettings(effect.fibers)) &&
    (effect.tree === undefined || validTreeSettings(effect.tree)) &&
    (effect.deinterlace === undefined || validDeinterlaceSettings(effect.deinterlace)) &&
    finite(effect.amount) &&
    effect.amount >= 0 &&
    effect.amount <= 100 &&
    finite(effect.radius) &&
    Number.isInteger(effect.radius) &&
    effect.radius >= 0 &&
    effect.radius <= 64 &&
    finite(effect.angle) &&
    effect.angle >= -180 &&
    effect.angle <= 180 &&
    finite(effect.centerX) &&
    effect.centerX >= 0 &&
    effect.centerX <= 1 &&
    finite(effect.centerY) &&
    effect.centerY >= 0 &&
    effect.centerY <= 1 &&
    finite(effect.seed) &&
    Number.isInteger(effect.seed) &&
    effect.seed >= 0 &&
    effect.seed <= 0xffffffff
  );
}

export function isNeutralFilterEffects(
  value: Partial<FilterEffects> | undefined,
): boolean {
  const effect = effectiveFilterEffects(value);
  return (
    effect.type === 'none' ||
    effect.amount === 0 ||
    (effect.type === 'path-blur' && Boolean(effect.path) && effect.path!.every((point) => point.speed === 0)) ||
    (effect.type === 'twirl' && effect.angle === 0) ||
    (effect.type === 'shear' && effect.angle === 0) ||
    (effect.type === 'field-blur' && (!effect.fieldPoints || effect.fieldPoints.every((point) => point.radius === 0))) ||
    (effect.type === 'deinterlace' && effect.radius === 0) ||
    (effect.type !== 'twirl' && effect.type !== 'field-blur' && effect.type !== 'deinterlace' && effect.type !== 'ntsc-colors' && effect.radius === 0) ||
    (effect.type === 'field-blur' && !effect.fieldPoints && effect.radius === 0)
  );
}

function validateDimensions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!(data instanceof Uint8ClampedArray))
    throw new TypeError('Filter data must be a Uint8ClampedArray');
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16000 ||
    height > 16000 ||
    width * height > 16000000
  )
    throw new RangeError('Filter dimensions are outside supported limits');
  if (data.length !== width * height * 4)
    throw new RangeError('Filter data length does not match dimensions');
}

function sourcePixel(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const sx = clamp(Math.round(x), 0, width - 1),
    sy = clamp(Math.round(y), 0, height - 1),
    offset = (sy * width + sx) * 4;
  return [
    source[offset],
    source[offset + 1],
    source[offset + 2],
    source[offset + 3],
  ];
}

/**
 * Sample a fractional source coordinate without pulling hidden RGB out of
 * transparent pixels. Premultiplied-alpha interpolation keeps pinch edges
 * free of halos while still producing a visible result on tiny canvases where
 * nearest-neighbour rounding would map a subpixel displacement back to the
 * original pixel.
 */
function sourcePixelBilinear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const sampleX = clamp(x, 0, width - 1),
    sampleY = clamp(y, 0, height - 1),
    left = Math.floor(sampleX),
    top = Math.floor(sampleY),
    right = Math.min(width - 1, left + 1),
    bottom = Math.min(height - 1, top + 1),
    tx = sampleX - left,
    ty = sampleY - top,
    weights = [
      (1 - tx) * (1 - ty),
      tx * (1 - ty),
      (1 - tx) * ty,
      tx * ty,
    ],
    offsets = [
      (top * width + left) * 4,
      (top * width + right) * 4,
      (bottom * width + left) * 4,
      (bottom * width + right) * 4,
    ];
  let alpha = 0,
    red = 0,
    green = 0,
    blue = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    const pixelAlpha = source[offsets[index] + 3] / 255,
      weight = weights[index] * pixelAlpha;
    alpha += weights[index] * pixelAlpha;
    red += source[offsets[index]] * weight;
    green += source[offsets[index] + 1] * weight;
    blue += source[offsets[index] + 2] * weight;
  }
  if (alpha <= 0) return [0, 0, 0, 0];
  return [
    clampByte(red / alpha),
    clampByte(green / alpha),
    clampByte(blue / alpha),
    clampByte(alpha * 255),
  ];
}

function blendPixel(
  output: Uint8ClampedArray,
  offset: number,
  source: [number, number, number, number],
  strength: number,
): void {
  if (source[3] === 0) return;
  output[offset] = clampByte(output[offset] * (1 - strength) + source[0] * strength);
  output[offset + 1] = clampByte(output[offset + 1] * (1 - strength) + source[1] * strength);
  output[offset + 2] = clampByte(output[offset + 2] * (1 - strength) + source[2] * strength);
}

/** Circular aperture integration with a fixed 49-sample area budget.
 * Samples exclude hidden RGB and destination alpha remains source-owned.
 * This simulates uniform circular bokeh; depth-map occlusion is not inferred.
 */
function applyLensBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const offsets: Array<[number, number]> = [[0, 0]];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let sample = 0; sample < 48; sample += 1) {
    const distance = radius * Math.sqrt((sample + 0.5) / 48);
    offsets.push([
      Math.round(Math.cos(sample * goldenAngle) * distance),
      Math.round(Math.sin(sample * goldenAngle) * distance),
    ]);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      let red = 0, green = 0, blue = 0, weight = 0;
      for (const [dx, dy] of offsets) {
        const sx = clamp(x + dx, 0, width - 1);
        const sy = clamp(y + dy, 0, height - 1);
        const offset = (sy * width + sx) * 4;
        const alpha = source[offset + 3];
        red += source[offset] * alpha;
        green += source[offset + 1] * alpha;
        blue += source[offset + 2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + red / weight * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + green / weight * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + blue / weight * strength);
    }
  }
}

/**
 * Elliptical focal-plane blur. The centre ellipse stays sharp and the blur
 * ramps smoothly toward the outside, while the source alpha and transparent
 * RGB padding remain untouched. This is a deterministic local approximation
 * of Photoshop's Iris Blur; it does not infer a depth map.
 */
function applyIrisBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const focalX = Math.max(1, width * (0.16 + (1 - radius / 64) * 0.34));
  const focalY = Math.max(1, height * (0.16 + (1 - radius / 64) * 0.34));
  const blurRadius = Math.max(1, Math.round(radius));
  applyBoxBlur(source, width, height, blurRadius, output, strength, (x, y) => {
    const dx = (x - centerX * (width - 1)) / focalX;
    const dy = (y - centerY * (height - 1)) / focalY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return clamp((distance - 0.78) / 0.72, 0, 1);
  });
}

/**
 * Edge-preserving local blur. Neighbours are weighted by both spatial
 * distance and luminance similarity, so strong boundaries remain defined
 * while flat regions soften. This bounded bilateral approximation is fully
 * local and does not infer semantic edges or depth.
 */
function applySmartBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(8, Math.round(radius)));
  const similarityScale = 18 + bounded * 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const destinationAlpha = source[destination + 3];
      if (destinationAlpha === 0) continue;
      const targetLuma =
        source[destination] * 0.2126 +
        source[destination + 1] * 0.7152 +
        source[destination + 2] * 0.0722;
      let red = 0, green = 0, blue = 0, weight = 0;
      for (let dy = -bounded; dy <= bounded; dy += 1) {
        for (let dx = -bounded; dx <= bounded; dx += 1) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sampleOffset = (sy * width + sx) * 4;
          const alpha = source[sampleOffset + 3] / 255;
          if (!alpha) continue;
          const spatial = Math.exp(-(dx * dx + dy * dy) / (2 * bounded * bounded));
          const sampleLuma =
            source[sampleOffset] * 0.2126 +
            source[sampleOffset + 1] * 0.7152 +
            source[sampleOffset + 2] * 0.0722;
          const similarity = Math.exp(-Math.abs(sampleLuma - targetLuma) / similarityScale);
          const sampleWeight = spatial * similarity * alpha;
          red += source[sampleOffset] * sampleWeight;
          green += source[sampleOffset + 1] * sampleWeight;
          blue += source[sampleOffset + 2] * sampleWeight;
          weight += sampleWeight;
        }
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + (red / weight) * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + (green / weight) * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + (blue / weight) * strength);
    }
  }
}

/**
 * Surface Blur approximation using a hard luminance threshold. Only nearby
 * pixels on the same tonal surface contribute, so edges stay crisp while
 * broad regions smooth. The bounded neighbourhood keeps interaction costs
 * predictable and never changes source alpha or hidden RGB padding.
 */
function applySurfaceBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(8, Math.round(radius)));
  const threshold = 12 + bounded * 3;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const targetLuma =
        source[destination] * 0.2126 +
        source[destination + 1] * 0.7152 +
        source[destination + 2] * 0.0722;
      let red = 0, green = 0, blue = 0, weight = 0;
      for (let dy = -bounded; dy <= bounded; dy += 1) {
        for (let dx = -bounded; dx <= bounded; dx += 1) {
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sampleOffset = (sy * width + sx) * 4;
          const alpha = source[sampleOffset + 3] / 255;
          if (!alpha) continue;
          const sampleLuma =
            source[sampleOffset] * 0.2126 +
            source[sampleOffset + 1] * 0.7152 +
            source[sampleOffset + 2] * 0.0722;
          if (Math.abs(sampleLuma - targetLuma) > threshold) continue;
          const spatialWeight = 1 / (1 + dx * dx + dy * dy);
          const sampleWeight = spatialWeight * alpha;
          red += source[sampleOffset] * sampleWeight;
          green += source[sampleOffset + 1] * sampleWeight;
          blue += source[sampleOffset + 2] * sampleWeight;
          weight += sampleWeight;
        }
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + (red / weight) * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + (green / weight) * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + (blue / weight) * strength);
    }
  }
}

/**
 * Bounded Sobel edge extraction for Stylize → Find Edges.
 * The source buffer remains immutable, alpha and transparent RGB padding stay
 * byte-for-byte stable, and the effect stores only its amount metadata.
 */
function applyFindEdges(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const lumaAt = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(width - 1, x));
    const sy = Math.max(0, Math.min(height - 1, y));
    const offset = (sy * width + sx) * 4;
    return source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const alpha = source[destination + 3];
      if (!alpha) continue;
      const gx =
        -lumaAt(x - 1, y - 1) + lumaAt(x + 1, y - 1) -
        2 * lumaAt(x - 1, y) + 2 * lumaAt(x + 1, y) -
        lumaAt(x - 1, y + 1) + lumaAt(x + 1, y + 1);
      const gy =
        -lumaAt(x - 1, y - 1) - 2 * lumaAt(x, y - 1) - lumaAt(x + 1, y - 1) +
        lumaAt(x - 1, y + 1) + 2 * lumaAt(x, y + 1) + lumaAt(x + 1, y + 1);
      const edge = clampByte(Math.hypot(gx, gy) / 4);
      output[destination] = clampByte(source[destination] * (1 - strength) + edge * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + edge * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + edge * strength);
    }
  }
}

/**
 * Shape Blur approximation with a deterministic diamond aperture. The
 * Manhattan-distance kernel makes the selected shape explicit and bounded,
 * while alpha weighting prevents transparent padding halos.
 */
function applyShapeBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(12, Math.round(radius)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      let red = 0, green = 0, blue = 0, weight = 0;
      for (let dy = -bounded; dy <= bounded; dy += 1) {
        for (let dx = -bounded; dx <= bounded; dx += 1) {
          const distance = Math.abs(dx) + Math.abs(dy);
          if (distance > bounded) continue;
          const sx = x + dx, sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const sampleOffset = (sy * width + sx) * 4;
          const alpha = source[sampleOffset + 3] / 255;
          if (!alpha) continue;
          const sampleWeight = (bounded + 1 - distance) * alpha;
          red += source[sampleOffset] * sampleWeight;
          green += source[sampleOffset + 1] * sampleWeight;
          blue += source[sampleOffset + 2] * sampleWeight;
          weight += sampleWeight;
        }
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + (red / weight) * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + (green / weight) * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + (blue / weight) * strength);
    }
  }
}

function applyAverageBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  let red = 0,
    green = 0,
    blue = 0,
    weight = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4,
      alpha = source[offset + 3] / 255;
    if (!alpha) continue;
    red += source[offset] * alpha;
    green += source[offset + 1] * alpha;
    blue += source[offset + 2] * alpha;
    weight += alpha;
  }
  if (!weight) return;
  const average: [number, number, number] = [red / weight, green / weight, blue / weight],
    mix = clamp(strength, 0, 1);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (source[offset + 3] === 0) continue;
    output[offset] = clampByte(source[offset] * (1 - mix) + average[0] * mix);
    output[offset + 1] = clampByte(source[offset + 1] * (1 - mix) + average[1] * mix);
    output[offset + 2] = clampByte(source[offset + 2] * (1 - mix) + average[2] * mix);
  }
}

function applyBoxBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
  selector?: (x: number, y: number) => number,
): void {
  // Separable weighted running sums are linear in pixel count, independent
  // of radius. Alpha weighting avoids invisible padding causing dark halos.
  const bounded = Math.max(1, Math.min(64, Math.round(radius))),
    count = width * height,
    horizontalWeight = new Float32Array(count),
    horizontal = new Float32Array(count);
  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0,
        weight = 0,
        left = 0,
        right = Math.min(width - 1, bounded);
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4,
          alpha = source[offset + 3] / 255;
        sum += source[offset + channel] * alpha;
        weight += alpha;
      }
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        horizontal[index] = sum;
        horizontalWeight[index] = weight;
        const nextLeft = Math.max(0, x + 1 - bounded),
          nextRight = Math.min(width - 1, x + 1 + bounded);
        while (left < nextLeft) {
          const offset = (y * width + left) * 4,
            alpha = source[offset + 3] / 255;
          sum -= source[offset + channel] * alpha;
          weight -= alpha;
          left += 1;
        }
        while (right < nextRight) {
          right += 1;
          const offset = (y * width + right) * 4,
            alpha = source[offset + 3] / 255;
          sum += source[offset + channel] * alpha;
          weight += alpha;
        }
      }
    }
    for (let x = 0; x < width; x += 1) {
      let sum = 0,
        weight = 0,
        top = 0,
        bottom = Math.min(height - 1, bounded);
      for (let y = top; y <= bottom; y += 1) {
        sum += horizontal[y * width + x];
        weight += horizontalWeight[y * width + x];
      }
      for (let y = 0; y < height; y += 1) {
        const offset = (y * width + x) * 4,
          mix = clamp(strength * (selector?.(x, y) ?? 1), 0, 1);
        if (source[offset + 3] && weight > 0) {
          output[offset + channel] = clampByte(
            source[offset + channel] * (1 - mix) + (sum / weight) * mix,
          );
        }
        const nextTop = Math.max(0, y + 1 - bounded),
          nextBottom = Math.min(height - 1, y + 1 + bounded);
        while (top < nextTop) {
          sum -= horizontal[top * width + x];
          weight -= horizontalWeight[top * width + x];
          top += 1;
        }
        while (bottom < nextBottom) {
          bottom += 1;
          sum += horizontal[bottom * width + x];
          weight += horizontalWeight[bottom * width + x];
        }
      }
    }
  }
}

/**
 * Apply a bounded Field Blur approximation with editable per-pixel radius.
 * Each destination interpolates authored pin radii in normalized layer space,
 * then uses a fixed 25-sample disc kernel at that local radius. Alpha is
 * weighted for every sample, source alpha remains byte-for-byte unchanged,
 * and transparent RGB padding is never read into visible pixels.
 */
function applyFieldBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const pins = effect.fieldPoints?.length
    ? effect.fieldPoints
    : [{ x: effect.centerX, y: effect.centerY, radius: effect.radius }];
  const strength = clamp(effect.amount / 100, 0, 1);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      let radiusTotal = 0;
      let weightTotal = 0;
      for (const pin of pins) {
        const dx = x / Math.max(1, width - 1) - pin.x;
        const dy = y / Math.max(1, height - 1) - pin.y;
        const weight = 1 / (1 + (dx * dx + dy * dy) * 9);
        radiusTotal += pin.radius * weight;
        weightTotal += weight;
      }
      const localRadius = clamp(Math.round(weightTotal ? radiusTotal / weightTotal : effect.radius), 0, 64);
      if (!localRadius || !strength) continue;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alphaWeight = 0;
      for (let sampleIndex = 0; sampleIndex < 25; sampleIndex += 1) {
        const distance = localRadius * Math.sqrt((sampleIndex + 0.5) / 25);
        const angle = sampleIndex * goldenAngle;
        const sample = sourcePixelBilinear(
          source,
          width,
          height,
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
        );
        const alpha = sample[3] / 255;
        if (!alpha) continue;
        red += sample[0] * alpha;
        green += sample[1] * alpha;
        blue += sample[2] * alpha;
        alphaWeight += alpha;
      }
      if (!alphaWeight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + (red / alphaWeight) * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + (green / alphaWeight) * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + (blue / alphaWeight) * strength);
      output[destination + 3] = source[destination + 3];
    }
  }
}

/**
 * Apply a separable Gaussian kernel while weighting colour by alpha.
 *
 * The source alpha channel is never sampled into the output. Fully
 * transparent pixels therefore retain their hidden RGB padding and partially
 * transparent edges cannot introduce dark halos. The kernel is normalized at
 * the image edge so a tiny image remains stable for every valid radius.
 */
function applyGaussianBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(64, Math.round(radius))),
    sigma = Math.max(0.5, bounded / 3),
    kernel = new Float32Array(bounded * 2 + 1),
    count = width * height;
  let kernelTotal = 0;
  for (let offset = -bounded; offset <= bounded; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + bounded] = weight;
    kernelTotal += weight;
  }
  for (let index = 0; index < kernel.length; index += 1)
    kernel[index] /= kernelTotal;

  const horizontal = new Float32Array(count),
    horizontalWeight = new Float32Array(count);
  for (let channel = 0; channel < 3; channel += 1) {
    // Horizontal pass. At an edge the available kernel weights are
    // renormalized through the accumulated alpha-weight, avoiding a dark
    // border without inventing samples outside the source image.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let weight = 0;
        for (let offset = -bounded; offset <= bounded; offset += 1) {
          const sx = x + offset;
          if (sx < 0 || sx >= width) continue;
          const sourceOffset = (y * width + sx) * 4,
            alpha = source[sourceOffset + 3] / 255,
            kernelWeight = kernel[offset + bounded];
          sum += source[sourceOffset + channel] * alpha * kernelWeight;
          weight += alpha * kernelWeight;
        }
        const index = y * width + x;
        horizontal[index] = sum;
        horizontalWeight[index] = weight;
      }
    }

    // Vertical pass. Keep the original alpha and only replace RGB on source
    // pixels that contain coverage; transparent pixels remain byte-for-byte.
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let sum = 0;
        let weight = 0;
        for (let offset = -bounded; offset <= bounded; offset += 1) {
          const sy = y + offset;
          if (sy < 0 || sy >= height) continue;
          const index = sy * width + x,
            kernelWeight = kernel[offset + bounded];
          sum += horizontal[index] * kernelWeight;
          weight += horizontalWeight[index] * kernelWeight;
        }
        const index = y * width + x,
          outputOffset = index * 4,
          mix = clamp(strength, 0, 1);
        if (source[outputOffset + 3] && weight > 0)
          output[outputOffset + channel] = clampByte(
            source[outputOffset + channel] * (1 - mix) + (sum / weight) * mix,
          );
      }
    }
  }
}

/**
 * Apply a bounded directional blur while preserving source alpha and
 * transparent RGB padding. Samples are nearest-neighbour and symmetric
 * around each destination pixel, which keeps the result deterministic across
 * browsers and makes the effect safe for small images.
 */
function applyMotionBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  angle: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      const sums = [0, 0, 0];
      let weight = 0;
      for (let step = -bounded; step <= bounded; step += 1) {
        const sample = sourcePixel(source, width, height, x + dx * step, y + dy * step);
        const alpha = sample[3] / 255;
        if (!alpha) continue;
        sums[0] += sample[0] * alpha;
        sums[1] += sample[1] * alpha;
        sums[2] += sample[2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      const mix = clamp(strength, 0, 1);
      output[destination] = clampByte(source[destination] * (1 - mix) + (sums[0] / weight) * mix);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - mix) + (sums[1] / weight) * mix);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - mix) + (sums[2] / weight) * mix);
      output[destination + 3] = source[destination + 3];
    }
  }
}

/**
 * Apply a bounded spin-style radial blur around an editable centre point.
 *
 * The radius is an angular sweep in degrees (1..64) rather than a source
 * pixel radius. Samples stay on the same polar ring, which gives the effect
 * the familiar Photoshop Radial Blur / Spin behaviour without allocating a
 * second image or reading any pixels written during this pass.
 */
function applyRadialBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const centerPixelX = clamp(centerX, 0, 1) * (width - 1);
  const centerPixelY = clamp(centerY, 0, 1) * (height - 1);
  const sampleCount = 8;
  const sweep = (bounded * Math.PI) / 180;
  const mix = clamp(strength, 0, 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      const dx = x - centerPixelX;
      const dy = y - centerPixelY;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.5) continue;
      const baseAngle = Math.atan2(dy, dx);
      const sums = [0, 0, 0];
      let weight = 0;
      for (let sampleIndex = -sampleCount; sampleIndex <= sampleCount; sampleIndex += 1) {
        const angle = baseAngle + (sweep * sampleIndex) / sampleCount;
        const sample = sourcePixel(
          source,
          width,
          height,
          centerPixelX + Math.cos(angle) * distance,
          centerPixelY + Math.sin(angle) * distance,
        );
        const alpha = sample[3] / 255;
        if (!alpha) continue;
        sums[0] += sample[0] * alpha;
        sums[1] += sample[1] * alpha;
        sums[2] += sample[2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      output[destination] = clampByte(
        source[destination] * (1 - mix) + (sums[0] / weight) * mix,
      );
      output[destination + 1] = clampByte(
        source[destination + 1] * (1 - mix) + (sums[1] / weight) * mix,
      );
      output[destination + 2] = clampByte(
        source[destination + 2] * (1 - mix) + (sums[2] / weight) * mix,
      );
      output[destination + 3] = source[destination + 3];
    }
  }
}

/**
 * Apply the bounded Blur Gallery Spin Blur approximation. Spin is represented
 * by the same fixed-sample polar integration as Radial Blur, but has its own
 * metadata type so a document can distinguish the gallery command. The
 * centre and angular sweep are editable; no depth map or bokeh reconstruction
 * is inferred.
 */
function applySpinBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
  ellipse?: SpinBlurEllipse,
): void {
  if (!ellipse) {
    applyRadialBlur(source, width, height, radius, centerX, centerY, output, strength);
    return;
  }
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const centerPixelX = clamp(centerX, 0, 1) * (width - 1);
  const centerPixelY = clamp(centerY, 0, 1) * (height - 1);
  const rotation = (ellipse.rotation * Math.PI) / 180;
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const sampleCount = 8;
  const sweep = (bounded * Math.PI) / 180;
  const mix = clamp(strength, 0, 1);
  const feather = clamp(ellipse.feather, 0, 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      const dx = x - centerPixelX, dy = y - centerPixelY;
      const rotatedX = dx * cosine + dy * sine;
      const rotatedY = -dx * sine + dy * cosine;
      const ellipseDistance = Math.hypot(
        rotatedX / Math.max(1, ellipse.radiusX * width),
        rotatedY / Math.max(1, ellipse.radiusY * height),
      );
      if (ellipseDistance >= 1) continue;
      const mask = feather <= 0 || ellipseDistance <= 1 - feather
        ? 1
        : clamp((1 - ellipseDistance) / feather, 0, 1);
      const distance = Math.hypot(dx, dy);
      if (distance < 0.5) continue;
      const baseAngle = Math.atan2(dy, dx);
      const sums = [0, 0, 0];
      let weight = 0;
      for (let sampleIndex = -sampleCount; sampleIndex <= sampleCount; sampleIndex += 1) {
        const angle = baseAngle + (sweep * sampleIndex) / sampleCount;
        const sample = sourcePixel(
          source,
          width,
          height,
          centerPixelX + Math.cos(angle) * distance,
          centerPixelY + Math.sin(angle) * distance,
        );
        const alpha = sample[3] / 255;
        if (!alpha) continue;
        sums[0] += sample[0] * alpha;
        sums[1] += sample[1] * alpha;
        sums[2] += sample[2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      const blend = mix * mask;
      output[destination] = clampByte(source[destination] * (1 - blend) + (sums[0] / weight) * blend);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - blend) + (sums[1] / weight) * blend);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - blend) + (sums[2] / weight) * blend);
      output[destination + 3] = source[destination + 3];
    }
  }
}

/**
 * Apply a bounded Path Blur approximation using one deterministic quadratic
 * path per pixel. Authored normalized points select the nearest segment and
 * interpolate endpoint speed; legacy records without points retain the
 * centre/angle approximation. Sampling is source-only, alpha-aware and
 * clamped to the canvas.
 */
function applyPathBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  angle: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
  path?: BlurPathPoint[],
  pathCentered = true,
  pathTaper = 0,
): void {
  if (!path || path.length < 2) {
    applyLegacyPathBlur(source, width, height, radius, angle, centerX, centerY, output, strength);
    return;
  }
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const points = path.map((point) => ({ x: point.x * (width - 1), y: point.y * (height - 1), speed: point.speed }));
  const segments = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const dx = end.x - start.x, dy = end.y - start.y;
    return { start, end, dx, dy, lengthSquared: Math.max(1e-6, dx * dx + dy * dy), length: Math.hypot(dx, dy) };
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const mix = clamp(strength, 0, 1);
  const sampleCount = 8;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      let bestDistance = Infinity, bestT = 0, bestSegment = segments[0], distanceAlong = 0, bestDistanceAlong = 0;
      for (const segment of segments) {
        const projection = clamp(((x - segment.start.x) * segment.dx + (y - segment.start.y) * segment.dy) / segment.lengthSquared, 0, 1);
        const nearestX = segment.start.x + segment.dx * projection;
        const nearestY = segment.start.y + segment.dy * projection;
        const distance = Math.hypot(x - nearestX, y - nearestY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestT = projection;
          bestSegment = segment;
          bestDistanceAlong = distanceAlong + segment.length * projection;
        }
        distanceAlong += segment.length;
      }
      const influence = clamp(1 - bestDistance / Math.max(1, bounded * 2), 0, 1);
      if (influence <= 0) continue;
      const speedStart = bestSegment.start.speed, speedEnd = bestSegment.end.speed;
      const speed = (speedStart + (speedEnd - speedStart) * bestT) / 100;
      const taperDistance = totalLength > 0 ? bestDistanceAlong / totalLength : 0;
      const taper = 1 - clamp(pathTaper, 0, 1) * Math.max(taperDistance, 1 - taperDistance);
      const length = bounded * Math.max(0, speed) * taper;
      if (length < 0.5) continue;
      const direction = Math.atan2(bestSegment.dy, bestSegment.dx) + (angle * Math.PI) / 180;
      const tangentX = Math.cos(direction), tangentY = Math.sin(direction);
      const start = pathCentered ? -sampleCount : 0;
      const end = pathCentered ? sampleCount : sampleCount;
      const sums = [0, 0, 0];
      let weight = 0;
      for (let index = start; index <= end; index += 1) {
        const t = index / sampleCount;
        const sample = sourcePixelBilinear(source, width, height, x + tangentX * length * t, y + tangentY * length * t);
        const alpha = sample[3] / 255;
        if (!alpha) continue;
        sums[0] += sample[0] * alpha;
        sums[1] += sample[1] * alpha;
        sums[2] += sample[2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      const blend = mix * influence;
      output[destination] = clampByte(source[destination] * (1 - blend) + (sums[0] / weight) * blend);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - blend) + (sums[1] / weight) * blend);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - blend) + (sums[2] / weight) * blend);
      output[destination + 3] = source[destination + 3];
    }
  }
}

function applyLegacyPathBlur(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  angle: number,
  centerX: number,
  centerY: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const bounded = Math.max(1, Math.min(64, Math.round(radius)));
  const radians = (angle * Math.PI) / 180;
  const tangentX = Math.cos(radians),
    tangentY = Math.sin(radians),
    normalX = -tangentY,
    normalY = tangentX,
    centrePixelX = clamp(centerX, 0, 1) * (width - 1),
    centrePixelY = clamp(centerY, 0, 1) * (height - 1),
    maxDimension = Math.max(1, Math.max(width, height)),
    sampleCount = 8,
    mix = clamp(strength, 0, 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      // Points farther from the centre bend more strongly, while the centre
      // remains a straight directional path and therefore predictable.
      const centreOffset =
        ((x - centrePixelX) * normalX + (y - centrePixelY) * normalY) /
        maxDimension;
      const curve = clamp(centreOffset, -1, 1) * bounded * 0.85;
      const sums = [0, 0, 0];
      let weight = 0;
      for (let index = -sampleCount; index <= sampleCount; index += 1) {
        const t = index / sampleCount;
        const sample = sourcePixelBilinear(
          source,
          width,
          height,
          x + tangentX * bounded * t + normalX * curve * t * t,
          y + tangentY * bounded * t + normalY * curve * t * t,
        );
        const alpha = sample[3] / 255;
        if (!alpha) continue;
        sums[0] += sample[0] * alpha;
        sums[1] += sample[1] * alpha;
        sums[2] += sample[2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - mix) + (sums[0] / weight) * mix);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - mix) + (sums[1] / weight) * mix);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - mix) + (sums[2] / weight) * mix);
      output[destination + 3] = source[destination + 3];
    }
  }
}

function applyMosaic(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const cell = Math.max(2, Math.min(64, Math.round(radius)));
  for (let originY = 0; originY < height; originY += cell) {
    for (let originX = 0; originX < width; originX += cell) {
      const right = Math.min(width, originX + cell),
        bottom = Math.min(height, originY + cell);
      let red = 0,
        green = 0,
        blue = 0,
        weight = 0;
      for (let y = originY; y < bottom; y += 1) {
        for (let x = originX; x < right; x += 1) {
          const offset = (y * width + x) * 4,
            alpha = source[offset + 3] / 255;
          red += source[offset] * alpha;
          green += source[offset + 1] * alpha;
          blue += source[offset + 2] * alpha;
          weight += alpha;
        }
      }
      if (!weight) continue;
      const average: [number, number, number, number] = [
        red / weight, green / weight, blue / weight, 255,
      ];
      for (let y = originY; y < bottom; y += 1) {
        for (let x = originX; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          if (source[offset + 3]) blendPixel(output, offset, average, strength);
        }
      }
    }
  }
}

/**
 * Average four diagonally offset copies of the immutable source. Each copy
 * contributes by its sampled alpha so invisible RGB cannot tint the result;
 * destination alpha remains source-owned. Clamped coordinates keep small
 * images and edge pixels deterministic without wrapping or canvas expansion.
 * This local Fragment contract uses exactly four samples per visible pixel.
 */
function applyFragment(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const distance = Math.max(1, Math.min(64, Math.round(radius)));
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - distance),
      bottom = Math.min(height - 1, y + distance);
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const left = Math.max(0, x - distance),
        right = Math.min(width - 1, x + distance);
      let red = 0, green = 0, blue = 0, weight = 0;
      for (let copy = 0; copy < 4; copy += 1) {
        const sampleX = copy % 2 === 0 ? left : right,
          sampleY = copy < 2 ? top : bottom,
          offset = (sampleY * width + sampleX) * 4,
          alpha = source[offset + 3];
        red += source[offset] * alpha;
        green += source[offset + 1] * alpha;
        blue += source[offset + 2] * alpha;
        weight += alpha;
      }
      if (!weight) continue;
      output[destination] = clampByte(source[destination] * (1 - strength) + red / weight * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + green / weight * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + blue / weight * strength);
    }
  }
}

function applyColorHalftone(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const cell = Math.max(2, Math.min(64, Math.round(effect.radius)));
  const settings = effect.colorHalftone ?? DEFAULT_COLOR_HALFTONE_SETTINGS;
  const centreX = (width - 1) * 0.5;
  const centreY = (height - 1) * 0.5;
  const plates = [
    { angle: settings.cyanAngle, channel: 'cyan' as const },
    { angle: settings.magentaAngle, channel: 'magenta' as const },
    { angle: settings.yellowAngle, channel: 'yellow' as const },
    { angle: settings.blackAngle, channel: 'black' as const },
  ];

  // Find the nearest cell centre in a rotated screen. The same source sample
  // is used for every pixel in a plate cell, producing stable dots even when
  // the destination is rendered in tiles or after a project reload.
  const dotCoverage = (x: number, y: number, angle: number, ink: number) => {
    if (ink <= 0) return { coverage: 0, sampleX: x, sampleY: y };
    const radians = (angle * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const dx = x - centreX;
    const dy = y - centreY;
    const rotatedX = dx * cosine + dy * sine;
    const rotatedY = -dx * sine + dy * cosine;
    const cellX = Math.round(rotatedX / cell) * cell;
    const cellY = Math.round(rotatedY / cell) * cell;
    const localX = rotatedX - cellX;
    const localY = rotatedY - cellY;
    const distance = Math.hypot(localX, localY);
    // Dot area is proportional to ink density. A one-pixel antialias ramp
    // keeps small cells from producing harsh stair-steps without expanding
    // the canvas or reading hidden RGB from transparent neighbours.
    const radius = cell * 0.5 * Math.sqrt(clamp(ink, 0, 1)) * 0.96;
    const coverage = clamp(radius + 0.75 - distance, 0, 1);
    return {
      coverage,
      sampleX: centreX + cellX * cosine - cellY * sine,
      sampleY: centreY + cellX * sine + cellY * cosine,
    };
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4,
        alpha = source[offset + 3];
      if (alpha === 0) continue;
      let red = 255;
      let green = 255;
      let blue = 255;
      for (const plate of plates) {
        const probe = dotCoverage(x, y, plate.angle, 1);
        const sample = sourcePixelBilinear(source, width, height, probe.sampleX, probe.sampleY);
        // If the rotated cell centre lands outside the visible asset, use the
        // destination's source colour. This keeps partial-alpha edges stable.
        const sampleRed = sample[3] ? sample[0] : source[offset];
        const sampleGreen = sample[3] ? sample[1] : source[offset + 1];
        const sampleBlue = sample[3] ? sample[2] : source[offset + 2];
        const redUnit = sampleRed / 255;
        const greenUnit = sampleGreen / 255;
        const blueUnit = sampleBlue / 255;
        const key = 1 - Math.max(redUnit, greenUnit, blueUnit);
        const denominator = Math.max(1e-6, 1 - key);
        const cyan = (1 - redUnit - key) / denominator;
        const magenta = (1 - greenUnit - key) / denominator;
        const yellow = (1 - blueUnit - key) / denominator;
        const ink = plate.channel === 'cyan'
          ? cyan
          : plate.channel === 'magenta'
            ? magenta
            : plate.channel === 'yellow'
              ? yellow
              : key;
        const dot = dotCoverage(x, y, plate.angle, ink).coverage;
        if (plate.channel === 'cyan') red *= 1 - dot;
        else if (plate.channel === 'magenta') green *= 1 - dot;
        else if (plate.channel === 'yellow') blue *= 1 - dot;
        else {
          red *= 1 - dot;
          green *= 1 - dot;
          blue *= 1 - dot;
        }
      }
      blendPixel(output, offset, [red, green, blue, alpha], strength);
    }
  }
}

/**
 * Conservative local composite-envelope limiter. Y' uses gamma-encoded RGB;
 * hypot(I,Q) bounds the chroma excursion around Y'. Unsafe colours move
 * toward equal-RGB gray while retaining Y' and chroma direction. Reserving
 * one byte of headroom bounds quantization at the signal limits. This does
 * not model an encoder, receiver, ICC conversion, setup or chroma bandwidth.
 * Work is O(pixels), constant scratch space, with one caller-owned output.
 */
function applyNtscColors(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  strength: number,
): void {
  for (let offset = 0; offset < source.length; offset += 4) {
    if (source[offset + 3] === 0) continue;
    const red = source[offset] / 255;
    const green = source[offset + 1] / 255;
    const blue = source[offset + 2] / 255;
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
    const inPhase = 0.596 * red - 0.274 * green - 0.322 * blue;
    const quadrature = 0.211 * red - 0.523 * green + 0.312 * blue;
    const chroma = Math.hypot(inPhase, quadrature);
    const headroom = Math.min(luma, 1 - luma);
    if (chroma <= headroom) continue;
    const scale = Math.max(0, headroom - 1 / 255) / chroma;
    const blendScale = 1 - strength * (1 - scale);
    output[offset] = clampByte((luma + (red - luma) * blendScale) * 255);
    output[offset + 1] = clampByte((luma + (green - luma) * blendScale) * 255);
    output[offset + 2] = clampByte((luma + (blue - luma) * blendScale) * 255);
  }
}

/**
 * Apply a bounded seeded monochrome-grain approximation of Photoshop
 * Mezzotint. The source is converted to luminance and compared with a
 * deterministic, cell-aware threshold field. Amount blends the binary grain
 * back into the immutable source; at 100% every visible pixel is grayscale.
 * Alpha and fully transparent RGB padding stay source-owned and the canvas
 * bounds never change.
 */
function applyMezzotint(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const cell = Math.max(1, Math.min(64, Math.round(effect.radius)));
  const grain = effect.mezzotint?.grain ?? DEFAULT_MEZZOTINT_SETTINGS.grain;
  const scale = grain === 'fine' ? 0.5 : grain === 'coarse' ? 1.75 : 1;
  const grainCell = Math.max(1, Math.round(cell * scale));
  const seed = effect.seed >>> 0;
  const hash = (x: number, y: number): number => {
    let value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const randomAt = (x: number, y: number): number => {
    // Blend a per-pixel component with a cell component. This preserves a
    // coherent larger grain when coarse mode is selected while avoiding a
    // visible block grid in fine mode.
    const local = hash(x, y);
    const coarse = hash(Math.floor(x / grainCell), Math.floor(y / grainCell));
    const blend = grain === 'fine' ? 0.85 : grain === 'coarse' ? 0.35 : 0.6;
    return local * blend + coarse * (1 - blend);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const alpha = source[destination + 3];
      if (!alpha) continue;
      const luminance =
        (source[destination] * 54 +
          source[destination + 1] * 183 +
          source[destination + 2] * 19) /
        256;
      // A seeded threshold makes dark regions collect black grain and light
      // regions collect white grain, which is the key monochrome Mezzotint
      // behavior while staying bounded and reproducible offline.
      const threshold = randomAt(x, y) * 255;
      const monochrome = luminance >= threshold ? 255 : 0;
      output[destination] = clampByte(source[destination] * (1 - strength) + monochrome * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + monochrome * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + monochrome * strength);
      output[destination + 3] = alpha;
    }
  }
}

/**
 * Apply a bounded deterministic approximation of Photoshop Render → Clouds.
 *
 * Photoshop's Clouds command creates a procedural foreground/background
 * texture. PixelForge keeps the operation nondestructive and local by
 * generating a seeded, multi-octave value-noise field and blending it into
 * the visible source pixels. `radius` controls the largest noise scale,
 * `amount` controls the blend strength and `seed` makes the result replayable
 * after a draft/project round trip. Source alpha and transparent RGB padding
 * remain byte-for-byte stable; no canvas expansion or upload is involved.
 */
function applyClouds(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const scale = Math.max(2, Math.min(128, Math.round(effect.radius * 2)));
  const seed = effect.seed >>> 0;
  const hash = (x: number, y: number, salt: number): number => {
    let value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 1442695041) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const smooth = (value: number) => value * value * (3 - 2 * value);
  const valueNoise = (x: number, y: number, salt: number): number => {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const tx = smooth(x - left);
    const ty = smooth(y - top);
    const topLeft = hash(left, top, salt);
    const topRight = hash(left + 1, top, salt);
    const bottomLeft = hash(left, top + 1, salt);
    const bottomRight = hash(left + 1, top + 1, salt);
    const topMix = topLeft + (topRight - topLeft) * tx;
    const bottomMix = bottomLeft + (bottomRight - bottomLeft) * tx;
    return topMix + (bottomMix - topMix) * ty;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!source[offset + 3]) continue;
      let value = 0;
      let amplitude = 1;
      let amplitudeTotal = 0;
      for (let octave = 0; octave < 4; octave += 1) {
        const frequency = 2 ** octave;
        value += valueNoise((x / scale) * frequency, (y / scale) * frequency, octave + 1) * amplitude;
        amplitudeTotal += amplitude;
        amplitude *= 0.5;
      }
      const cloud = (value / amplitudeTotal) * 255;
      blendPixel(output, offset, [cloud, cloud, cloud, source[offset + 3]], strength);
    }
  }
}

/**
 * Apply a bounded seeded Difference Clouds approximation.
 *
 * Photoshop's Difference Clouds starts from the current foreground/background
 * colours and repeatedly difference-blends a procedural cloud field. PixelForge
 * keeps this first local slice deterministic and source-safe: a monochrome,
 * multi-octave value-noise field is difference-blended against the immutable
 * source, while amount, cloud scale and seed remain editable metadata. It does
 * not claim Photoshop's colour-pair controls, wrap-around or exact noise
 * implementation.
 */
function applyDifferenceClouds(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const scale = Math.max(2, Math.min(64, Math.round(effect.radius)));
  const seed = effect.seed >>> 0;
  const hash = (x: number, y: number): number => {
    let value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const smooth = (value: number) => value * value * (3 - 2 * value);
  const lattice = (x: number, y: number): number => {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const tx = smooth(x - left);
    const ty = smooth(y - top);
    const topLeft = hash(left, top);
    const topRight = hash(left + 1, top);
    const bottomLeft = hash(left, top + 1);
    const bottomRight = hash(left + 1, top + 1);
    const upper = topLeft + (topRight - topLeft) * tx;
    const lower = bottomLeft + (bottomRight - bottomLeft) * tx;
    return upper + (lower - upper) * ty;
  };
  const cloud = (x: number, y: number): number => {
    let sampleX = x / scale;
    let sampleY = y / scale;
    let amplitude = 0.5;
    let total = 0;
    let value = 0;
    for (let octave = 0; octave < 4; octave += 1) {
      value += lattice(sampleX, sampleY) * amplitude;
      total += amplitude;
      sampleX *= 2;
      sampleY *= 2;
      amplitude *= 0.5;
    }
    return total ? value / total : 0.5;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const alpha = source[destination + 3];
      if (!alpha) continue;
      const generated = cloud(x, y) * 255;
      output[destination] = clampByte(source[destination] * (1 - strength) + Math.abs(source[destination] - generated) * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + Math.abs(source[destination + 1] - generated) * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + Math.abs(source[destination + 2] - generated) * strength);
      output[destination + 3] = alpha;
    }
  }
}

/**
 * Apply a bounded seeded flame-field approximation of Photoshop Flame.
 *
 * The local renderer synthesizes a warm, rising field from a few hashed
 * noise octaves and a sinusoidal lick pattern. It deliberately keeps the
 * canvas bounds, source alpha, and transparent RGB padding unchanged. The
 * Photoshop path/shape, foreground/background color, frame rendering and
 * physically based turbulence controls remain staged.
 */
function applyFlame(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const detail = Math.max(2, Math.min(64, Math.round(effect.radius)));
  const seed = effect.seed >>> 0;
  const hash = (x: number, y: number): number => {
    let value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const noise = (x: number, y: number): number => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const tx = x - x0, ty = y - y0;
    const smooth = (value: number) => value * value * (3 - 2 * value);
    const sx = smooth(tx), sy = smooth(ty);
    const top = hash(x0, y0) * (1 - sx) + hash(x0 + 1, y0) * sx;
    const bottom = hash(x0, y0 + 1) * (1 - sx) + hash(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  const originX = effect.centerX;
  const originY = clamp(effect.centerY, 0.2, 0.95);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = source[offset + 3];
      if (!alpha) continue;
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      // A flame is rooted near the authored origin and loses energy as it
      // rises. A soft horizontal falloff gives the deterministic field a
      // bounded plume rather than tinting the whole image uniformly.
      const rise = clamp((ny - originY + 0.16) / 0.82, 0, 1);
      const horizontal = clamp(1 - Math.abs(nx - originX) / 0.72, 0, 1);
      if (rise <= 0 || horizontal <= 0) continue;
      const detailScale = Math.max(1, detail / 8);
      const fine = noise(nx * width / detailScale + seed * 0.001, ny * height / detailScale);
      const broad = noise(nx * width / (detailScale * 2.7) + 11.7, ny * height / (detailScale * 2.7) - 7.2);
      const lick = 0.5 + 0.5 * Math.sin(
        nx * Math.PI * (5.5 + detailScale) + fine * 5.2 - (1 - rise) * 4.7,
      );
      const intensity = clamp(
        horizontal * rise * (0.3 + broad * 0.45 + fine * 0.35) * (0.45 + lick * 0.7),
        0,
        1,
      );
      if (intensity <= 0.01) continue;
      const hot = clamp(intensity * 1.45, 0, 1);
      const flame: [number, number, number, number] = [
        255,
        clampByte(30 + hot * 215),
        clampByte(3 + (1 - hot) * 38),
        alpha,
      ];
      blendPixel(output, offset, flame, strength * intensity);
    }
  }
}

/**
 * Apply a bounded directional Emboss approximation.
 *
 * A signed luminance gradient is converted to a neutral relief tone and
 * blended over visible source pixels. Angle controls the light direction and
 * amount controls relief strength; alpha and transparent RGB remain source
 * owned, making the effect safe for nondestructive local drafts.
 */
function applyEmboss(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const radians = (effect.angle * Math.PI) / 180;
  const lightX = Math.cos(radians), lightY = Math.sin(radians);
  const depth = Math.max(1, Math.min(8, Math.round(effect.radius / 8)));
  const luminance = (x: number, y: number): number => {
    const sx = clamp(Math.round(x), 0, width - 1), sy = clamp(Math.round(y), 0, height - 1);
    const offset = (sy * width + sx) * 4;
    return (source[offset] * 54 + source[offset + 1] * 183 + source[offset + 2] * 19) / 256;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const alpha = source[offset + 3];
    if (!alpha) continue;
    const forward = luminance(x + lightX * depth, y + lightY * depth);
    const backward = luminance(x - lightX * depth, y - lightY * depth);
    const relief = clamp(128 + (forward - backward) * 1.6, 0, 255);
    output[offset] = clampByte(source[offset] * (1 - strength) + relief * strength);
    output[offset + 1] = clampByte(source[offset + 1] * (1 - strength) + relief * strength);
    output[offset + 2] = clampByte(source[offset + 2] * (1 - strength) + relief * strength);
    output[offset + 3] = alpha;
  }
}

/**
 * Apply a bounded seeded Tree approximation for Render → Tree.
 *
 * The renderer creates a small recursive branch graph and deterministic leaf
 * disks directly over visible pixels. It keeps the canvas, alpha channel and
 * transparent RGB padding unchanged; branch count, leafiness and seed are
 * persisted so a local draft replays exactly without generated assets.
 */
function applyTree(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const settings = effect.tree ?? DEFAULT_TREE_SETTINGS;
  const branchCount = Math.max(2, Math.min(8, Math.round(settings.branches)));
  const leafiness = clamp(settings.leafiness, 0, 100) / 100;
  const seed = effect.seed >>> 0;
  const random = (key: number): number => {
    let value = (Math.imul(key | 0, 374761393) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number; width: number }> = [];
  const leaves: Array<{ x: number; y: number; radius: number }> = [];
  const baseX = clamp(effect.centerX, 0, 1) * (width - 1);
  const baseY = clamp(effect.centerY, 0.2, 0.98) * (height - 1);
  const unit = Math.max(2, Math.min(width, height) * 0.16);
  const maxDepth = 4;
  const grow = (x: number, y: number, length: number, angle: number, depth: number, key: number): void => {
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    segments.push({ x1: x, y1: y, x2: endX, y2: endY, width: Math.max(1, length * 0.12) });
    if (depth >= maxDepth) {
      if (random(key + 11) <= leafiness) leaves.push({ x: endX, y: endY, radius: Math.max(1, length * 0.22) });
      return;
    }
    const children = depth === 0 ? branchCount : 2;
    for (let index = 0; index < children; index += 1) {
      const spread = depth === 0 ? 1.35 : 1.05;
      const offset = (index - (children - 1) / 2) * (spread / Math.max(1, children - 1));
      const jitter = (random(key + index * 17) - 0.5) * 0.28;
      grow(endX, endY, length * (0.58 + random(key + index * 23) * 0.12), angle + offset + jitter, depth + 1, key * 31 + index + 1);
    }
  };
  grow(baseX, baseY, unit, -Math.PI / 2, 0, 1);
  const drawCircle = (cx: number, cy: number, radius: number, colour: [number, number, number, number]): void => {
    const left = Math.max(0, Math.floor(cx - radius));
    const right = Math.min(width - 1, Math.ceil(cx + radius));
    const top = Math.max(0, Math.floor(cy - radius));
    const bottom = Math.min(height - 1, Math.ceil(cy + radius));
    const radiusSquared = radius * radius;
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radiusSquared) continue;
      const offset = (y * width + x) * 4;
      if (source[offset + 3]) blendPixel(output, offset, colour, strength * 0.8);
    }
  };
  for (const segment of segments) {
    const minX = Math.max(0, Math.floor(Math.min(segment.x1, segment.x2) - segment.width));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(segment.x1, segment.x2) + segment.width));
    const minY = Math.max(0, Math.floor(Math.min(segment.y1, segment.y2) - segment.width));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(segment.y1, segment.y2) + segment.width));
    const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
    const lengthSquared = Math.max(1, dx * dx + dy * dy);
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const t = clamp(((x - segment.x1) * dx + (y - segment.y1) * dy) / lengthSquared, 0, 1);
      const nearX = segment.x1 + t * dx, nearY = segment.y1 + t * dy;
      if ((x - nearX) ** 2 + (y - nearY) ** 2 > segment.width ** 2) continue;
      const offset = (y * width + x) * 4;
      if (source[offset + 3]) blendPixel(output, offset, [72, 42, 22, source[offset + 3]], strength * 0.75);
    }
  }
  for (const leaf of leaves) drawCircle(leaf.x, leaf.y, leaf.radius, [42, 150, 62, 255]);
}

/**
 * Apply a bounded seeded Fibers approximation.
 *
 * Photoshop Fibers creates a foreground/background filament field. PixelForge
 * keeps the local renderer deterministic and nondestructive: a seeded,
 * anisotropic multi-octave field forms narrow vertical filaments, then blends
 * a neutral generated tone into visible source pixels. Alpha and transparent
 * RGB padding remain byte-for-byte unchanged. This does not claim Photoshop's
 * colour controls, exact noise distribution or wrap-around behaviour.
 */
function applyFibers(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const scale = Math.max(2, Math.min(64, Math.round(effect.radius)));
  const variance = (effect.fibers?.variance ?? DEFAULT_FIBERS_SETTINGS.variance) / 64;
  const seed = effect.seed >>> 0;
  const hash = (x: number, y: number): number => {
    let value = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const smooth = (value: number): number => value * value * (3 - 2 * value);
  const lattice = (x: number, y: number): number => {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const tx = smooth(x - left);
    const ty = smooth(y - top);
    const topLeft = hash(left, top);
    const topRight = hash(left + 1, top);
    const bottomLeft = hash(left, top + 1);
    const bottomRight = hash(left + 1, top + 1);
    const upper = topLeft + (topRight - topLeft) * tx;
    const lower = bottomLeft + (bottomRight - bottomLeft) * tx;
    return upper + (lower - upper) * ty;
  };
  const field = (x: number, y: number): number => {
    // A low-frequency warp bends the vertical fibres, while two narrower
    // octaves preserve filament detail without unbounded per-pixel work.
    const warp = (lattice(x / (scale * 1.7), y / (scale * 2.2)) - 0.5) * variance * scale * 1.8;
    let sampleX = (x + warp) / Math.max(1, scale * 0.42);
    let sampleY = y / scale;
    let amplitude = 0.58;
    let total = 0;
    let value = 0;
    for (let octave = 0; octave < 3; octave += 1) {
      value += lattice(sampleX, sampleY) * amplitude;
      total += amplitude;
      sampleX *= 2;
      sampleY *= 0.72;
      amplitude *= 0.5;
    }
    const normalized = total ? value / total : 0.5;
    // Increase contrast as variance rises so the result reads as filaments.
    const contrast = 0.75 + variance * 0.85;
    return clamp(0.5 + (normalized - 0.5) * contrast, 0, 1);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const alpha = source[destination + 3];
      if (!alpha) continue;
      const filament = field(x, y);
      const generated = 18 + filament * 232;
      output[destination] = clampByte(source[destination] * (1 - strength) + generated * strength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - strength) + generated * strength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - strength) + generated * strength);
      output[destination + 3] = alpha;
    }
  }
}

/**
 * Apply a bounded Voronoi-cell approximation of Photoshop Crystallize.
 * Jittered cell centres are derived from the persisted seed, so the effect is
 * reproducible without storing generated pixels. Alpha and transparent RGB
 * padding remain source-owned; only visible colour channels are blended.
 */
function applyCrystallize(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  seed: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const cell = Math.max(2, Math.min(64, Math.round(radius)));
  const hash = (x: number, y: number) => {
    let value = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff - 0.5;
  };
  const centre = (cellX: number, cellY: number) => ({
    x: cellX * cell + cell * (0.5 + hash(cellX, cellY) * 0.34),
    y: cellY * cell + cell * (0.5 + hash(cellX + 97, cellY - 53) * 0.34),
  });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!source[offset + 3]) continue;
      const baseX = Math.floor(x / cell), baseY = Math.floor(y / cell);
      let selected = centre(baseX, baseY), best = Infinity;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const candidate = centre(baseX + dx, baseY + dy),
            distance = (candidate.x - x) ** 2 + (candidate.y - y) ** 2;
          if (distance < best) {
            best = distance;
            selected = candidate;
          }
        }
      }
      const sample = sourcePixel(source, width, height, selected.x, selected.y);
      if (sample[3]) blendPixel(output, offset, sample, strength);
    }
  }
}

/**
 * Apply a bounded triangular-facet approximation of Photoshop Facet.
 *
 * Each cell is split into four deterministic triangles around its centre and
 * every triangle receives its own alpha-weighted source average. This keeps
 * the effect visibly faceted without baking pixels into the source asset or
 * sampling transparent RGB padding. The seeded diagonal/orientation makes
 * the result stable across renders and project round trips.
 */
function applyFacet(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  seed: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const cell = Math.max(2, Math.min(64, Math.round(radius)));
  const hash = (x: number, y: number) => {
    let value = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const triangleFor = (x: number, y: number, originX: number, originY: number, orientation: number): number => {
    let u = (x - originX + 0.5) / cell;
    let v = (y - originY + 0.5) / cell;
    u = clamp(u, 0, 1);
    v = clamp(v, 0, 1);
    // Rotate the four-triangle partition so neighbouring cells do not form a
    // repetitive grid. The centre remains shared by every facet.
    if (orientation === 1) [u, v] = [v, 1 - u];
    else if (orientation === 2) [u, v] = [1 - u, 1 - v];
    else if (orientation === 3) [u, v] = [1 - v, u];
    if (v <= u && v <= 1 - u) return 0; // top
    if (u >= v && u >= 1 - v) return 1; // right
    if (v >= u && v >= 1 - u) return 2; // bottom
    return 3; // left
  };
  for (let originY = 0; originY < height; originY += cell) {
    for (let originX = 0; originX < width; originX += cell) {
      const right = Math.min(width, originX + cell);
      const bottom = Math.min(height, originY + cell);
      const orientation = Math.floor(hash(Math.floor(originX / cell), Math.floor(originY / cell)) * 4);
      const sums = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
      for (let y = originY; y < bottom; y += 1) {
        for (let x = originX; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          const alpha = source[offset + 3] / 255;
          if (!alpha) continue;
          const triangle = triangleFor(x, y, originX, originY, orientation);
          const sum = sums[triangle];
          sum[0] += source[offset] * alpha;
          sum[1] += source[offset + 1] * alpha;
          sum[2] += source[offset + 2] * alpha;
          sum[3] += alpha;
        }
      }
      for (let y = originY; y < bottom; y += 1) {
        for (let x = originX; x < right; x += 1) {
          const offset = (y * width + x) * 4;
          if (!source[offset + 3]) continue;
          const sum = sums[triangleFor(x, y, originX, originY, orientation)];
          if (!sum[3]) continue;
          blendPixel(output, offset, [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3], 255], strength);
          output[offset + 3] = source[offset + 3];
        }
      }
    }
  }
}

function applyDistort(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const amount = effect.amount / 100,
    centerX = effect.centerX * (width - 1),
    centerY = effect.centerY * (height - 1),
    radius =
      effect.type === 'pinch'
        ? Math.max(
            1,
            (Math.min(width, height) * 0.7 * Math.max(1, effect.radius)) / 64,
          )
        : Math.max(1, Math.min(width, height) * 0.7),
    angle = (effect.angle * Math.PI) / 180;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX,
        dy = y - centerY,
        distance = Math.hypot(dx, dy),
        normalized = clamp(distance / radius, 0, 1),
        offset = (y * width + x) * 4;
      if (source[offset + 3] === 0) continue;
      let sampleX = x,
        sampleY = y;
      if (effect.type === 'twirl' && distance < radius) {
        const turn = angle * amount * (1 - normalized) * (1 - normalized),
          cosine = Math.cos(turn),
          sine = Math.sin(turn);
        sampleX = centerX + dx * cosine - dy * sine;
        sampleY = centerY + dx * sine + dy * cosine;
      } else if (effect.type === 'pinch' && distance < radius) {
        // Inverse-map the destination into a bounded radial influence. A
        // positive amount pulls pixels toward the editable centre while the
        // squared falloff leaves the edge of the influence continuous. The
        // source is sampled only; output never feeds a later pixel, so the
        // operation remains deterministic and nondestructive.
        const falloff = 1 - normalized;
        const scale = 1 - amount * falloff * falloff;
        sampleX = centerX + dx * scale;
        sampleY = centerY + dy * scale;
      } else if (effect.type === 'spherize' && distance < radius) {
        // Inverse-map a bounded spherical bulge with a smooth edge falloff.
        // The exact centre and influence boundary remain stable.
        const falloff = 1 - normalized * normalized;
        const scale = 1 - amount * 0.5 * falloff;
        sampleX = centerX + dx * scale;
        sampleY = centerY + dy * scale;
      } else if (effect.type === 'ripple') {
        const wave = Math.sin(distance / Math.max(1, effect.radius || 8) * Math.PI * 2) * amount * Math.max(1, effect.radius || 8);
        sampleX = x + (dx / Math.max(1, distance)) * wave;
        sampleY = y + (dy / Math.max(1, distance)) * wave;
      }
      const sample =
        (effect.type === 'pinch' || effect.type === 'spherize' || effect.type === 'ripple')
          ? sourcePixelBilinear(source, width, height, sampleX, sampleY)
          : sourcePixel(source, width, height, sampleX, sampleY);
      if (sample[3] === 0) continue;
      output[offset] = sample[0];
      output[offset + 1] = sample[1];
      output[offset + 2] = sample[2];
      output[offset + 3] = source[offset + 3];
    }
  }
}

/**
 * Apply a bounded directional wave displacement. The wave travels along the
 * editable angle and displaces pixels on its perpendicular axis. Every
 * destination samples the immutable source with premultiplied-alpha
 * bilinear interpolation, so transparent RGB padding cannot bleed into
 * visible edges while the destination alpha byte remains unchanged.
 */
function applyWave(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const amount = effect.amount / 100,
    wavelength = Math.max(1, Math.min(64, Math.round(effect.radius || 8))),
    radians = (effect.angle * Math.PI) / 180,
    axisX = Math.cos(radians),
    axisY = Math.sin(radians),
    perpendicularX = -axisY,
    perpendicularY = axisX,
    centerX = effect.centerX * (width - 1),
    centerY = effect.centerY * (height - 1),
    // Keep the displacement bounded for tiny canvases while making the
    // wavelength control useful on larger layers.
    maxDisplacement = Math.max(
      0.5,
      Math.min(Math.min(width, height) * 0.45, wavelength * 0.5),
    ),
    displacementScale = amount * maxDisplacement;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (source[destination + 3] === 0) continue;
      const alongWave = (x - centerX) * axisX + (y - centerY) * axisY,
        displacement =
          Math.sin((alongWave / wavelength) * Math.PI * 2) * displacementScale,
        sample = sourcePixelBilinear(
          source,
          width,
          height,
          x + perpendicularX * displacement,
          y + perpendicularY * displacement,
        );
      if (sample[3] === 0) continue;
      output[destination] = sample[0];
      output[destination + 1] = sample[1];
      output[destination + 2] = sample[2];
      output[destination + 3] = source[destination + 3];
    }
  }
}

/** Apply a bounded rectangular-to-polar remap without mutating the source. */
function applyPolarCoordinates(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const strength = effect.amount / 100;
  const centreX = effect.centerX * (width - 1);
  const centreY = effect.centerY * (height - 1);
  const maxRadius = Math.max(1, Math.min(width, height) * 0.5);
  const radialExtent = Math.max(1 / 64, effect.radius / 64);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const dx = x - centreX;
      const dy = y - centreY;
      const distance = Math.min(1, Math.hypot(dx, dy) / maxRadius);
      const angle = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
      const sourceX = angle * (width - 1);
      const sourceY = Math.min(1, distance / radialExtent) * (height - 1);
      const sample = sourcePixelBilinear(
        source,
        width,
        height,
        x + (sourceX - x) * strength,
        y + (sourceY - y) * strength,
      );
      if (!sample[3]) continue;
      output[destination] = sample[0];
      output[destination + 1] = sample[1];
      output[destination + 2] = sample[2];
      output[destination + 3] = source[destination + 3];
    }
  }
}

/** Apply a Filter menu effect to an RGBA buffer without mutating its input. */
function applyShear(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  // A linear horizontal shear with a bounded displacement at either vertical
  // edge. This first stage deliberately keeps alpha/source bounds unchanged;
  // it is not a geometric canvas transform or Photoshop's editable curve.
  const shift = effect.radius * (effect.amount / 100);
  const direction = Math.sin((effect.angle * Math.PI) / 180);
  for (let y = 0; y < height; y += 1) {
    const relativeY = height === 1 ? 0 : (y / (height - 1) - effect.centerY) * 2;
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const sample = sourcePixelBilinear(
        source, width, height, x - shift * direction * relativeY, y,
      );
      if (!sample[3]) continue;
      output[destination] = sample[0];
      output[destination + 1] = sample[1];
      output[destination + 2] = sample[2];
    }
  }
}

/** Apply a bounded radial zigzag displacement without mutating the source. */
function applyZigZag(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const strength = effect.amount / 100;
  const centreX = effect.centerX * (width - 1);
  const centreY = effect.centerY * (height - 1);
  const wavelength = Math.max(1, effect.radius);
  const influenceRadius = Math.max(1, Math.min(width, height) * 0.7);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const dx = x - centreX;
      const dy = y - centreY;
      const distance = Math.hypot(dx, dy);
      const normalized = clamp(distance / influenceRadius, 0, 1);
      const wave = Math.sin((distance / wavelength) * Math.PI * 2) * strength * wavelength;
      const falloff = 1 - normalized;
      const scale = distance < 1e-6 ? 0 : (wave * falloff) / distance;
      const sample = sourcePixelBilinear(source, width, height, x + dx * scale, y + dy * scale);
      if (!sample[3]) continue;
      output[destination] = sample[0];
      output[destination + 1] = sample[1];
      output[destination + 2] = sample[2];
      output[destination + 3] = source[destination + 3];
    }
  }
}

/** Apply a bounded procedural displacement field without mutating the source. */
function applyDisplace(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const strength = effect.amount / 100;
  const centreX = effect.centerX * (width - 1);
  const centreY = effect.centerY * (height - 1);
  const wavelength = Math.max(1, effect.radius);
  const radians = (effect.angle * Math.PI) / 180;
  const axisX = Math.cos(radians);
  const axisY = Math.sin(radians);
  const maxDisplacement = Math.min(Math.min(width, height) * 0.35, wavelength);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const dx = x - centreX;
      const dy = y - centreY;
      const along = dx * axisX + dy * axisY;
      const across = -dx * axisY + dy * axisX;
      const fieldX = Math.sin((across / wavelength) * Math.PI * 2) * strength * maxDisplacement;
      const fieldY = Math.cos((along / wavelength) * Math.PI * 2) * strength * maxDisplacement;
      const sample = sourcePixelBilinear(source, width, height, x - fieldX, y - fieldY);
      if (!sample[3]) continue;
      output[destination] = sample[0];
      output[destination + 1] = sample[1];
      output[destination + 2] = sample[2];
      output[destination + 3] = source[destination + 3];
    }
  }
}

/** Apply a bounded stipple-cell approximation without mutating the source. */
function applyPointillize(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const cellSize = Math.max(1, effect.radius);
  const strength = effect.amount / 100;
  const dotRadius = Math.max(0.5, cellSize * 0.5 * strength);
  for (let y = 0; y < height; y += 1) {
    const cellY = Math.min(height - 1, Math.floor(y / cellSize) * cellSize + (cellSize - 1) * 0.5);
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const cellX = Math.min(width - 1, Math.floor(x / cellSize) * cellSize + (cellSize - 1) * 0.5);
      const distance = Math.hypot(x - cellX, y - cellY);
      const coverage = clamp(dotRadius - distance + 1, 0, 1);
      if (coverage <= 0) continue;
      const sample = sourcePixel(source, width, height, cellX, cellY);
      if (!sample[3]) continue;
      output[destination] = clampByte(source[destination] * (1 - coverage) + sample[0] * coverage);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - coverage) + sample[1] * coverage);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - coverage) + sample[2] * coverage);
      output[destination + 3] = source[destination + 3];
    }
  }
}

/**
 * Apply a bounded deterministic Picture Frame approximation.
 *
 * Photoshop's Render > Picture Frame exposes a larger set of frame styles
 * and foreground/background colour controls. PixelForge keeps this local
 * slice deliberately small: a seeded dark frame is composited inside the
 * existing canvas bounds, with width and opacity stored as editable metadata.
 * Only already-visible source pixels are touched, so alpha and transparent
 * RGB padding remain source-owned.
 */
function applyPictureFrame(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const thickness = Math.max(1, Math.min(64, Math.round(effect.radius)));
  const seed = effect.seed >>> 0;
  // Derive a stable, restrained colour from the seed. A frame is intentionally
  // darker than a neutral canvas, while changing the seed still gives users a
  // reproducible variation without persisting generated pixels.
  let hash = (Math.imul(seed ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822519) >>> 0;
  const frameColor: [number, number, number] = [
    20 + ((hash >>> 16) & 0x3f),
    26 + ((hash >>> 8) & 0x3f),
    36 + (hash & 0x5f),
  ];
  const highlight: [number, number, number] = [
    Math.min(255, frameColor[0] + 34),
    Math.min(255, frameColor[1] + 34),
    Math.min(255, frameColor[2] + 40),
  ];
  const innerBand = Math.max(1, Math.round(thickness * 0.12));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const alpha = source[destination + 3];
      if (!alpha) continue;
      const distance = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (distance >= thickness) continue;
      const edgeDistance = thickness - 1 - distance;
      // A narrow highlight on the inside edge gives the frame a readable
      // bevel, while the broad outer band remains a deterministic solid fill.
      const color = edgeDistance < innerBand ? highlight : frameColor;
      const edgeStrength = strength * clamp(1 - distance / Math.max(1, thickness), 0, 1);
      output[destination] = clampByte(source[destination] * (1 - edgeStrength) + color[0] * edgeStrength);
      output[destination + 1] = clampByte(source[destination + 1] * (1 - edgeStrength) + color[1] * edgeStrength);
      output[destination + 2] = clampByte(source[destination + 2] * (1 - edgeStrength) + color[2] * edgeStrength);
      output[destination + 3] = alpha;
    }
  }
}

/**
 * Apply a bounded, seeded approximation of Photoshop Lens Flare.
 *
 * The renderer adds a soft source-aligned glow, a narrow star streak and a
 * handful of seeded ghost rings.  It intentionally stays local and
 * source-safe: pixels are never moved, alpha is copied byte-for-byte and
 * fully transparent RGB padding remains owned by the immutable source.
 * `radius` scales the flare relative to the shorter canvas edge while
 * `centerX`, `centerY`, `angle`, `amount` and `seed` remain editable metadata.
 */
function applyLensFlare(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const seed = effect.seed >>> 0;
  const hash = (value: number): number => {
    let next = Math.imul((value | 0) ^ seed, 374761393);
    next = Math.imul(next ^ (next >>> 13), 1274126177);
    return ((next ^ (next >>> 16)) >>> 0) / 0xffffffff;
  };
  const hue = hash(17) * Math.PI * 2;
  const palette = (phase: number): [number, number, number] => {
    // A deterministic three-phase sine palette produces subtle colour ghosts
    // without requiring colour-profile or random APIs in the render path.
    const red = 0.5 + 0.5 * Math.sin(hue + phase);
    const green = 0.5 + 0.5 * Math.sin(hue + phase + (Math.PI * 2) / 3);
    const blue = 0.5 + 0.5 * Math.sin(hue + phase + (Math.PI * 4) / 3);
    return [red, green, blue];
  };
  const centreX = clamp(effect.centerX, 0, 1) * Math.max(0, width - 1);
  const centreY = clamp(effect.centerY, 0, 1) * Math.max(0, height - 1);
  const radians = (effect.angle * Math.PI) / 180;
  const axisX = Math.cos(radians);
  const axisY = Math.sin(radians);
  const normalX = -axisY;
  const normalY = axisX;
  const spread = Math.max(
    6,
    (Math.max(1, Math.min(64, effect.radius)) / 64) * Math.min(width, height) * 0.92,
  );
  const ringWidth = Math.max(1.5, spread * 0.035);
  const coreWidth = Math.max(1.5, spread * 0.075);
  const ghosts = [-0.84, -0.48, 0.28, 0.63].map((position, index) => ({
    position: position * spread,
    radius: spread * (0.06 + hash(index + 31) * 0.08),
    intensity: 0.22 + hash(index + 61) * 0.18,
    colour: palette(index * 0.9 + 0.4),
  }));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = source[offset + 3];
      if (!alpha) continue;
      const dx = x - centreX;
      const dy = y - centreY;
      const along = dx * axisX + dy * axisY;
      const across = dx * normalX + dy * normalY;
      const distance = Math.hypot(dx, dy);
      const core = Math.exp(-((distance / coreWidth) ** 2)) * 1.35;
      const ringDistance = Math.abs(distance - spread * 0.34);
      const ring = Math.exp(-((ringDistance / ringWidth) ** 2)) * 0.5;
      const star = Math.exp(-((across / Math.max(1, spread * 0.012)) ** 2)) *
        Math.exp(-((along / Math.max(1, spread * 0.9)) ** 2)) * 0.22;
      const mainColour = palette(0);
      let red = core * 1.05 + ring * mainColour[0] + star;
      let green = core * 0.92 + ring * mainColour[1] + star * 0.88;
      let blue = core * 0.7 + ring * mainColour[2] + star * 0.72;
      for (const ghost of ghosts) {
        const ghostAlong = along - ghost.position;
        const ghostDistance = Math.hypot(ghostAlong, across);
        const glow = Math.exp(-((ghostDistance / Math.max(1.5, ghost.radius)) ** 2)) * ghost.intensity;
        red += glow * ghost.colour[0];
        green += glow * ghost.colour[1];
        blue += glow * ghost.colour[2];
      }
      const flare = Math.min(1.8, Math.max(0, red + green + blue) / 2.2) * strength;
      if (flare <= 0) continue;
      output[offset] = clampByte(source[offset] + red * 180 * flare);
      output[offset + 1] = clampByte(source[offset + 1] + green * 180 * flare);
      output[offset + 2] = clampByte(source[offset + 2] + blue * 180 * flare);
      output[offset + 3] = alpha;
    }
  }
}

/** Apply a bounded radial lens-correction approximation without mutating the source. */
function applyLensCorrection(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
): void {
  const centreX = effect.centerX * (width - 1);
  const centreY = effect.centerY * (height - 1);
  const influenceRadius = Math.max(1, Math.min(width, height) * 0.7 * (effect.radius / 64));
  const strength = (effect.amount / 100) * 0.45 * (effect.lensDirection === 'outward' ? -1 : 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      if (!source[destination + 3]) continue;
      const dx = x - centreX;
      const dy = y - centreY;
      const normalized = clamp(Math.hypot(dx, dy) / influenceRadius, 0, 1);
      const scale = 1 - strength * normalized * normalized;
      const sample = sourcePixelBilinear(
        source,
        width,
        height,
        centreX + dx * scale,
        centreY + dy * scale,
      );
      if (!sample[3]) continue;
      output[destination] = sample[0];
      output[destination + 1] = sample[1];
      output[destination + 2] = sample[2];
      output[destination + 3] = source[destination + 3];
    }
  }
}

/**
 * Apply a bounded, nondestructive Unsharp Mask.
 *
 * The blur radius and amount stay in filter metadata. The source alpha and
 * transparent RGB padding remain byte-for-byte stable; only visible colour
 * channels receive the high-frequency contribution.
 */
function applyUnsharpMask(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  amount: number,
): void {
  const blurred = new Uint8ClampedArray(source.length);
  applyGaussianBlur(source, width, height, radius, blurred, 1);
  const strength = clamp(amount, 0, 100) / 100;
  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3];
    output[offset + 3] = alpha;
    if (!alpha) continue;
    output[offset] = clampByte(source[offset] + (source[offset] - blurred[offset]) * strength);
    output[offset + 1] = clampByte(source[offset + 1] + (source[offset + 1] - blurred[offset + 1]) * strength);
    output[offset + 2] = clampByte(source[offset + 2] + (source[offset + 2] - blurred[offset + 2]) * strength);
  }
}

/**
 * Apply Photoshop-style Sharpen More as two bounded unsharp passes.
 *
 * This is intentionally a distinct effect type rather than an alias for
 * Unsharp Mask: repeated high-frequency contributions produce a different,
 * deterministic result while retaining the same source-safe alpha contract.
 */
function applySharpenMore(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  amount: number,
): void {
  const intermediate = new Uint8ClampedArray(source);
  applyUnsharpMask(source, width, height, radius, intermediate, amount);
  applyUnsharpMask(intermediate, width, height, radius, output, amount);
}

/**
 * Apply a bounded edge-weighted sharpen. Unlike Unsharp Mask, the
 * high-frequency contribution is gated by a local Sobel luminance magnitude,
 * so broad flat regions remain stable while contrast boundaries receive the
 * editable sharpen amount. Alpha and transparent RGB padding stay source
 * owned and the source buffer remains immutable.
 */
function applySharpenEdges(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  amount: number,
): void {
  const blurred = new Uint8ClampedArray(source.length);
  applyGaussianBlur(source, width, height, radius, blurred, 1);
  const strength = clamp(amount, 0, 100) / 100;
  const lumaAt = (x: number, y: number) => {
    const sx = Math.max(0, Math.min(width - 1, x));
    const sy = Math.max(0, Math.min(height - 1, y));
    const offset = (sy * width + sx) * 4;
    return source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = source[offset + 3];
      output[offset + 3] = alpha;
      if (!alpha) continue;
      const gx =
        -lumaAt(x - 1, y - 1) + lumaAt(x + 1, y - 1) -
        2 * lumaAt(x - 1, y) + 2 * lumaAt(x + 1, y) -
        lumaAt(x - 1, y + 1) + lumaAt(x + 1, y + 1);
      const gy =
        -lumaAt(x - 1, y - 1) - 2 * lumaAt(x, y - 1) - lumaAt(x + 1, y - 1) +
        lumaAt(x - 1, y + 1) + 2 * lumaAt(x, y + 1) + lumaAt(x + 1, y + 1);
      const edgeWeight = clamp(Math.hypot(gx, gy) / 180, 0, 1);
      const effective = strength * edgeWeight;
      output[offset] = clampByte(source[offset] + (source[offset] - blurred[offset]) * effective);
      output[offset + 1] = clampByte(source[offset + 1] + (source[offset + 1] - blurred[offset + 1]) * effective);
      output[offset + 2] = clampByte(source[offset + 2] + (source[offset + 2] - blurred[offset + 2]) * effective);
    }
  }
}

/**
 * Apply a bounded Smart Sharpen approximation using an edge-preserving
 * bilateral reference. Tonal surfaces receive little high-frequency gain,
 * while genuine local contrast boundaries receive a stronger response.
 */
function applySmartSharpen(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  amount: number,
): void {
  const reference = new Uint8ClampedArray(source.length);
  applySmartBlur(source, width, height, radius, reference, 1);
  const strength = clamp(amount, 0, 100) / 100;
  for (let offset = 0; offset < source.length; offset += 4) {
    const alpha = source[offset + 3];
    output[offset + 3] = alpha;
    if (!alpha) continue;
    const sourceLuma = source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
    const referenceLuma = reference[offset] * 0.2126 + reference[offset + 1] * 0.7152 + reference[offset + 2] * 0.0722;
    const contrast = clamp(Math.abs(sourceLuma - referenceLuma) / 24, 0, 1);
    const effective = strength * contrast;
    output[offset] = clampByte(source[offset] + (source[offset] - reference[offset]) * effective);
    output[offset + 1] = clampByte(source[offset + 1] + (source[offset + 1] - reference[offset + 1]) * effective);
    output[offset + 2] = clampByte(source[offset + 2] + (source[offset + 2] - reference[offset + 2]) * effective);
  }
}

/**
 * Apply a bounded Tilt-Shift focal-band blur.
 *
 * `centerX`/`centerY` locate the middle of the focus line and `angle` rotates
 * that line clockwise from horizontal. The sharp band and its transition are
 * normalized against the maximum cross-axis extent, so the same metadata
 * behaves consistently on portrait, landscape and rotated images. This is a
 * local focal-plane approximation: it does not infer depth, synthesize bokeh,
 * or expand the canvas. Box-blur's alpha-weighted source sampling keeps
 * transparent RGB padding and source alpha byte-for-byte stable.
 */
function applyTiltShift(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  effect: FilterEffects,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const settings = effect.tiltShift ?? DEFAULT_TILT_SHIFT_SETTINGS;
  const radians = (effect.angle * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerPixelX = clamp(effect.centerX, 0, 1) * (width - 1);
  const centerPixelY = clamp(effect.centerY, 0, 1) * (height - 1);
  // The normal points across the focus line. The maximum distance from the
  // centre to a canvas corner makes focusWidth/feather aspect-ratio safe.
  const normalX = -sine;
  const normalY = cosine;
  const crossExtent = Math.max(
    1,
    Math.abs(normalX) * Math.max(1, width - 1) * 0.5 +
      Math.abs(normalY) * Math.max(1, height - 1) * 0.5,
  );
  const halfBand = clamp(settings.focusWidth, 0.05, 0.8) * 0.5;
  const feather = Math.max(0.05, clamp(settings.feather, 0.05, 0.8));
  applyBoxBlur(source, width, height, effect.radius, output, strength, (x, y) => {
    const distance = Math.abs(
      ((x - centerPixelX) * normalX + (y - centerPixelY) * normalY) / crossExtent,
    );
    return clamp((distance - halfBand) / feather, 0, 1);
  });
}

export function applyFilterEffectsPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  value: Partial<FilterEffects> | undefined,
): Uint8ClampedArray {
  validateDimensions(data, width, height);
  const effect = effectiveFilterEffects(value);
  if (isNeutralFilterEffects(effect)) return new Uint8ClampedArray(data);
  if (effect.type === 'deinterlace')
    return deinterlacePixels(data, width, height, effectiveDeinterlaceSettings(effect.deinterlace), effect.amount);
  const output = new Uint8ClampedArray(data);
  const strength = effect.amount / 100;
  if (effect.type === 'average-blur') {
    applyAverageBlur(data, width, height, output, strength);
  } else if (effect.type === 'blur-more') {
    // Photoshop's one-click Blur More is a stronger, bounded box blur. Keep
    // the source-safe renderer and metadata contract while doubling radius.
    applyBoxBlur(data, width, height, Math.min(64, effect.radius * 2), output, strength);
  } else if (effect.type === 'field-blur') {
    applyFieldBlur(data, width, height, effect, output);
  } else if (effect.type === 'box-blur') {
    applyBoxBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'gaussian-blur') {
    applyGaussianBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'sharpen') {
    applyUnsharpMask(data, width, height, effect.radius, output, effect.amount);
  } else if (effect.type === 'unsharp-mask') {
    applyUnsharpMask(data, width, height, effect.radius, output, effect.amount);
  } else if (effect.type === 'sharpen-more') {
    applySharpenMore(data, width, height, effect.radius, output, effect.amount);
  } else if (effect.type === 'sharpen-edges') {
    applySharpenEdges(data, width, height, effect.radius, output, effect.amount);
  } else if (effect.type === 'smart-sharpen') {
    applySmartSharpen(data, width, height, effect.radius, output, effect.amount);
  } else if (effect.type === 'smart-blur') {
    applySmartBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'surface-blur') {
    applySurfaceBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'shape-blur') {
    applyShapeBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'lens-blur') {
    applyLensBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'iris-blur') {
    applyIrisBlur(
      data,
      width,
      height,
      effect.radius,
      effect.centerX,
      effect.centerY,
      output,
      strength,
    );
  } else if (effect.type === 'motion-blur') {
    applyMotionBlur(data, width, height, effect.radius, effect.angle, output, strength);
  } else if (effect.type === 'radial-blur') {
    applyRadialBlur(
      data,
      width,
      height,
      effect.radius,
      effect.centerX,
      effect.centerY,
      output,
      strength,
    );
  } else if (effect.type === 'spin-blur') {
    applySpinBlur(
      data,
      width,
      height,
      effect.radius,
      effect.centerX,
      effect.centerY,
      output,
      strength,
      effect.spinEllipse,
    );
  } else if (effect.type === 'path-blur') {
    applyPathBlur(
      data,
      width,
      height,
      effect.radius,
      effect.angle,
      effect.centerX,
      effect.centerY,
      output,
      strength,
      effect.path,
      effect.pathCentered,
      effect.pathTaper,
    );
  } else if (effect.type === 'mosaic') {
    applyMosaic(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'crystallize') {
    applyCrystallize(data, width, height, effect.radius, effect.seed, output, strength);
  } else if (effect.type === 'fragment') {
    applyFragment(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'facet') {
    applyFacet(data, width, height, effect.radius, effect.seed, output, strength);
  } else if (effect.type === 'color-halftone') {
    applyColorHalftone(data, width, height, effect, output, strength);
  } else if (effect.type === 'ntsc-colors') {
    applyNtscColors(data, output, strength);
  } else if (effect.type === 'mezzotint') {
    applyMezzotint(data, width, height, effect, output, strength);
  } else if (effect.type === 'fibers') {
    applyFibers(data, width, height, effect, output, strength);
  } else if (effect.type === 'tilt-shift') {
    applyTiltShift(data, width, height, effect, output, strength);
  } else if (effect.type === 'wave') {
    applyWave(data, width, height, effect, output);
  } else if (effect.type === 'polar-coordinates') {
    applyPolarCoordinates(data, width, height, effect, output);
  } else if (effect.type === 'shear') {
    applyShear(data, width, height, effect, output);
  } else if (effect.type === 'zigzag') {
    applyZigZag(data, width, height, effect, output);
  } else if (effect.type === 'displace') {
    applyDisplace(data, width, height, effect, output);
  } else if (effect.type === 'pointillize') {
    applyPointillize(data, width, height, effect, output);
  } else if (effect.type === 'picture-frame') {
    applyPictureFrame(data, width, height, effect, output, strength);
  } else if (effect.type === 'tree') {
    applyTree(data, width, height, effect, output, strength);
  } else if (effect.type === 'clouds') {
    applyClouds(data, width, height, effect, output, strength);
  } else if (effect.type === 'difference-clouds') {
    applyDifferenceClouds(data, width, height, effect, output, strength);
  } else if (effect.type === 'flame') {
    applyFlame(data, width, height, effect, output, strength);
  } else if (effect.type === 'find-edges') {
    applyFindEdges(data, width, height, output, strength);
  } else if (effect.type === 'emboss') {
    applyEmboss(data, width, height, effect, output, strength);
  } else if (effect.type === 'lens-correction') {
    applyLensCorrection(data, width, height, effect, output);
  } else if (effect.type === 'lens-flare') {
    applyLensFlare(data, width, height, effect, output, strength);

  } else {
    applyDistort(data, width, height, effect, output);
  }
  return output;
}

/** Apply an effect to an existing canvas surface, preserving its dimensions. */
export function applyFilterEffects(
  canvas: HTMLCanvasElement,
  value: Partial<FilterEffects> | undefined,
): HTMLCanvasElement {
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height),
    result = applyFilterEffectsPixels(image.data, canvas.width, canvas.height, value);
  image.data.set(result);
  context.putImageData(image, 0, 0);
  return canvas;
}
