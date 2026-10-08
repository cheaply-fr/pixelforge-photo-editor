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
  'motion-blur',
  'radial-blur',
  'field-blur',
  'tilt-shift',
  'mosaic',
  'color-halftone',
  'pinch',
  'ripple',
  'spherize',
  'twirl',
  'wave',
] as const;
export type FilterEffectType = (typeof FILTER_EFFECT_TYPES)[number];

export type FilterEffects = {
  type: FilterEffectType;
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
  return { type, amount, radius, angle, centerX, centerY, seed };
}

export function validFilterEffects(value: unknown): value is FilterEffects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const effect = value as Partial<FilterEffects>;
  return (
    FILTER_EFFECT_TYPES.includes(effect.type as FilterEffectType) &&
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
    (effect.type === 'twirl' && effect.angle === 0) ||
    (effect.type !== 'twirl' && effect.radius === 0)
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

/** Apply a Filter menu effect to an RGBA buffer without mutating its input. */
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
  } else if (effect.type === 'box-blur' || effect.type === 'field-blur') {
    applyBoxBlur(data, width, height, effect.radius, output, strength);
  } else if (effect.type === 'gaussian-blur') {
    applyGaussianBlur(data, width, height, effect.radius, output, strength);
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
  } else if (effect.type === 'mosaic') {
    applyMosaic(data, width, height, effect.radius, output, strength);
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
