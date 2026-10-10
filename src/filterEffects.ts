/**
 * Deterministic, nondestructive local Filter menu effects.
 *
 * Effects operate on an RGBA render buffer and never mutate the input. They
 * intentionally keep alpha byte-for-byte stable, and leave transparent RGB
 * padding untouched. The document stores this small parameter object so a
 * filter remains editable and source assets remain immutable.
 */

export const FILTER_EFFECT_TYPES = [
  'none',
  'average-blur',
  'blur-more',
  'box-blur',
  'gaussian-blur',
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
  'color-halftone',
  'pointillize',
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

export type FilterEffects = {
  type: FilterEffectType;
  /** Legacy lens corrections default to inward source sampling. */
  lensDirection?: 'inward' | 'outward';
  /** Strength as a percentage. */
  amount: number;
  /** Blur radius, distortion wavelength, or mosaic cell size, in source pixels. */
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
    (effect.type !== 'twirl' && effect.type !== 'field-blur' && effect.radius === 0) ||
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

function applyColorHalftone(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  output: Uint8ClampedArray,
  strength: number,
): void {
  const cell = Math.max(2, Math.min(32, Math.round(radius)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4,
        alpha = source[offset + 3];
      if (alpha === 0) continue;
      const originX = Math.floor(x / cell) * cell,
        originY = Math.floor(y / cell) * cell,
        sample = sourcePixel(source, width, height, originX + cell / 2, originY + cell / 2),
        distance = Math.hypot((x - (originX + cell / 2)) / cell, (y - (originY + cell / 2)) / cell),
        luminance = (0.2126 * sample[0] + 0.7152 * sample[1] + 0.0722 * sample[2]) / 255,
        ink = distance < (1 - luminance) * 0.82 ? 1 : 0,
        target: [number, number, number, number] = ink ? [sample[0], sample[1], sample[2], alpha] : [255, 255, 255, alpha];
      blendPixel(output, offset, target, strength);
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

export function applyFilterEffectsPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  value: Partial<FilterEffects> | undefined,
): Uint8ClampedArray {
  validateDimensions(data, width, height);
  const effect = effectiveFilterEffects(value);
  if (isNeutralFilterEffects(effect)) return new Uint8ClampedArray(data);
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
  } else if (effect.type === 'color-halftone') {
    applyColorHalftone(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'tilt-shift') {
    const center = effect.centerY * (height - 1),
      band = Math.max(1, height * 0.18),
      maxDistance = Math.max(1, height * 0.5);
    applyBoxBlur(data, width, height, effect.radius, output, strength, (_x, y) =>
      clamp((Math.abs(y - center) - band) / maxDistance, 0, 1),
    );
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
  } else if (effect.type === 'lens-correction') {
    applyLensCorrection(data, width, height, effect, output);
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
